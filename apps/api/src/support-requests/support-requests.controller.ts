import {
  Body,
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
import { SupportRequestsService } from './support-requests.service';
import {
  CreateSupportRequestDto,
  UpdateSupportRequestDto,
} from './dto/support-request.dto';

@Controller('support-requests')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SupportRequestsController {
  constructor(private readonly service: SupportRequestsService) {}

  /**
   * Method: POST
   * URL: /api/support-requests
   * Purpose: Create a staff support ticket from the shared header Support button
   * Required permission: support:create
   * Request body: { issueType: "Profile Change"|"Complaint"|"Technical Issue", description: string, module?: "pharmacy"|"doctor"|"cashier"|"records"|"laboratory"|"other" }
   * Response example: { data: { requestId, requestNo: "SR-2026-0001", status: "Open", ... } }
   * Error cases: 400 validation, 401, 403
   * Audit: support:create
   */
  @Post()
  @RequirePermissions(PERMISSIONS.SUPPORT_CREATE)
  async create(
    @Body() dto: CreateSupportRequestDto,
    @CurrentUser() user: AuthUser,
  ) {
    return { data: await this.service.create(dto, user) };
  }

  /**
   * Method: GET
   * URL: /api/support-requests?mine=&status=&q=&page=&limit=
   * Purpose: List support tickets (own by default; HR/admin with support:update see all unless mine=true)
   * Required permission: support:read
   * Response example: { data: { items: [...], meta: { page, limit, total } } }
   * Error cases: 401, 403
   */
  @Get()
  @RequirePermissions(PERMISSIONS.SUPPORT_READ)
  async list(
    @Query('mine') mine: string | undefined,
    @Query('status') status: string | undefined,
    @Query('q') q: string | undefined,
    @Query('page') page: string | undefined,
    @Query('limit') limit: string | undefined,
    @CurrentUser() user: AuthUser,
  ) {
    return {
      data: await this.service.list(
        {
          mine,
          status,
          q,
          page: page ? Number(page) : undefined,
          limit: limit ? Number(limit) : undefined,
        },
        user,
      ),
    };
  }

  /**
   * Method: GET
   * URL: /api/support-requests/:id
   * Purpose: Support ticket detail (owner or HR/admin)
   * Required permission: support:read
   * Response example: { data: { requestId, requestNo, ... } }
   * Error cases: 401, 403, 404
   */
  @Get(':id')
  @RequirePermissions(PERMISSIONS.SUPPORT_READ)
  async findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
  ) {
    return { data: await this.service.findOne(id, user) };
  }

  /**
   * Method: PATCH
   * URL: /api/support-requests/:id
   * Purpose: Update ticket status / resolve note (HR queue)
   * Required permission: support:update
   * Request body: { status: "Open"|"In Progress"|"Resolved"|"Closed", resolvedNote?: string }
   * Response example: { data: { requestId, status: "Resolved", ... } }
   * Error cases: 400, 401, 403, 404
   * Audit: support:update
   */
  @Patch(':id')
  @RequirePermissions(PERMISSIONS.SUPPORT_UPDATE)
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSupportRequestDto,
    @CurrentUser() user: AuthUser,
  ) {
    return { data: await this.service.update(id, dto, user) };
  }
}
