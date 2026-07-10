import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuditService } from './audit.service';

@Controller('audit')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  /**
   * Method: GET
   * URL: /api/audit/logs?type=&personId=&userId=&page=&limit=
   * Purpose: Query audit trail filtered by AUDIT_TYPE
   * Required permission: JWT (audit:read when RBAC wired)
   * Request body: none
   * Response example: { data: { items: [{ auditId, type, ... }], meta } }
   * Error cases: 401 unauthorized
   */
  @Get('logs')
  @UseGuards(JwtAuthGuard)
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
}
