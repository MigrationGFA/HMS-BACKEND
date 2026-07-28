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
import { EmergencyOverrideService } from './emergency-override.service';
import {
  CreateEmergencyAlertDto,
  CreateEmergencyOverrideSessionDto,
} from './dto/emergency-override.dto';

@Controller('emergency-override')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class EmergencyOverrideController {
  constructor(private readonly service: EmergencyOverrideService) {}

  /**
   * Method: GET
   * URL: /api/emergency-override/board
   * Purpose: KPIs + active emergency/inpatient board for doctor Emergency Override
   * Required permission: emergency-override:read
   * Response: { data: { kpis, patients } }
   * Errors: 401, 403
   */
  @Get('board')
  @RequirePermissions(PERMISSIONS.EMERGENCY_OVERRIDE_READ)
  async board() {
    return { data: await this.service.board() };
  }

  /**
   * Method: GET
   * URL: /api/emergency-override/sessions?status=&limit=
   * Purpose: List break-glass override sessions
   * Required permission: emergency-override:read
   * Response: { data: { items } }
   * Errors: 401, 403
   */
  @Get('sessions')
  @RequirePermissions(PERMISSIONS.EMERGENCY_OVERRIDE_READ)
  async listSessions(
    @Query('status') status?: string,
    @Query('limit') limit?: string,
  ) {
    return {
      data: await this.service.listSessions({
        status,
        limit: limit ? Number(limit) : undefined,
      }),
    };
  }

  /**
   * Method: POST
   * URL: /api/emergency-override/sessions
   * Purpose: Start an emergency override (break-glass) session
   * Required permission: emergency-override:create
   * Request body: { personId, admissionId?, reason, justification, severity?, durationMinutes?, location?, consultant? }
   * Response: { data: session }
   * Errors: 400, 401, 403, 404
   * Audit: emergency:override-start
   */
  @Post('sessions')
  @RequirePermissions(PERMISSIONS.EMERGENCY_OVERRIDE_CREATE)
  async createSession(
    @Body() dto: CreateEmergencyOverrideSessionDto,
    @CurrentUser() user: AuthUser,
  ) {
    return { data: await this.service.createSession(dto, user) };
  }

  /**
   * Method: PATCH
   * URL: /api/emergency-override/sessions/:id/end
   * Purpose: End an active override session
   * Required permission: emergency-override:update
   * Response: { data: session }
   * Errors: 400, 401, 403, 404
   * Audit: emergency:override-end
   */
  @Patch('sessions/:id/end')
  @RequirePermissions(PERMISSIONS.EMERGENCY_OVERRIDE_UPDATE)
  async endSession(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
  ) {
    return { data: await this.service.endSession(id, user) };
  }

  /**
   * Method: GET
   * URL: /api/emergency-override/alerts?limit=
   * Purpose: List critical emergency alerts
   * Required permission: emergency-override:read
   * Response: { data: { items } }
   * Errors: 401, 403
   */
  @Get('alerts')
  @RequirePermissions(PERMISSIONS.EMERGENCY_OVERRIDE_READ)
  async listAlerts(@Query('limit') limit?: string) {
    return {
      data: await this.service.listAlerts({
        limit: limit ? Number(limit) : undefined,
      }),
    };
  }

  /**
   * Method: POST
   * URL: /api/emergency-override/alerts
   * Purpose: Create a critical alert
   * Required permission: emergency-override:create
   * Request body: { personId?, alertType, message, severity? }
   * Response: { data: alert }
   * Errors: 401, 403
   * Audit: emergency:alert-create
   */
  @Post('alerts')
  @RequirePermissions(PERMISSIONS.EMERGENCY_OVERRIDE_CREATE)
  async createAlert(
    @Body() dto: CreateEmergencyAlertDto,
    @CurrentUser() user: AuthUser,
  ) {
    return { data: await this.service.createAlert(dto, user) };
  }

  /**
   * Method: PATCH
   * URL: /api/emergency-override/alerts/:id/ack
   * Purpose: Acknowledge a critical alert
   * Required permission: emergency-override:update
   * Response: { data: alert }
   * Errors: 401, 403, 404
   * Audit: emergency:alert-ack
   */
  @Patch('alerts/:id/ack')
  @RequirePermissions(PERMISSIONS.EMERGENCY_OVERRIDE_UPDATE)
  async ackAlert(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
  ) {
    return { data: await this.service.ackAlert(id, user) };
  }

  /**
   * Method: GET
   * URL: /api/emergency-override/admissions
   * Purpose: Recent inpatient admissions for emergency board
   * Required permission: emergency-override:read
   * Response: { data: { items } }
   * Errors: 401, 403
   */
  @Get('admissions')
  @RequirePermissions(PERMISSIONS.EMERGENCY_OVERRIDE_READ)
  async listAdmissions() {
    return { data: await this.service.listAdmissions() };
  }

  /**
   * Method: GET
   * URL: /api/emergency-override/referrals
   * Purpose: Emergency-priority clinical referrals (empty when none)
   * Required permission: emergency-override:read
   * Response: { data: { items } }
   * Errors: 401, 403
   */
  @Get('referrals')
  @RequirePermissions(PERMISSIONS.EMERGENCY_OVERRIDE_READ)
  async listReferrals() {
    return { data: await this.service.listReferrals() };
  }

  /**
   * Method: GET
   * URL: /api/emergency-override/medications
   * Purpose: Stat / emergency-payment prescriptions for board
   * Required permission: emergency-override:read
   * Response: { data: { items } }
   * Errors: 401, 403
   */
  @Get('medications')
  @RequirePermissions(PERMISSIONS.EMERGENCY_OVERRIDE_READ)
  async listMedications() {
    return { data: await this.service.listMedications() };
  }
}
