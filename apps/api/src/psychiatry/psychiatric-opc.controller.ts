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
import { PsychiatryService } from './psychiatry.service';
import {
  AssignOpcDoctorDto,
  CheckInOpcVisitDto,
  PayOpcConsultationDto,
  SaveOpcAssessmentDto,
  SaveOpcNoteDto,
  SaveOpcRiskDto,
  UpdateOpcVisitStatusDto,
} from './dto/psychiatric-opc.dto';

/**
 * Psychiatric OPC API — visits, assessments, risk, notes, billing.
 */
@Controller('psychiatry/opc')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PsychiatricOpcController {
  constructor(private readonly psychiatryService: PsychiatryService) {}

  @Get('health')
  @RequirePermissions(PERMISSIONS.PATIENT_READ, PERMISSIONS.OPC_READ)
  health() {
    return { data: this.psychiatryService.opcHealth() };
  }

  @Get('metrics')
  @RequirePermissions(PERMISSIONS.OPC_READ)
  async metrics() {
    const data = await this.psychiatryService.dashboardMetrics();
    return { data };
  }

  @Get('visits')
  @RequirePermissions(PERMISSIONS.OPC_READ)
  async listVisits(
    @Query('status') status?: string,
    @Query('q') q?: string,
    @Query('today') today?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const data = await this.psychiatryService.listVisits({
      status,
      q,
      today: today === '1' || today === 'true',
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 50,
    });
    return { data };
  }

  @Get('visits/unpaid')
  @RequirePermissions(PERMISSIONS.OPC_READ)
  async listUnpaid(
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const data = await this.psychiatryService.listUnpaidConsults({
      q,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 50,
    });
    return { data };
  }

  @Get('visits/:id')
  @RequirePermissions(PERMISSIONS.OPC_READ)
  async getVisit(@Param('id', ParseIntPipe) id: number) {
    const data = await this.psychiatryService.getVisit(id);
    return { data };
  }

  @Post('visits')
  @RequirePermissions(PERMISSIONS.OPC_CREATE)
  async checkIn(
    @Body() dto: CheckInOpcVisitDto,
    @CurrentUser() user: AuthUser,
  ) {
    const data = await this.psychiatryService.checkIn(dto, user);
    return { data };
  }

  @Patch('visits/:id/status')
  @RequirePermissions(PERMISSIONS.OPC_UPDATE)
  async updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateOpcVisitStatusDto,
    @CurrentUser() user: AuthUser,
  ) {
    const data = await this.psychiatryService.updateVisitStatus(
      id,
      dto.status,
      user,
      dto.note,
    );
    return { data };
  }

  @Patch('visits/:id/assign')
  @RequirePermissions(PERMISSIONS.OPC_UPDATE)
  async assignDoctor(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AssignOpcDoctorDto,
    @CurrentUser() user: AuthUser,
  ) {
    const data = await this.psychiatryService.assignDoctor(id, dto.doctor, user);
    return { data };
  }

  @Post('visits/:id/complete')
  @RequirePermissions(PERMISSIONS.OPC_UPDATE)
  async complete(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
  ) {
    const data = await this.psychiatryService.completeVisit(id, user);
    return { data };
  }

  @Post('visits/:id/bill')
  @RequirePermissions(PERMISSIONS.OPC_UPDATE)
  async bill(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
  ) {
    const data = await this.psychiatryService.billConsultation(id, user);
    return { data };
  }

  @Post('visits/:id/pay')
  @RequirePermissions(PERMISSIONS.OPC_UPDATE)
  async pay(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: PayOpcConsultationDto,
    @CurrentUser() user: AuthUser,
  ) {
    const data = await this.psychiatryService.payConsultation(id, dto, user);
    return { data };
  }

  @Get('assessments')
  @RequirePermissions(PERMISSIONS.OPC_READ)
  async listAssessments(@Query('personId', ParseIntPipe) personId: number) {
    const data = await this.psychiatryService.listAssessments(personId);
    return { data };
  }

  @Post('assessments')
  @RequirePermissions(PERMISSIONS.OPC_CREATE)
  async saveAssessment(
    @Body() dto: SaveOpcAssessmentDto,
    @CurrentUser() user: AuthUser,
  ) {
    const data = await this.psychiatryService.saveAssessment(dto, user);
    return { data };
  }

  @Get('risk/latest')
  @RequirePermissions(PERMISSIONS.OPC_READ)
  async latestRisk(@Query('personId', ParseIntPipe) personId: number) {
    const data = await this.psychiatryService.latestRisk(personId);
    return { data };
  }

  @Post('risk')
  @RequirePermissions(PERMISSIONS.OPC_CREATE)
  async saveRisk(
    @Body() dto: SaveOpcRiskDto,
    @CurrentUser() user: AuthUser,
  ) {
    const data = await this.psychiatryService.saveRisk(dto, user);
    return { data };
  }

  @Get('notes')
  @RequirePermissions(PERMISSIONS.OPC_READ)
  async listNotes(
    @Query('personId', ParseIntPipe) personId: number,
    @Query('includeConfidential') includeConfidential?: string,
  ) {
    const data = await this.psychiatryService.listNotes(personId, {
      includeConfidential:
        includeConfidential === '1' || includeConfidential === 'true',
    });
    return { data };
  }

  @Post('notes')
  @RequirePermissions(PERMISSIONS.OPC_CREATE)
  async saveNote(
    @Body() dto: SaveOpcNoteDto,
    @CurrentUser() user: AuthUser,
  ) {
    const data = await this.psychiatryService.saveNote(dto, user);
    return { data };
  }
}
