import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../auth/types/auth-user.type';

export type CreateNotificationInput = {
  userId: number;
  roleHint?: string | null;
  type: string;
  title: string;
  body?: string | null;
  linkPath?: string | null;
  entity?: string | null;
  entityId?: number | null;
  personId?: number | null;
};

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  private toResponse(row: {
    NOTIFICATION_ID: number;
    USER_ID: number;
    ROLE_HINT: string | null;
    TYPE: string;
    TITLE: string;
    BODY: string | null;
    LINK_PATH: string | null;
    ENTITY: string | null;
    ENTITY_ID: number | null;
    PERSON_ID: number | null;
    IS_READ: boolean;
    ACKNOWLEDGED_AT: Date | null;
    CREATED_DATE: Date;
  }) {
    return {
      notificationId: row.NOTIFICATION_ID,
      userId: row.USER_ID,
      roleHint: row.ROLE_HINT,
      type: row.TYPE,
      title: row.TITLE,
      body: row.BODY,
      linkPath: row.LINK_PATH,
      entity: row.ENTITY,
      entityId: row.ENTITY_ID,
      personId: row.PERSON_ID,
      isRead: row.IS_READ,
      acknowledgedAt: row.ACKNOWLEDGED_AT?.toISOString() ?? null,
      createdAt: row.CREATED_DATE.toISOString(),
    };
  }

  async createForUser(input: CreateNotificationInput) {
    const row = await this.prisma.notifications.create({
      data: {
        USER_ID: input.userId,
        ROLE_HINT: input.roleHint ?? null,
        TYPE: input.type,
        TITLE: input.title,
        BODY: input.body ?? null,
        LINK_PATH: input.linkPath ?? null,
        ENTITY: input.entity ?? null,
        ENTITY_ID: input.entityId ?? null,
        PERSON_ID: input.personId ?? null,
        IS_READ: false,
        CREATED_DATE: new Date(),
      },
    });
    return this.toResponse(row);
  }

  async listMine(
    actor: AuthUser,
    params?: { unreadOnly?: boolean; page?: number; limit?: number },
  ) {
    const page = Math.max(params?.page ?? 1, 1);
    const limit = Math.min(Math.max(params?.limit ?? 50, 1), 200);
    const where: Prisma.NotificationsWhereInput = {
      USER_ID: actor.id,
    };
    if (params?.unreadOnly) where.IS_READ = false;

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.notifications.count({ where }),
      this.prisma.notifications.findMany({
        where,
        orderBy: { CREATED_DATE: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      items: rows.map((r) => this.toResponse(r)),
      meta: { page, limit, total },
    };
  }

  async stats(actor: AuthUser) {
    const unread = await this.prisma.notifications.count({
      where: { USER_ID: actor.id, IS_READ: false },
    });
    return { unread };
  }

  async markRead(id: number, actor: AuthUser) {
    const row = await this.prisma.notifications.findUnique({
      where: { NOTIFICATION_ID: id },
    });
    if (!row || row.USER_ID !== actor.id) {
      throw new NotFoundException('Notification not found');
    }
    const updated = await this.prisma.notifications.update({
      where: { NOTIFICATION_ID: id },
      data: { IS_READ: true },
    });
    return this.toResponse(updated);
  }

  async acknowledge(id: number, actor: AuthUser) {
    const row = await this.prisma.notifications.findUnique({
      where: { NOTIFICATION_ID: id },
    });
    if (!row || row.USER_ID !== actor.id) {
      throw new NotFoundException('Notification not found');
    }
    const updated = await this.prisma.notifications.update({
      where: { NOTIFICATION_ID: id },
      data: {
        IS_READ: true,
        ACKNOWLEDGED_AT: new Date(),
      },
    });
    return this.toResponse(updated);
  }

  async markAllRead(actor: AuthUser) {
    const result = await this.prisma.notifications.updateMany({
      where: { USER_ID: actor.id, IS_READ: false },
      data: { IS_READ: true },
    });
    return { updated: result.count };
  }
}
