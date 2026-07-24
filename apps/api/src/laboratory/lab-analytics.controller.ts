import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { PERMISSIONS } from '../common/constants';
import { LabExtendedService } from './lab-extended.service';

@Controller('laboratory/analytics')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class LabAnalyticsController {
  constructor(private readonly extended: LabExtendedService) {}

  /**
   * Method: GET
   * URL: /api/laboratory/analytics/summary?from=&to=&timezoneOffsetMinutes=
   * Purpose: Live lab analytics (revenue, tests, avg TAT, critical, top tests, workload by category)
   * Required permission: lab:read
   * Request body: none
   * Response example: { data: { revenue, tests, avgTatLabel, criticalResults, topTests[], workloadByCategory[] } }
   * Errors: 400, 401, 403
   */
  @Get('summary')
  @RequirePermissions(PERMISSIONS.LAB_READ)
  async summary(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('timezoneOffsetMinutes') timezoneOffsetMinutes?: string,
  ) {
    return {
      data: await this.extended.analyticsSummary({
        from,
        to,
        timezoneOffsetMinutes: timezoneOffsetMinutes
          ? Number(timezoneOffsetMinutes)
          : undefined,
      }),
    };
  }
}
