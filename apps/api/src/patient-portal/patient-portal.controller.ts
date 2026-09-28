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
import { PatientPortalService } from './patient-portal.service';
import {
  CreatePortalAppointmentDto,
  PortalListQueryDto,
  UpdatePortalProfileDto,
} from './dto/patient-portal.dto';

@Controller('portal')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PatientPortalController {
  constructor(private readonly portal: PatientPortalService) {}

  @Get('me')
  @RequirePermissions(PERMISSIONS.PORTAL_DASHBOARD_READ)
  async getMe(@CurrentUser() user: AuthUser) {
    return { data: await this.portal.getMe(user) };
  }

  @Get('dashboard')
  @RequirePermissions(PERMISSIONS.PORTAL_DASHBOARD_READ)
  async getDashboard(@CurrentUser() user: AuthUser) {
    return { data: await this.portal.getDashboard(user) };
  }

  @Get('appointments')
  @RequirePermissions(PERMISSIONS.PORTAL_APPOINTMENT_READ)
  async listAppointments(
    @CurrentUser() user: AuthUser,
    @Query() query: PortalListQueryDto,
  ) {
    return { data: await this.portal.listAppointments(user, query) };
  }

  @Post('appointments')
  @RequirePermissions(PERMISSIONS.PORTAL_APPOINTMENT_CREATE)
  async createAppointment(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreatePortalAppointmentDto,
  ) {
    return { data: await this.portal.createAppointment(user, dto) };
  }

  @Post('appointments/:id/cancel')
  @RequirePermissions(PERMISSIONS.PORTAL_APPOINTMENT_UPDATE)
  async cancelAppointment(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return { data: await this.portal.cancelAppointment(user, id) };
  }

  @Get('invoices')
  @RequirePermissions(PERMISSIONS.PORTAL_INVOICE_READ)
  async listInvoices(
    @CurrentUser() user: AuthUser,
    @Query() query: PortalListQueryDto,
  ) {
    return { data: await this.portal.listInvoices(user, query) };
  }

  @Get('lab-results')
  @RequirePermissions(PERMISSIONS.PORTAL_LAB_READ)
  async listLabResults(
    @CurrentUser() user: AuthUser,
    @Query() query: PortalListQueryDto,
  ) {
    return { data: await this.portal.listLabResults(user, query) };
  }

  @Get('prescriptions')
  @RequirePermissions(PERMISSIONS.PORTAL_RX_READ)
  async listPrescriptions(
    @CurrentUser() user: AuthUser,
    @Query() query: PortalListQueryDto,
  ) {
    return { data: await this.portal.listPrescriptions(user, query) };
  }

  @Get('records')
  @RequirePermissions(PERMISSIONS.PORTAL_RECORD_READ)
  async getRecordsSummary(@CurrentUser() user: AuthUser) {
    return { data: await this.portal.getRecordsSummary(user) };
  }

  @Get('notifications')
  @RequirePermissions(PERMISSIONS.PORTAL_NOTIFY_READ)
  async listNotifications(
    @CurrentUser() user: AuthUser,
    @Query() query: PortalListQueryDto,
  ) {
    return { data: await this.portal.listNotifications(user, query) };
  }

  @Get('profile')
  @RequirePermissions(PERMISSIONS.PORTAL_PROFILE_READ)
  async getProfile(@CurrentUser() user: AuthUser) {
    return { data: await this.portal.getProfile(user) };
  }

  @Patch('profile')
  @RequirePermissions(PERMISSIONS.PORTAL_PROFILE_UPDATE)
  async updateProfile(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdatePortalProfileDto,
  ) {
    return { data: await this.portal.updateProfile(user, dto) };
  }
}
