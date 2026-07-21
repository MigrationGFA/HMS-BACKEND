import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
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
import { NotificationsService } from './notifications.service';

@Controller('notifications')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  /**
   * Method: GET
   * URL: /api/notifications?unreadOnly=&page=&limit=
   * Purpose: Current user's notification inbox
   * Required permission: notification:read
   * Response: { data: { items, meta } }
   * Errors: 401, 403
   */
  @Get()
  @RequirePermissions(PERMISSIONS.NOTIFICATION_READ)
  async list(
    @CurrentUser() user: AuthUser,
    @Query('unreadOnly') unreadOnly?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const data = await this.notificationsService.listMine(user, {
      unreadOnly: unreadOnly === 'true' || unreadOnly === '1',
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 50,
    });
    return { data };
  }

  /**
   * Method: GET
   * URL: /api/notifications/stats
   * Purpose: Unread count for badge
   * Required permission: notification:read
   * Response: { data: { unread } }
   * Errors: 401, 403
   */
  @Get('stats')
  @RequirePermissions(PERMISSIONS.NOTIFICATION_READ)
  async stats(@CurrentUser() user: AuthUser) {
    const data = await this.notificationsService.stats(user);
    return { data };
  }

  /**
   * Method: PATCH
   * URL: /api/notifications/:id/read
   * Purpose: Mark one notification as read
   * Required permission: notification:read
   * Errors: 401, 403, 404
   */
  @Patch(':id/read')
  @RequirePermissions(PERMISSIONS.NOTIFICATION_READ)
  async markRead(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
  ) {
    const data = await this.notificationsService.markRead(id, user);
    return { data };
  }

  /**
   * Method: POST
   * URL: /api/notifications/:id/ack
   * Purpose: Acknowledge notification
   * Required permission: notification:read
   * Errors: 401, 403, 404
   */
  @Post(':id/ack')
  @RequirePermissions(PERMISSIONS.NOTIFICATION_READ)
  async ack(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
  ) {
    const data = await this.notificationsService.acknowledge(id, user);
    return { data };
  }

  /**
   * Method: POST
   * URL: /api/notifications/read-all
   * Purpose: Mark all inbox items read
   * Required permission: notification:read
   * Response: { data: { updated } }
   * Errors: 401, 403
   */
  @Post('read-all')
  @RequirePermissions(PERMISSIONS.NOTIFICATION_READ)
  async readAll(@CurrentUser() user: AuthUser) {
    const data = await this.notificationsService.markAllRead(user);
    return { data };
  }
}
