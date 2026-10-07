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
import { HrSelfService } from './hr-self.service';
import {
  CreateSelfLeaveDto,
  HodRejectLeaveDto,
  SelfAttendanceQueryDto,
  UpdateSelfProfileDto,
} from './dto/hr-self.dto';

/**
 * Staff self-service My HR — ownership always from JWT → USERS.EMPLOYEE_ID.
 * Never trust client employeeId.
 */
@Controller('me/hr')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class MeHrController {
  constructor(private readonly hrSelf: HrSelfService) {}

  @Get('summary')
  @RequirePermissions(PERMISSIONS.HR_SELF_READ)
  async summary(@CurrentUser() user: AuthUser) {
    return { data: await this.hrSelf.getSummary(user) };
  }

  @Get('leave')
  @RequirePermissions(PERMISSIONS.HR_SELF_READ)
  async listLeave(@CurrentUser() user: AuthUser) {
    return { data: await this.hrSelf.listMyLeave(user) };
  }

  @Get('leave/balances')
  @RequirePermissions(PERMISSIONS.HR_SELF_READ)
  async leaveBalances(@CurrentUser() user: AuthUser) {
    return { data: await this.hrSelf.listMyBalances(user) };
  }

  @Post('leave')
  @RequirePermissions(PERMISSIONS.HR_SELF_LEAVE)
  async createLeave(
    @Body() dto: CreateSelfLeaveDto,
    @CurrentUser() user: AuthUser,
  ) {
    return { data: await this.hrSelf.createMyLeave(dto, user) };
  }

  @Post('leave/:id/cancel')
  @RequirePermissions(PERMISSIONS.HR_SELF_LEAVE)
  async cancelLeave(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
  ) {
    return { data: await this.hrSelf.cancelMyLeave(id, user) };
  }

  @Get('team/leave')
  @RequirePermissions(PERMISSIONS.HR_SELF_LEAVE)
  async teamLeave(@CurrentUser() user: AuthUser) {
    return { data: await this.hrSelf.listTeamLeave(user) };
  }

  @Post('team/leave/:id/hod-approve')
  @RequirePermissions(PERMISSIONS.HR_SELF_LEAVE)
  async hodApprove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
  ) {
    return { data: await this.hrSelf.hodApprove(id, user) };
  }

  @Post('team/leave/:id/hod-reject')
  @RequirePermissions(PERMISSIONS.HR_SELF_LEAVE)
  async hodReject(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: HodRejectLeaveDto,
    @CurrentUser() user: AuthUser,
  ) {
    return { data: await this.hrSelf.hodReject(id, dto, user) };
  }

  @Get('attendance')
  @RequirePermissions(PERMISSIONS.HR_SELF_READ)
  async attendance(
    @Query() query: SelfAttendanceQueryDto,
    @CurrentUser() user: AuthUser,
  ) {
    return { data: await this.hrSelf.listMyAttendance(user, query) };
  }

  @Get('appraisals')
  @RequirePermissions(PERMISSIONS.HR_SELF_READ)
  async appraisals(@CurrentUser() user: AuthUser) {
    return { data: await this.hrSelf.listMyAppraisals(user) };
  }

  @Get('payslips')
  @RequirePermissions(PERMISSIONS.HR_SELF_READ)
  async payslips(@CurrentUser() user: AuthUser) {
    return { data: await this.hrSelf.listMyPayslips(user) };
  }

  @Get('payslips/:lineId')
  @RequirePermissions(PERMISSIONS.HR_SELF_READ)
  async payslip(
    @Param('lineId', ParseIntPipe) lineId: number,
    @CurrentUser() user: AuthUser,
  ) {
    return { data: await this.hrSelf.getMyPayslip(lineId, user) };
  }

  @Get('profile')
  @RequirePermissions(PERMISSIONS.HR_SELF_READ)
  async profile(@CurrentUser() user: AuthUser) {
    return { data: await this.hrSelf.getMyProfile(user) };
  }

  @Patch('profile')
  @RequirePermissions(PERMISSIONS.HR_SELF_READ)
  async updateProfile(
    @Body() dto: UpdateSelfProfileDto,
    @CurrentUser() user: AuthUser,
  ) {
    return { data: await this.hrSelf.updateMyProfile(dto, user) };
  }
}
