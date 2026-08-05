import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../auth/types/auth-user.type';
import { PrismaService } from '../prisma/prisma.service';
import {
  ChatModuleId,
  isChatModule,
  modulesForRoles,
} from './chat.constants';
import {
  CreateBroadcastDto,
  CreateConversationDto,
  SendMessageDto,
} from './dto/chat.dto';
import { Broadcast, BroadcastDocument } from './schemas/broadcast.schema';
import {
  Conversation,
  ConversationDocument,
} from './schemas/conversation.schema';
import { Message, MessageDocument } from './schemas/message.schema';
import { Presence, PresenceDocument } from './schemas/presence.schema';

export type ChatEmitter = {
  emitToUsers: (userIds: number[], event: string, payload: unknown) => void;
  emitToModules: (modules: string[], event: string, payload: unknown) => void;
};

function actorLabel(user: AuthUser): string {
  return (
    [user.firstName, user.lastName].filter(Boolean).join(' ') ||
    user.email ||
    'User'
  );
}

@Injectable()
export class ChatService {
  private emitter: ChatEmitter | null = null;

  constructor(
    @InjectModel(Conversation.name)
    private readonly conversations: Model<ConversationDocument>,
    @InjectModel(Message.name)
    private readonly messages: Model<MessageDocument>,
    @InjectModel(Broadcast.name)
    private readonly broadcasts: Model<BroadcastDocument>,
    @InjectModel(Presence.name)
    private readonly presence: Model<PresenceDocument>,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  setEmitter(emitter: ChatEmitter) {
    this.emitter = emitter;
  }

  private assertParticipant(conv: ConversationDocument, userId: number) {
    if (!conv.participantUserIds.includes(userId)) {
      throw new ForbiddenException('Not a participant in this conversation');
    }
  }

  private mapConversation(doc: ConversationDocument, userId: number) {
    const unreadMap =
      doc.unreadBy instanceof Map
        ? Object.fromEntries(doc.unreadBy.entries())
        : ((doc.unreadBy as unknown as Record<string, number>) ?? {});
    return {
      id: String(doc._id),
      type: doc.type,
      moduleScope: doc.moduleScope,
      group: doc.group,
      title: doc.title,
      participantUserIds: doc.participantUserIds,
      patientId: doc.patientId ?? null,
      patientName: doc.patientName ?? null,
      hospitalNo: doc.hospitalNo ?? null,
      urgent: doc.urgent,
      archived: doc.archived,
      lastMessage: doc.lastMessage,
      lastMessageAt: doc.lastMessageAt?.toISOString() ?? null,
      unread: unreadMap[String(userId)] ?? 0,
      createdById: doc.createdById ?? null,
      createdBy: doc.createdBy ?? null,
      createdAt:
        (doc as ConversationDocument & { createdAt?: Date }).createdAt?.toISOString() ??
        null,
    };
  }

  private mapMessage(doc: MessageDocument) {
    return {
      id: String(doc._id),
      conversationId: String(doc.conversationId),
      senderUserId: doc.senderUserId,
      senderName: doc.senderName,
      text: doc.text,
      urgent: doc.urgent,
      mentions: doc.mentions ?? [],
      attachmentUrl: doc.attachmentUrl ?? null,
      readBy: doc.readBy ?? [],
      edited: doc.edited,
      createdAt:
        (doc as MessageDocument & { createdAt?: Date }).createdAt?.toISOString() ??
        null,
    };
  }

  async listConversations(
    user: AuthUser,
    params?: {
      module?: string;
      tab?: string;
      q?: string;
      page?: number;
      limit?: number;
    },
  ) {
    const page = Math.max(1, params?.page ?? 1);
    const limit = Math.min(100, Math.max(1, params?.limit ?? 50));
    const tab = params?.tab ?? 'inbox';
    const filter: Record<string, unknown> = {
      participantUserIds: user.id,
    };

    if (tab === 'archived') {
      filter.archived = true;
    } else {
      filter.archived = { $ne: true };
    }
    if (tab === 'urgent') filter.urgent = true;
    if (tab === 'patient') filter.type = 'patient';
    if (tab === 'department') filter.type = 'department';
    if (tab === 'broadcasts') filter.type = 'broadcast';
    if (params?.module && isChatModule(params.module)) {
      filter.moduleScope = params.module;
    }
    if (params?.q?.trim()) {
      const q = params.q.trim();
      filter.$or = [
        { title: { $regex: q, $options: 'i' } },
        { patientName: { $regex: q, $options: 'i' } },
        { hospitalNo: { $regex: q, $options: 'i' } },
        { lastMessage: { $regex: q, $options: 'i' } },
      ];
    }

    const [rows, total] = await Promise.all([
      this.conversations
        .find(filter)
        .sort({ lastMessageAt: -1, createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .exec(),
      this.conversations.countDocuments(filter),
    ]);

    return {
      items: rows.map((r) => this.mapConversation(r, user.id)),
      meta: { page, limit, total },
    };
  }

  async createConversation(dto: CreateConversationDto, user: AuthUser) {
    const participants = [
      ...new Set([user.id, ...dto.participantUserIds.filter((id) => id > 0)]),
    ];
    if (participants.length < 2 && dto.type === 'direct') {
      throw new BadRequestException('Direct chat needs another participant');
    }

    const userModules = modulesForRoles(user.roles);
    const moduleScope =
      dto.moduleScope?.filter(isChatModule) ??
      (userModules.length ? userModules : (['doctor'] as ChatModuleId[]));

    const label = actorLabel(user);
    const created = await this.conversations.create({
      type: dto.type,
      moduleScope,
      group: dto.group,
      title: dto.title.trim(),
      participantUserIds: participants,
      patientId: dto.patientId,
      patientName: dto.patientName,
      hospitalNo: dto.hospitalNo,
      urgent: dto.urgent ?? false,
      archived: false,
      lastMessage: dto.initialMessage?.trim() ?? '',
      lastMessageAt: dto.initialMessage ? new Date() : undefined,
      unreadBy: Object.fromEntries(
        participants
          .filter((id) => id !== user.id)
          .map((id) => [String(id), dto.initialMessage ? 1 : 0]),
      ),
      createdById: user.id,
      createdBy: label,
    });

    let firstMessage = null;
    if (dto.initialMessage?.trim()) {
      firstMessage = await this.messages.create({
        conversationId: created._id,
        senderUserId: user.id,
        senderName: label,
        text: dto.initialMessage.trim(),
        urgent: dto.urgent ?? false,
        mentions: [],
        readBy: [user.id],
      });
      this.emitter?.emitToUsers(participants, 'chat:message', {
        conversation: this.mapConversation(created, user.id),
        message: this.mapMessage(firstMessage),
      });
    }

    this.emitter?.emitToUsers(participants, 'chat:conversation-updated', {
      conversation: this.mapConversation(created, user.id),
    });

    await this.audit.log({
      type: 'comms:conversation-create',
      entity: 'chat_conversations',
      entityId: String(created._id),
      userId: user.id,
      createdBy: label,
      item: `Conversation created: ${created.title}`,
      newValue: { type: created.type, participants },
    });

    return {
      conversation: this.mapConversation(created, user.id),
      message: firstMessage ? this.mapMessage(firstMessage) : null,
    };
  }

  async listMessages(
    conversationId: string,
    user: AuthUser,
    params?: { page?: number; limit?: number },
  ) {
    if (!Types.ObjectId.isValid(conversationId)) {
      throw new NotFoundException('Conversation not found');
    }
    const conv = await this.conversations.findById(conversationId).exec();
    if (!conv) throw new NotFoundException('Conversation not found');
    this.assertParticipant(conv, user.id);

    const page = Math.max(1, params?.page ?? 1);
    const limit = Math.min(200, Math.max(1, params?.limit ?? 50));
    const filter = {
      conversationId: conv._id,
      deletedFlag: { $ne: true },
    };
    const [rows, total] = await Promise.all([
      this.messages
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .exec(),
      this.messages.countDocuments(filter),
    ]);

    return {
      items: rows.reverse().map((r) => this.mapMessage(r)),
      meta: { page, limit, total },
      conversation: this.mapConversation(conv, user.id),
    };
  }

  async sendMessage(
    conversationId: string,
    dto: SendMessageDto,
    user: AuthUser,
  ) {
    if (!Types.ObjectId.isValid(conversationId)) {
      throw new NotFoundException('Conversation not found');
    }
    const conv = await this.conversations.findById(conversationId).exec();
    if (!conv) throw new NotFoundException('Conversation not found');
    this.assertParticipant(conv, user.id);
    if (conv.archived) {
      throw new BadRequestException('Conversation is archived');
    }

    const label = actorLabel(user);
    const msg = await this.messages.create({
      conversationId: conv._id,
      senderUserId: user.id,
      senderName: label,
      text: dto.text.trim(),
      urgent: dto.urgent ?? false,
      mentions: dto.mentions ?? [],
      attachmentUrl: dto.attachmentUrl,
      readBy: [user.id],
    });

    const unreadUpdate: Record<string, number> = {};
    for (const pid of conv.participantUserIds) {
      if (pid === user.id) {
        unreadUpdate[`unreadBy.${pid}`] = 0;
      } else {
        const prev =
          conv.unreadBy instanceof Map
            ? conv.unreadBy.get(String(pid)) ?? 0
            : ((conv.unreadBy as unknown as Record<string, number>)?.[
                String(pid)
              ] ?? 0);
        unreadUpdate[`unreadBy.${pid}`] = prev + 1;
      }
    }

    await this.conversations.updateOne(
      { _id: conv._id },
      {
        $set: {
          lastMessage: dto.text.trim().slice(0, 500),
          lastMessageAt: new Date(),
          urgent: dto.urgent ? true : conv.urgent,
          ...unreadUpdate,
        },
      },
    );

    const refreshed = await this.conversations.findById(conv._id).exec();
    const payload = {
      conversation: refreshed
        ? this.mapConversation(refreshed, user.id)
        : this.mapConversation(conv, user.id),
      message: this.mapMessage(msg),
    };
    this.emitter?.emitToUsers(
      conv.participantUserIds,
      'chat:message',
      payload,
    );
    this.emitter?.emitToUsers(
      conv.participantUserIds,
      'chat:conversation-updated',
      { conversation: payload.conversation },
    );

    return payload;
  }

  async markRead(conversationId: string, user: AuthUser) {
    if (!Types.ObjectId.isValid(conversationId)) {
      throw new NotFoundException('Conversation not found');
    }
    const conv = await this.conversations.findById(conversationId).exec();
    if (!conv) throw new NotFoundException('Conversation not found');
    this.assertParticipant(conv, user.id);

    await this.conversations.updateOne(
      { _id: conv._id },
      { $set: { [`unreadBy.${user.id}`]: 0 } },
    );
    await this.messages.updateMany(
      {
        conversationId: conv._id,
        readBy: { $ne: user.id },
        deletedFlag: { $ne: true },
      },
      { $addToSet: { readBy: user.id } },
    );

    this.emitter?.emitToUsers(conv.participantUserIds, 'chat:read', {
      conversationId,
      userId: user.id,
    });

    const refreshed = await this.conversations.findById(conv._id).exec();
    return {
      conversation: refreshed
        ? this.mapConversation(refreshed, user.id)
        : this.mapConversation(conv, user.id),
    };
  }

  async archive(conversationId: string, user: AuthUser) {
    if (!Types.ObjectId.isValid(conversationId)) {
      throw new NotFoundException('Conversation not found');
    }
    const conv = await this.conversations.findById(conversationId).exec();
    if (!conv) throw new NotFoundException('Conversation not found');
    this.assertParticipant(conv, user.id);
    conv.archived = true;
    await conv.save();
    this.emitter?.emitToUsers(
      conv.participantUserIds,
      'chat:conversation-updated',
      { conversation: this.mapConversation(conv, user.id) },
    );
    return { conversation: this.mapConversation(conv, user.id) };
  }

  async createBroadcast(dto: CreateBroadcastDto, user: AuthUser) {
    const label = actorLabel(user);
    const modules =
      dto.moduleScope?.filter(isChatModule) ?? modulesForRoles(user.roles);
    const broadcast = await this.broadcasts.create({
      target: dto.target.trim(),
      moduleScope: modules,
      priority: dto.priority,
      message: dto.message.trim(),
      patientName: dto.patientName,
      expiry: dto.expiry ? new Date(dto.expiry) : undefined,
      sentByUserId: user.id,
      sentBy: label,
    });

    const conv = await this.conversations.create({
      type: 'broadcast',
      moduleScope: modules,
      group: 'Management',
      title: `Broadcast · ${dto.target}`,
      participantUserIds: [user.id],
      patientName: dto.patientName,
      urgent: dto.priority !== 'Normal',
      archived: false,
      lastMessage: dto.message.trim().slice(0, 500),
      lastMessageAt: new Date(),
      unreadBy: {},
      createdById: user.id,
      createdBy: label,
    });

    await this.messages.create({
      conversationId: conv._id,
      senderUserId: user.id,
      senderName: label,
      text: dto.message.trim(),
      urgent: dto.priority !== 'Normal',
      mentions: [],
      readBy: [user.id],
    });

    broadcast.conversationId = String(conv._id);
    await broadcast.save();

    const payload = {
      id: String(broadcast._id),
      target: broadcast.target,
      moduleScope: broadcast.moduleScope,
      priority: broadcast.priority,
      message: broadcast.message,
      patientName: broadcast.patientName ?? null,
      expiry: broadcast.expiry?.toISOString() ?? null,
      sentBy: broadcast.sentBy,
      sentByUserId: broadcast.sentByUserId,
      conversationId: broadcast.conversationId,
      sentAt:
        (broadcast as BroadcastDocument & { createdAt?: Date }).createdAt?.toISOString() ??
        new Date().toISOString(),
    };

    this.emitter?.emitToModules(modules, 'chat:broadcast', payload);

    await this.audit.log({
      type: 'comms:broadcast',
      entity: 'chat_broadcasts',
      entityId: String(broadcast._id),
      userId: user.id,
      createdBy: label,
      item: `Broadcast to ${dto.target}: ${dto.priority}`,
      newValue: payload,
    });

    return { broadcast: payload };
  }

  async listBroadcasts(params?: { page?: number; limit?: number }) {
    const page = Math.max(1, params?.page ?? 1);
    const limit = Math.min(100, Math.max(1, params?.limit ?? 50));
    const [rows, total] = await Promise.all([
      this.broadcasts
        .find()
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .exec(),
      this.broadcasts.countDocuments(),
    ]);
    return {
      items: rows.map((b) => ({
        id: String(b._id),
        target: b.target,
        moduleScope: b.moduleScope,
        priority: b.priority,
        message: b.message,
        patientName: b.patientName ?? null,
        expiry: b.expiry?.toISOString() ?? null,
        sentBy: b.sentBy,
        sentByUserId: b.sentByUserId,
        conversationId: b.conversationId ?? null,
        sentAt:
          (b as BroadcastDocument & { createdAt?: Date }).createdAt?.toISOString() ??
          null,
      })),
      meta: { page, limit, total },
    };
  }

  async directory(params?: {
    q?: string;
    module?: string;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(1, params?.page ?? 1);
    const limit = Math.min(100, Math.max(1, params?.limit ?? 40));
    const term = params?.q?.trim();
    const where: {
      OR?: object[];
      LOCK_ACCOUNT?: { not: string };
    } = {
      LOCK_ACCOUNT: { not: 'Y' },
    };
    if (term) {
      where.OR = [
        { USER_NAME: { contains: term, mode: 'insensitive' } },
        { EMAIL_ADDRESS: { contains: term, mode: 'insensitive' } },
        { FIRST_NAME: { contains: term, mode: 'insensitive' } },
        { LAST_NAME: { contains: term, mode: 'insensitive' } },
      ];
    }

    const [rows, total] = await Promise.all([
      this.prisma.users.findMany({
        where,
        orderBy: { FIRST_NAME: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { role: { select: { ROLE_NAME: true } } },
      }),
      this.prisma.users.count({ where }),
    ]);

    let items = rows.map((u) => {
      const role = u.role?.ROLE_NAME ?? null;
      const modules = modulesForRoles(role ? [role] : []);
      return {
        userId: u.USER_ID,
        firstName: u.FIRST_NAME,
        lastName: u.LAST_NAME,
        email: u.EMAIL_ADDRESS,
        role,
        modules,
        displayName:
          [u.FIRST_NAME, u.LAST_NAME].filter(Boolean).join(' ') ||
          u.USER_NAME ||
          u.EMAIL_ADDRESS,
      };
    });

    if (params?.module && isChatModule(params.module)) {
      items = items.filter((i) => i.modules.includes(params.module as ChatModuleId));
    }

    return { items, meta: { page, limit, total: items.length || total } };
  }

  async setPresence(user: AuthUser, status: 'online' | 'away' | 'offline') {
    const modules = modulesForRoles(user.roles);
    const doc = await this.presence.findOneAndUpdate(
      { userId: user.id },
      {
        $set: {
          status,
          lastSeenAt: new Date(),
          modules,
        },
      },
      { upsert: true, new: true },
    );
    this.emitter?.emitToModules(modules, 'chat:presence', {
      userId: user.id,
      status,
      lastSeenAt: doc?.lastSeenAt?.toISOString() ?? null,
    });
    return {
      userId: user.id,
      status,
      modules,
      lastSeenAt: doc?.lastSeenAt?.toISOString() ?? null,
    };
  }
}
