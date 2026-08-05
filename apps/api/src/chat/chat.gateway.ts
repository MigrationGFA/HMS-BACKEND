import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Server, Socket } from 'socket.io';
import { AuthService } from '../auth/auth.service';
import type { AuthUser } from '../auth/types/auth-user.type';
import type { JwtPayload } from '../auth/types/jwt-payload.type';
import { modulesForRoles } from './chat.constants';
import { ChatService } from './chat.service';

type AuthedSocket = Socket & { data: { user?: AuthUser } };

@WebSocketGateway({
  namespace: '/chat',
  cors: { origin: true, credentials: true },
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(ChatGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly auth: AuthService,
    private readonly chatService: ChatService,
  ) {
    this.chatService.setEmitter({
      emitToUsers: (userIds, event, payload) => {
        for (const id of userIds) {
          this.server?.to(`user:${id}`).emit(event, payload);
        }
      },
      emitToUsersPer: (userIds, event, payloadForUser) => {
        for (const id of userIds) {
          this.server?.to(`user:${id}`).emit(event, payloadForUser(id));
        }
      },
      emitToModules: (modules, event, payload) => {
        for (const m of modules) {
          this.server?.to(`module:${m}`).emit(event, payload);
        }
      },
    });
  }

  async handleConnection(client: AuthedSocket) {
    try {
      const token =
        (client.handshake.auth?.token as string | undefined) ||
        (client.handshake.query?.token as string | undefined) ||
        (typeof client.handshake.headers.authorization === 'string'
          ? client.handshake.headers.authorization.replace(/^Bearer\s+/i, '')
          : undefined);
      if (!token) {
        client.disconnect(true);
        return;
      }
      const payload = await this.jwt.verifyAsync<JwtPayload>(token, {
        secret: this.config.get<string>('jwt.accessSecret'),
      });
      const user = await this.auth.getUserById(payload.sub);
      if (!user) {
        client.disconnect(true);
        return;
      }
      client.data.user = user;
      await client.join(`user:${user.id}`);
      for (const m of modulesForRoles(user.roles)) {
        await client.join(`module:${m}`);
      }
      await this.chatService.setPresence(user, 'online');
      this.logger.debug(`chat connected user=${user.id}`);
    } catch (err) {
      this.logger.warn(`chat auth failed: ${err instanceof Error ? err.message : err}`);
      client.disconnect(true);
    }
  }

  async handleDisconnect(client: AuthedSocket) {
    const user = client.data.user;
    if (user) {
      await this.chatService.setPresence(user, 'offline');
    }
  }

  @SubscribeMessage('chat:join')
  handleJoin(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { conversationId?: string },
  ) {
    const user = client.data.user;
    if (!user || !body?.conversationId) return { ok: false };
    void client.join(`conversation:${body.conversationId}`);
    return { ok: true };
  }

  @SubscribeMessage('chat:typing')
  handleTyping(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { conversationId?: string },
  ) {
    const user = client.data.user;
    if (!user || !body?.conversationId) return;
    client
      .to(`conversation:${body.conversationId}`)
      .emit('chat:typing', { conversationId: body.conversationId, userId: user.id });
  }

  @SubscribeMessage('chat:presence')
  async handlePresence(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { status?: 'online' | 'away' | 'offline' },
  ) {
    const user = client.data.user;
    if (!user || !body?.status) return;
    return this.chatService.setPresence(user, body.status);
  }
}
