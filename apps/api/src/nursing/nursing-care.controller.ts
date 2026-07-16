import {
  BadRequestException,
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
import { NursingCareService } from './nursing-care.service';
import {
  CreateCarePlanDto,
  CreateFormInstanceDto,
  CreateFormTemplateDto,
  CreateIncidentDto,
  CreateNursingNoteDto,
  CreateNursingVitalDto,
  CreateObservationDto,
  ReviewIncidentDto,
  UpdateCarePlanDto,
} from './dto/nursing-care.dto';

@Controller('nursing')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class NursingCareController {
  constructor(private readonly care: NursingCareService) {}

  // ── Notes ──────────────────────────────────────────────────────────

  @Get('notes')
  @RequirePermissions(PERMISSIONS.NURSING_NOTE_READ)
  async listNotes(
    @Query('personId') personId?: string,
    @Query('admissionId') admissionId?: string,
  ) {
    const result = await this.care.listNotes({
      personId: personId ? Number(personId) : undefined,
      admissionId: admissionId ? Number(admissionId) : undefined,
    });
    return { data: result };
  }

  @Post('notes')
  @RequirePermissions(PERMISSIONS.NURSING_NOTE_CREATE)
  async createNote(
    @Body() dto: CreateNursingNoteDto,
    @CurrentUser() user: AuthUser,
  ) {
    const row = await this.care.createNote(dto, user);
    return { data: row };
  }

  // ── Vitals ─────────────────────────────────────────────────────────

  @Get('vitals')
  @RequirePermissions(PERMISSIONS.NURSING_VITAL_READ)
  async listVitals(
    @Query('personId') personId?: string,
    @Query('admissionId') admissionId?: string,
    @Query('abnormal') abnormal?: string,
  ) {
    const result = await this.care.listVitals({
      personId: personId ? Number(personId) : undefined,
      admissionId: admissionId ? Number(admissionId) : undefined,
      abnormal:
        abnormal === undefined
          ? undefined
          : abnormal === 'true' || abnormal === '1',
    });
    return { data: result };
  }

  @Post('vitals')
  @RequirePermissions(PERMISSIONS.NURSING_VITAL_CREATE)
  async createVital(
    @Body() dto: CreateNursingVitalDto,
    @CurrentUser() user: AuthUser,
  ) {
    const row = await this.care.createVital(dto, user);
    return { data: row };
  }

  // ── Care plans ─────────────────────────────────────────────────────

  @Get('care-plans')
  @RequirePermissions(PERMISSIONS.NURSING_CARE_PLAN_READ)
  async listCarePlans(
    @Query('personId') personId?: string,
    @Query('admissionId') admissionId?: string,
    @Query('status') status?: string,
  ) {
    const result = await this.care.listCarePlans({
      personId: personId ? Number(personId) : undefined,
      admissionId: admissionId ? Number(admissionId) : undefined,
      status,
    });
    return { data: result };
  }

  @Post('care-plans')
  @RequirePermissions(PERMISSIONS.NURSING_CARE_PLAN_CREATE)
  async createCarePlan(
    @Body() dto: CreateCarePlanDto,
    @CurrentUser() user: AuthUser,
  ) {
    const row = await this.care.createCarePlan(dto, user);
    return { data: row };
  }

  @Patch('care-plans/:id')
  @RequirePermissions(PERMISSIONS.NURSING_CARE_PLAN_UPDATE)
  async updateCarePlan(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCarePlanDto,
    @CurrentUser() user: AuthUser,
  ) {
    const row = await this.care.updateCarePlan(id, dto, user);
    return { data: row };
  }

  // ── Observations ───────────────────────────────────────────────────

  @Get('observations')
  @RequirePermissions(PERMISSIONS.NURSING_OBS_READ)
  async listObservations(
    @Query('personId') personId?: string,
    @Query('admissionId') admissionId?: string,
  ) {
    const result = await this.care.listObservations({
      personId: personId ? Number(personId) : undefined,
      admissionId: admissionId ? Number(admissionId) : undefined,
    });
    return { data: result };
  }

  @Post('observations')
  @RequirePermissions(PERMISSIONS.NURSING_OBS_CREATE)
  async createObservation(
    @Body() dto: CreateObservationDto,
    @CurrentUser() user: AuthUser,
  ) {
    const row = await this.care.createObservation(dto, user);
    return { data: row };
  }

  // ── Incidents ──────────────────────────────────────────────────────

  @Get('incidents')
  @RequirePermissions(PERMISSIONS.NURSING_INCIDENT_READ)
  async listIncidents(
    @Query('status') status?: string,
    @Query('personId') personId?: string,
  ) {
    const result = await this.care.listIncidents({
      status,
      personId: personId ? Number(personId) : undefined,
    });
    return { data: result };
  }

  @Post('incidents')
  @RequirePermissions(PERMISSIONS.NURSING_INCIDENT_CREATE)
  async createIncident(
    @Body() dto: CreateIncidentDto,
    @CurrentUser() user: AuthUser,
  ) {
    const row = await this.care.createIncident(dto, user);
    return { data: row };
  }

  @Patch('incidents/:id/review')
  @RequirePermissions(PERMISSIONS.NURSING_INCIDENT_UPDATE)
  async reviewIncident(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReviewIncidentDto,
    @CurrentUser() user: AuthUser,
  ) {
    const row = await this.care.reviewIncident(id, dto, user);
    return { data: row };
  }

  // ── Forms ──────────────────────────────────────────────────────────

  @Get('forms/templates')
  @RequirePermissions(PERMISSIONS.NURSING_FORM_READ)
  async listTemplates() {
    const result = await this.care.listFormTemplates();
    return { data: result };
  }

  @Post('forms/templates')
  @RequirePermissions(PERMISSIONS.NURSING_FORM_CREATE)
  async createTemplate(
    @Body() dto: CreateFormTemplateDto,
    @CurrentUser() user: AuthUser,
  ) {
    const row = await this.care.createFormTemplate(dto, user);
    return { data: row };
  }

  @Get('forms/instances')
  @RequirePermissions(PERMISSIONS.NURSING_FORM_READ)
  async listInstances(@Query('personId') personId?: string) {
    const result = await this.care.listFormInstances({
      personId: personId ? Number(personId) : undefined,
    });
    return { data: result };
  }

  @Post('forms/instances')
  @RequirePermissions(PERMISSIONS.NURSING_FORM_CREATE)
  async createInstance(
    @Body() dto: CreateFormInstanceDto,
    @CurrentUser() user: AuthUser,
  ) {
    const row = await this.care.createFormInstance(dto, user);
    return { data: row };
  }

  // ── Timeline + alerts ──────────────────────────────────────────────

  @Get('timeline')
  @RequirePermissions(PERMISSIONS.NURSING_NOTE_READ)
  async timeline(@Query('personId') personId?: string) {
    if (!personId) {
      throw new BadRequestException('personId is required');
    }
    const result = await this.care.timeline(Number(personId));
    return { data: result };
  }

  @Get('alerts')
  @RequirePermissions(PERMISSIONS.NURSING_VITAL_READ)
  async alerts() {
    const result = await this.care.alerts();
    return { data: result };
  }
}
