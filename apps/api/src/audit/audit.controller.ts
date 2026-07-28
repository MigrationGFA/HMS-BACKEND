import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { PERMISSIONS } from '../common/constants';
import { AuditService } from './audit.service';

@Controller('audit')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  /**
   * Method: GET
   * URL: /api/audit/logs?type=&personId=&userId=&page=&limit=
   * Purpose: Query audit trail filtered by AUDIT_TYPE
   * Required permission: audit:read
   * Request body: none
   * Response example: { data: { items: [{ auditId, type, ... }], meta } }
   * Error cases: 401 unauthorized, 403 missing permission
   */
  @Get('logs')
  @RequirePermissions(PERMISSIONS.AUDIT_READ)
  async list(
    @Query('type') type?: string,
    @Query('personId') personId?: string,
    @Query('userId') userId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const result = await this.auditService.list({
      type,
      personId: personId ? Number(personId) : undefined,
      userId: userId ? Number(userId) : undefined,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 50,
    });
    return { data: result };
  }

  /**
   * Method: GET
   * URL: /api/audit/stats?timezoneOffsetMinutes=60
   * Purpose: KPI counts for doctor Audit & Compliance board (total, today, emergency, notes, Rx, flagged)
   * Required permission: audit:read
   * Request body: none
   * Response example: { data: { asOf, total, today, emergencyOverrides, noteEdits, prescriptionChanges, flagged } }
   * Error cases: 401 unauthorized, 403 missing permission
   */
  @Get('stats')
  @RequirePermissions(PERMISSIONS.AUDIT_READ)
  async stats(@Query('timezoneOffsetMinutes') timezoneOffsetMinutes?: string) {
    const result = await this.auditService.stats({
      timezoneOffsetMinutes: timezoneOffsetMinutes
        ? Number(timezoneOffsetMinutes)
        : undefined,
    });
    return { data: result };
  }
}
