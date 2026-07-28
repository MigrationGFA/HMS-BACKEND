import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { PERMISSIONS } from '../common/constants';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/types/auth-user.type';
import { DoctorAnalyticsService } from './doctor-analytics.service';

@Controller('doctor')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class DoctorAnalyticsController {
  constructor(private readonly analytics: DoctorAnalyticsService) {}

  /**
   * Method: GET
   * URL: /api/doctor/analytics?from=&to=&clinic=&timezoneOffsetMinutes=
   * Purpose: Doctor-scoped clinical KPIs, charts, and tab tables for Reports & Analytics
   * Required permission: doctor-analytics:read
   * Request body: none (query params)
   * Response example: { data: { kpis, charts, tables, patients, admission, referrals, from, to } }
   * Error cases: 401, 403
   */
  @Get('analytics')
  @RequirePermissions(PERMISSIONS.DOCTOR_ANALYTICS_READ)
  async getAnalytics(
    @CurrentUser() user: AuthUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('clinic') clinic?: string,
    @Query('timezoneOffsetMinutes') timezoneOffsetMinutes?: string,
  ) {
    const data = await this.analytics.analytics(
      {
        from,
        to,
        clinic,
        timezoneOffsetMinutes: timezoneOffsetMinutes
          ? Number(timezoneOffsetMinutes)
          : undefined,
      },
      user,
    );
    return { data };
  }
}
