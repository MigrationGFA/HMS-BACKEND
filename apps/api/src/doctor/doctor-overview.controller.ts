import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { PERMISSIONS } from '../common/constants';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/types/auth-user.type';
import { DoctorOverviewService } from './doctor-overview.service';

@Controller('doctor')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class DoctorOverviewController {
  constructor(private readonly overview: DoctorOverviewService) {}

  /**
   * Method: GET
   * URL: /api/doctor/overview?timezoneOffsetMinutes=&queueLimit=
   * Purpose: Operational KPIs + consultation queue snapshot for Doctor Clinical Workstation Overview
   * Required permission: encounter:read
   * Request body: none (query params)
   * Response example:
   * {
   *   "data": {
   *     "asOf": "2026-07-24T12:00:00.000Z",
   *     "doctorUserId": 1,
   *     "kpis": {
   *       "patientsWaiting": 14,
   *       "patientsWaitingSubtitle": "8 GMPC + 6 OPC",
   *       "activeConsultations": 3,
   *       "pendingLabResults": 9,
   *       "pendingImaging": 4,
   *       "admissionRequests": 5,
   *       "urgentAdmissionRequests": 2,
   *       "wardRoundPatients": 38,
   *       "wardCount": 4,
   *       "referralsReceived": 6,
   *       "referralsReceivedPending": 2,
   *       "referralsSent": 4,
   *       "referralsSentAccepted": 1,
   *       "dischargesPending": 3,
   *       "emergencyCases": 2,
   *       "criticalAlerts": 2
   *     },
   *     "queue": [
   *       {
   *         "triageId": 1,
   *         "personId": 10,
   *         "name": "Tope Adeyemi (M, 34)",
   *         "status": "Ready",
   *         "statusTone": "green",
   *         "mode": "OPC",
   *         "canStart": true
   *       }
   *     ],
   *     "tabHints": {
   *       "activeCount": 3,
   *       "followUpCount": 7,
   *       "admittedCount": 38,
   *       "referralsReceived": 6,
   *       "referralsSent": 4,
   *       "pendingLab": 9,
   *       "pendingImaging": 4,
   *       "dischargesPending": 3
   *     }
   *   }
   * }
   * Error cases: 401 Unauthorized, 403 Forbidden
   */
  @Get('overview')
  @RequirePermissions(PERMISSIONS.ENCOUNTER_READ)
  async getOverview(
    @CurrentUser() user: AuthUser,
    @Query('timezoneOffsetMinutes') timezoneOffsetMinutes?: string,
    @Query('queueLimit') queueLimit?: string,
  ) {
    const data = await this.overview.overview(user, {
      timezoneOffsetMinutes: timezoneOffsetMinutes
        ? Number(timezoneOffsetMinutes)
        : undefined,
      queueLimit: queueLimit ? Number(queueLimit) : undefined,
    });
    return { data };
  }
}
