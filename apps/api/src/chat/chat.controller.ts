import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { PERMISSIONS } from '../common/constants';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/types/auth-user.type';
import { ChatService } from './chat.service';
import {
  CreateBroadcastDto,
  CreateConversationDto,
  SendMessageDto,
} from './dto/chat.dto';

@Controller('chat')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  /**
   * Method: GET
   * URL: /api/chat/conversations?module=&tab=&q=&page=&limit=
   * Purpose: List staff chat conversations for the current user
   * Required permission: comms:read
   * Response example: { data: { items: [...], meta } }
   * Error cases: 401, 403
   */
  @Get('conversations')
  @RequirePermissions(PERMISSIONS.COMMS_READ)
  async listConversations(
    @CurrentUser() user: AuthUser,
    @Query('module') module?: string,
    @Query('tab') tab?: string,
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const data = await this.chatService.listConversations(user, {
      module,
      tab,
      q,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 50,
    });
    return { data };
  }

  /**
   * Method: POST
   * URL: /api/chat/conversations
   * Purpose: Start a direct, department, or patient-linked conversation
   * Required permission: comms:send
   * Request body: CreateConversationDto
   * Response example: { data: { conversation, message } }
   * Error cases: 400, 401, 403
   */
  @Post('conversations')
  @RequirePermissions(PERMISSIONS.COMMS_SEND)
  async createConversation(
    @Body() dto: CreateConversationDto,
    @CurrentUser() user: AuthUser,
  ) {
    const data = await this.chatService.createConversation(dto, user);
    return { data };
  }

  /**
   * Method: GET
   * URL: /api/chat/conversations/:id/messages?page=&limit=
   * Purpose: Paginated message history for a conversation
   * Required permission: comms:read
   * Error cases: 401, 403, 404
   */
  @Get('conversations/:id/messages')
  @RequirePermissions(PERMISSIONS.COMMS_READ)
  async listMessages(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const data = await this.chatService.listMessages(id, user, {
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 50,
    });
    return { data };
  }

  /**
   * Method: POST
   * URL: /api/chat/conversations/:id/messages
   * Purpose: Send a message (also emits chat:message over websocket)
   * Required permission: comms:send
   * Request body: { text, urgent?, mentions?, attachmentUrl? }
   * Error cases: 400, 401, 403, 404
   */
  @Post('conversations/:id/messages')
  @RequirePermissions(PERMISSIONS.COMMS_SEND)
  async sendMessage(
    @Param('id') id: string,
    @Body() dto: SendMessageDto,
    @CurrentUser() user: AuthUser,
  ) {
    const data = await this.chatService.sendMessage(id, dto, user);
    return { data };
  }

  /**
   * Method: PATCH
   * URL: /api/chat/conversations/:id/read
   * Purpose: Mark conversation as read for current user
   * Required permission: comms:read
   */
  @Patch('conversations/:id/read')
  @RequirePermissions(PERMISSIONS.COMMS_READ)
  async markRead(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    const data = await this.chatService.markRead(id, user);
    return { data };
  }

  /**
   * Method: PATCH
   * URL: /api/chat/conversations/:id/archive
   * Purpose: Archive a conversation
   * Required permission: comms:send
   */
  @Patch('conversations/:id/archive')
  @RequirePermissions(PERMISSIONS.COMMS_SEND)
  async archive(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    const data = await this.chatService.archive(id, user);
    return { data };
  }

  /**
   * Method: POST
   * URL: /api/chat/broadcasts
   * Purpose: Emergency / department broadcast to module scopes
   * Required permission: comms:broadcast
   * Request body: CreateBroadcastDto
   * Error cases: 400, 401, 403
   */
  @Post('broadcasts')
  @RequirePermissions(PERMISSIONS.COMMS_BROADCAST)
  async createBroadcast(
    @Body() dto: CreateBroadcastDto,
    @CurrentUser() user: AuthUser,
  ) {
    const data = await this.chatService.createBroadcast(dto, user);
    return { data };
  }

  /**
   * Method: GET
   * URL: /api/chat/broadcasts?page=&limit=
   * Purpose: List recent broadcasts
   * Required permission: comms:read
   */
  @Get('broadcasts')
  @RequirePermissions(PERMISSIONS.COMMS_READ)
  async listBroadcasts(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const data = await this.chatService.listBroadcasts({
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 50,
    });
    return { data };
  }

  /**
   * Method: GET
   * URL: /api/chat/directory?q=&module=&page=&limit=
   * Purpose: Staff directory for starting chats (Postgres users + roles)
   * Required permission: comms:read
   */
  @Get('directory')
  @RequirePermissions(PERMISSIONS.COMMS_READ)
  async directory(
    @Query('q') q?: string,
    @Query('module') module?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const data = await this.chatService.directory({
      q,
      module,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 40,
    });
    return { data };
  }
}
