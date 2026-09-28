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
import { HrService } from './hr.service';
import {
  CreateAppraisalDto,
  CreateAttendanceDto,
  CreateDisciplinaryDto,
  CreateDocumentDto,
  CreateHrEmployeeDto,
  CreateLeaveRequestDto,
  DecideLeaveDto,
  ListAttendanceQueryDto,
  ListEmployeesQueryDto,
  ListLeaveQueryDto,
  ListPayrollQueryDto,
  RunPayrollDto,
  UpdateAppraisalDto,
  UpdateAttendanceDto,
  UpdateDisciplinaryDto,
  UpdateHrEmployeeDto,
  UpdateLeaveRequestDto,
  UpdatePayrollLineDto,
} from './dto/hr.dto';

@Controller('hr')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class HrController {
  constructor(private readonly hrService: HrService) {}

  @Get('dashboard')
  @RequirePermissions(PERMISSIONS.HR_DASHBOARD_READ)
  async getDashboard() {
    return { data: await this.hrService.getDashboard() };
  }

  @Get('employees')
  @RequirePermissions(PERMISSIONS.HR_EMPLOYEE_READ)
  async listEmployees(@Query() query: ListEmployeesQueryDto) {
    return { data: await this.hrService.listEmployees(query) };
  }

  @Post('employees')
  @RequirePermissions(PERMISSIONS.HR_EMPLOYEE_CREATE)
  async createEmployee(
    @Body() dto: CreateHrEmployeeDto,
    @CurrentUser() user: AuthUser,
  ) {
    return { data: await this.hrService.createEmployee(dto, user) };
  }

  @Get('employees/:id')
  @RequirePermissions(PERMISSIONS.HR_EMPLOYEE_READ)
  async getEmployee(@Param('id', ParseIntPipe) id: number) {
    return { data: await this.hrService.getEmployee(id) };
  }

  @Patch('employees/:id')
  @RequirePermissions(PERMISSIONS.HR_EMPLOYEE_UPDATE)
  async updateEmployee(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateHrEmployeeDto,
    @CurrentUser() user: AuthUser,
  ) {
    return { data: await this.hrService.updateEmployee(id, dto, user) };
  }

  @Post('employees/:id/deactivate')
  @RequirePermissions(PERMISSIONS.HR_EMPLOYEE_DELETE)
  async deactivateEmployee(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
  ) {
    return { data: await this.hrService.deactivateEmployee(id, user) };
  }

  @Post('employees/:id/reactivate')
  @RequirePermissions(PERMISSIONS.HR_EMPLOYEE_UPDATE)
  async reactivateEmployee(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
  ) {
    return { data: await this.hrService.reactivateEmployee(id, user) };
  }

  @Get('attendance')
  @RequirePermissions(PERMISSIONS.HR_ATTENDANCE_READ)
  async listAttendance(@Query() query: ListAttendanceQueryDto) {
    return { data: await this.hrService.listAttendance(query) };
  }

  @Post('attendance')
  @RequirePermissions(PERMISSIONS.HR_ATTENDANCE_CREATE)
  async createAttendance(
    @Body() dto: CreateAttendanceDto,
    @CurrentUser() user: AuthUser,
  ) {
    return { data: await this.hrService.createAttendance(dto, user) };
  }

  @Patch('attendance/:id')
  @RequirePermissions(PERMISSIONS.HR_ATTENDANCE_UPDATE)
  async updateAttendance(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAttendanceDto,
    @CurrentUser() user: AuthUser,
  ) {
    return { data: await this.hrService.updateAttendance(id, dto, user) };
  }

  @Get('leave-requests')
  @RequirePermissions(PERMISSIONS.HR_LEAVE_READ)
  async listLeave(@Query() query: ListLeaveQueryDto) {
    return { data: await this.hrService.listLeave(query) };
  }

  @Post('leave-requests')
  @RequirePermissions(PERMISSIONS.HR_LEAVE_CREATE)
  async createLeave(
    @Body() dto: CreateLeaveRequestDto,
    @CurrentUser() user: AuthUser,
  ) {
    return { data: await this.hrService.createLeave(dto, user) };
  }

  @Patch('leave-requests/:id')
  @RequirePermissions(PERMISSIONS.HR_LEAVE_UPDATE)
  async updateLeave(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateLeaveRequestDto,
    @CurrentUser() user: AuthUser,
  ) {
    return { data: await this.hrService.updateLeave(id, dto, user) };
  }

  @Post('leave-requests/:id/approve')
  @RequirePermissions(PERMISSIONS.HR_LEAVE_APPROVE)
  async approveLeave(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: DecideLeaveDto,
    @CurrentUser() user: AuthUser,
  ) {
    return { data: await this.hrService.approveLeave(id, dto, user) };
  }

  @Post('leave-requests/:id/reject')
  @RequirePermissions(PERMISSIONS.HR_LEAVE_APPROVE)
  async rejectLeave(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: DecideLeaveDto,
    @CurrentUser() user: AuthUser,
  ) {
    return { data: await this.hrService.rejectLeave(id, dto, user) };
  }

  @Get('appraisals')
  @RequirePermissions(PERMISSIONS.HR_APPRAISAL_READ)
  async listAppraisals(
    @Query('employeeId') employeeId: string | undefined,
    @Query('page') page: string | undefined,
    @Query('limit') limit: string | undefined,
  ) {
    return {
      data: await this.hrService.listAppraisals({
        employeeId: employeeId ? Number(employeeId) : undefined,
        page: page ? Number(page) : undefined,
        limit: limit ? Number(limit) : undefined,
      }),
    };
  }

  @Post('appraisals')
  @RequirePermissions(PERMISSIONS.HR_APPRAISAL_CREATE)
  async createAppraisal(
    @Body() dto: CreateAppraisalDto,
    @CurrentUser() user: AuthUser,
  ) {
    return { data: await this.hrService.createAppraisal(dto, user) };
  }

  @Patch('appraisals/:id')
  @RequirePermissions(PERMISSIONS.HR_APPRAISAL_UPDATE)
  async updateAppraisal(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAppraisalDto,
    @CurrentUser() user: AuthUser,
  ) {
    return { data: await this.hrService.updateAppraisal(id, dto, user) };
  }

  @Get('disciplinary')
  @RequirePermissions(PERMISSIONS.HR_DISCIPLINARY_READ)
  async listDisciplinary(
    @Query('employeeId') employeeId: string | undefined,
    @Query('status') status: string | undefined,
    @Query('page') page: string | undefined,
    @Query('limit') limit: string | undefined,
  ) {
    return {
      data: await this.hrService.listDisciplinary({
        employeeId: employeeId ? Number(employeeId) : undefined,
        status,
        page: page ? Number(page) : undefined,
        limit: limit ? Number(limit) : undefined,
      }),
    };
  }

  @Post('disciplinary')
  @RequirePermissions(PERMISSIONS.HR_DISCIPLINARY_CREATE)
  async createDisciplinary(
    @Body() dto: CreateDisciplinaryDto,
    @CurrentUser() user: AuthUser,
  ) {
    return { data: await this.hrService.createDisciplinary(dto, user) };
  }

  @Patch('disciplinary/:id')
  @RequirePermissions(PERMISSIONS.HR_DISCIPLINARY_UPDATE)
  async updateDisciplinary(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateDisciplinaryDto,
    @CurrentUser() user: AuthUser,
  ) {
    return { data: await this.hrService.updateDisciplinary(id, dto, user) };
  }

  @Get('documents')
  @RequirePermissions(PERMISSIONS.HR_DOCUMENT_READ)
  async listDocuments(
    @Query('employeeId') employeeId: string | undefined,
    @Query('includeDeleted') includeDeleted: string | undefined,
    @Query('page') page: string | undefined,
    @Query('limit') limit: string | undefined,
  ) {
    return {
      data: await this.hrService.listDocuments({
        employeeId: employeeId ? Number(employeeId) : undefined,
        includeDeleted: includeDeleted === 'true',
        page: page ? Number(page) : undefined,
        limit: limit ? Number(limit) : undefined,
      }),
    };
  }

  @Post('documents')
  @RequirePermissions(PERMISSIONS.HR_DOCUMENT_CREATE)
  async createDocument(
    @Body() dto: CreateDocumentDto,
    @CurrentUser() user: AuthUser,
  ) {
    return { data: await this.hrService.createDocument(dto, user) };
  }

  @Post('documents/:id/delete')
  @RequirePermissions(PERMISSIONS.HR_DOCUMENT_DELETE)
  async softDeleteDocument(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
  ) {
    return { data: await this.hrService.softDeleteDocument(id, user) };
  }

  @Get('payroll/runs')
  @RequirePermissions(PERMISSIONS.HR_PAYROLL_READ)
  async listPayrollRuns(@Query() query: ListPayrollQueryDto) {
    return { data: await this.hrService.listPayrollRuns(query) };
  }

  @Get('payroll/runs/:id')
  @RequirePermissions(PERMISSIONS.HR_PAYROLL_READ)
  async getPayrollRun(@Param('id', ParseIntPipe) id: number) {
    return { data: await this.hrService.getPayrollRun(id) };
  }

  @Post('payroll/runs')
  @RequirePermissions(PERMISSIONS.HR_PAYROLL_RUN)
  async runPayroll(
    @Body() dto: RunPayrollDto,
    @CurrentUser() user: AuthUser,
  ) {
    return { data: await this.hrService.runPayroll(dto, user) };
  }

  @Post('payroll/runs/:id/lock')
  @RequirePermissions(PERMISSIONS.HR_PAYROLL_RUN)
  async lockPayroll(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
  ) {
    return { data: await this.hrService.lockPayroll(id, user) };
  }

  @Patch('payroll/runs/:id/lines/:lineId')
  @RequirePermissions(PERMISSIONS.HR_PAYROLL_UPDATE)
  async updatePayrollLine(
    @Param('id', ParseIntPipe) id: number,
    @Param('lineId', ParseIntPipe) lineId: number,
    @Body() dto: UpdatePayrollLineDto,
    @CurrentUser() user: AuthUser,
  ) {
    return {
      data: await this.hrService.updatePayrollLine(id, lineId, dto, user),
    };
  }
}
