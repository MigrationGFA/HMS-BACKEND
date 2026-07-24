import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { PERMISSIONS } from '../common/constants';
import { LaboratoryService } from './laboratory.service';

@Controller('laboratory')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class LabOverviewController {
  constructor(private readonly laboratory: LaboratoryService) {}

  /**
   * Method: GET
   * URL: /api/laboratory/overview?timezoneOffsetMinutes=&recentLimit=
   * Purpose: Operational KPIs, recent activity, critical alerts, and pending tasks for Laboratory Dashboard
   * Required permission: lab:read
   * Request body: none (query params)
   * Response example:
   * {
   *   "data": {
   *     "asOf": "2026-07-24T12:00:00.000Z",
   *     "kpis": {
   *       "requestsToday": 14,
   *       "pendingRequests": 5,
   *       "awaitingCollection": 4,
   *       "samplesCollected": 8,
   *       "awaitingValidation": 2,
   *       "released": 6,
   *       "emergency": 1,
   *       "revenueToday": 45000
   *     },
   *     "recentActivity": [],
   *     "criticalAlerts": [],
   *     "pendingTasks": {
   *       "samplesToCollect": 4,
   *       "resultsToEnter": 2,
   *       "awaitingValidation": 2,
   *       "emrSyncQueue": 0
   *     }
   *   }
   * }
   * Error cases: 401 Unauthorized, 403 Forbidden
   */
  @Get('overview')
  @RequirePermissions(PERMISSIONS.LAB_READ)
  async overview(
    @Query('timezoneOffsetMinutes') timezoneOffsetMinutes?: string,
    @Query('recentLimit') recentLimit?: string,
  ) {
    const data = await this.laboratory.overview({
      timezoneOffsetMinutes: timezoneOffsetMinutes
        ? Number(timezoneOffsetMinutes)
        : undefined,
      recentLimit: recentLimit ? Number(recentLimit) : undefined,
    });
    return { data };
  }
}
