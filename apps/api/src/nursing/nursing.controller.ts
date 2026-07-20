import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { PERMISSIONS } from '../common/constants';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/types/auth-user.type';
import { NursingService } from './nursing.service';
import {
  RecordQueueVitalsDto,
  SendToDoctorDto,
} from './dto/patient-queue.dto';

@Controller('nursing')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class NursingController {
  constructor(private readonly nursingService: NursingService) {}

  /**
   * Method: GET
   * URL: /api/nursing/patient-queues?status=&clinic=&priority=&q=&paymentStatus=&date=&timezoneOffsetMinutes=&page=&limit=
   * Purpose: Daily OPD patient queue for nurses (triage + payment enrichment)
   * Required permission: triage:read
   */
  @Get('patient-queues')
  @RequirePermissions(PERMISSIONS.TRIAGE_READ)
  async listPatientQueues(
    @Query('status') status?: string,
    @Query('clinic') clinic?: string,
    @Query('priority') priority?: string,
    @Query('q') q?: string,
    @Query('paymentStatus') paymentStatus?: string,
    @Query('date') date?: string,
    @Query('timezoneOffsetMinutes') timezoneOffsetMinutes?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const result = await this.nursingService.listPatientQueues({
      status,
      clinic,
      priority,
      q,
      paymentStatus,
      date,
      timezoneOffsetMinutes: timezoneOffsetMinutes
        ? Number(timezoneOffsetMinutes)
        : undefined,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 50,
    });
    return { data: result };
  }

  /**
   * Method: GET
   * URL: /api/nursing/patient-queues/stats?date=&timezoneOffsetMinutes=
   * Purpose: Overview counts for nurse Patient Queues dashboard cards
   * Required permission: triage:read
   */
  @Get('patient-queues/stats')
  @RequirePermissions(PERMISSIONS.TRIAGE_READ)
  async patientQueueStats(
    @Query('date') date?: string,
    @Query('timezoneOffsetMinutes') timezoneOffsetMinutes?: string,
  ) {
    const stats = await this.nursingService.patientQueueStats({
      date,
      timezoneOffsetMinutes: timezoneOffsetMinutes
        ? Number(timezoneOffsetMinutes)
        : undefined,
    });
    return { data: stats };
  }

  /**
   * Method: GET
   * URL: /api/nursing/patient-queues/:triageId
   * Purpose: Single queue row with person + payment
   * Required permission: triage:read
   */
  @Get('patient-queues/:triageId')
  @RequirePermissions(PERMISSIONS.TRIAGE_READ)
  async getPatientQueue(@Param('triageId', ParseIntPipe) triageId: number) {
    const row = await this.nursingService.getPatientQueue(triageId);
    return { data: row };
  }

  /**
   * Method: PATCH
   * URL: /api/nursing/patient-queues/:triageId/start
   * Purpose: Move patient to In Triage
   * Required permission: triage:update
   */
  @Patch('patient-queues/:triageId/start')
  @RequirePermissions(PERMISSIONS.TRIAGE_UPDATE)
  async startQueue(
    @Param('triageId', ParseIntPipe) triageId: number,
    @CurrentUser() user: AuthUser,
  ) {
    const row = await this.nursingService.startQueue(triageId, user);
    return { data: row };
  }

  /**
   * Method: PATCH
   * URL: /api/nursing/patient-queues/:triageId/vitals
   * Purpose: Record/update vitals (allowed even if payment Pending)
   * Required permission: triage:update
   */
  @Patch('patient-queues/:triageId/vitals')
  @RequirePermissions(PERMISSIONS.TRIAGE_UPDATE)
  async recordVitals(
    @Param('triageId', ParseIntPipe) triageId: number,
    @Body() dto: RecordQueueVitalsDto,
    @CurrentUser() user: AuthUser,
  ) {
    const row = await this.nursingService.recordVitals(triageId, dto, user);
    return { data: row };
  }

  /**
   * Method: PATCH
   * URL: /api/nursing/patient-queues/:triageId/send-to-doctor
   * Purpose: Send patient to consultation (blocked while card payment Pending)
   * Required permission: triage:update
   */
  @Patch('patient-queues/:triageId/send-to-doctor')
  @RequirePermissions(PERMISSIONS.TRIAGE_UPDATE)
  async sendToDoctor(
    @Param('triageId', ParseIntPipe) triageId: number,
    @Body() dto: SendToDoctorDto,
    @CurrentUser() user: AuthUser,
  ) {
    const row = await this.nursingService.sendToDoctor(triageId, dto, user);
    return { data: row };
  }
}
