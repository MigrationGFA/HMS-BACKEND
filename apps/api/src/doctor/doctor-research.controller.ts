import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { PERMISSIONS } from '../common/constants';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/types/auth-user.type';
import { DoctorResearchService } from './doctor-research.service';
import {
  CreateAuditProjectDto,
  CreateRegistryEntryDto,
  CreateTrialDto,
  PatchAuditProjectDto,
  PatchTrialDto,
} from './dto/doctor-research.dto';

@Controller('doctor/research')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class DoctorResearchController {
  constructor(private readonly research: DoctorResearchService) {}

  /**
   * Method: GET
   * URL: /api/doctor/research/summary
   * Purpose: Research & Audit KPI bag (0 when empty DB)
   * Required permission: doctor-analytics:read
   * Response: { data: { diagnosis, admissions, mortality, los, ... } }
   * Errors: 401, 403
   */
  @Get('summary')
  @RequirePermissions(PERMISSIONS.DOCTOR_ANALYTICS_READ)
  async summary() {
    return { data: await this.research.summary() };
  }

  /**
   * Method: GET
   * URL: /api/doctor/research/diagnoses
   * Purpose: Aggregate patient diagnoses for research board
   * Required permission: doctor-analytics:read
   * Response: { data: { items } }
   * Errors: 401, 403
   */
  @Get('diagnoses')
  @RequirePermissions(PERMISSIONS.DOCTOR_ANALYTICS_READ)
  async diagnoses() {
    return { data: await this.research.diagnoses() };
  }

  /**
   * Method: GET
   * URL: /api/doctor/research/admissions-by-ward
   * Purpose: Admissions aggregated by ward
   * Required permission: doctor-analytics:read
   * Response: { data: { items } }
   * Errors: 401, 403
   */
  @Get('admissions-by-ward')
  @RequirePermissions(PERMISSIONS.DOCTOR_ANALYTICS_READ)
  async admissionsByWard() {
    return { data: await this.research.admissionsByWard() };
  }

  /**
   * Method: GET
   * URL: /api/doctor/research/drug-utilization
   * Purpose: Prescription item utilization aggregates
   * Required permission: doctor-analytics:read
   * Response: { data: { items } }
   * Errors: 401, 403
   */
  @Get('drug-utilization')
  @RequirePermissions(PERMISSIONS.DOCTOR_ANALYTICS_READ)
  async drugUtilization() {
    return { data: await this.research.drugUtilization() };
  }

  /**
   * Method: GET
   * URL: /api/doctor/research/registry
   * Purpose: List research registry entries
   * Required permission: doctor-analytics:read
   * Response: { data: { items } }
   * Errors: 401, 403
   */
  @Get('registry')
  @RequirePermissions(PERMISSIONS.DOCTOR_ANALYTICS_READ)
  async listRegistry() {
    return { data: await this.research.listRegistry() };
  }

  /**
   * Method: POST
   * URL: /api/doctor/research/registry
   * Purpose: Create a research registry entry
   * Required permission: doctor-research:write
   * Request body: { patientLabel, diagnosis, studyGroup, personId?, eligibility?, consent?, enrolledBy?, status?, clinic? }
   * Response: { data: entry }
   * Errors: 401, 403
   * Audit: research:registry-create
   */
  @Post('registry')
  @RequirePermissions(PERMISSIONS.DOCTOR_RESEARCH_WRITE)
  async createRegistry(
    @Body() dto: CreateRegistryEntryDto,
    @CurrentUser() user: AuthUser,
  ) {
    return { data: await this.research.createRegistry(dto, user) };
  }

  /**
   * Method: GET
   * URL: /api/doctor/research/trials
   * Purpose: List research trials
   * Required permission: doctor-analytics:read
   * Response: { data: { items } }
   * Errors: 401, 403
   */
  @Get('trials')
  @RequirePermissions(PERMISSIONS.DOCTOR_ANALYTICS_READ)
  async listTrials() {
    return { data: await this.research.listTrials() };
  }

  /**
   * Method: POST
   * URL: /api/doctor/research/trials
   * Purpose: Create a research trial
   * Required permission: doctor-research:write
   * Request body: { name, pi, eligibleCount?, enrolledCount?, startDate?, status? }
   * Response: { data: trial }
   * Errors: 401, 403
   * Audit: research:trial-create
   */
  @Post('trials')
  @RequirePermissions(PERMISSIONS.DOCTOR_RESEARCH_WRITE)
  async createTrial(@Body() dto: CreateTrialDto, @CurrentUser() user: AuthUser) {
    return { data: await this.research.createTrial(dto, user) };
  }

  /**
   * Method: PATCH
   * URL: /api/doctor/research/trials/:id
   * Purpose: Update a research trial
   * Required permission: doctor-research:write
   * Response: { data: trial }
   * Errors: 401, 403, 404
   * Audit: research:trial-update
   */
  @Patch('trials/:id')
  @RequirePermissions(PERMISSIONS.DOCTOR_RESEARCH_WRITE)
  async patchTrial(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: PatchTrialDto,
    @CurrentUser() user: AuthUser,
  ) {
    return { data: await this.research.patchTrial(id, dto, user) };
  }

  /**
   * Method: GET
   * URL: /api/doctor/research/audit-projects
   * Purpose: List clinical audit projects
   * Required permission: doctor-analytics:read
   * Response: { data: { items } }
   * Errors: 401, 403
   */
  @Get('audit-projects')
  @RequirePermissions(PERMISSIONS.DOCTOR_ANALYTICS_READ)
  async listAuditProjects() {
    return { data: await this.research.listAuditProjects() };
  }

  /**
   * Method: POST
   * URL: /api/doctor/research/audit-projects
   * Purpose: Create a clinical audit project
   * Required permission: doctor-research:write
   * Request body: { title, department, lead, indicator, standard, performance?, status? }
   * Response: { data: project }
   * Errors: 401, 403
   * Audit: research:audit-project-create
   */
  @Post('audit-projects')
  @RequirePermissions(PERMISSIONS.DOCTOR_RESEARCH_WRITE)
  async createAuditProject(
    @Body() dto: CreateAuditProjectDto,
    @CurrentUser() user: AuthUser,
  ) {
    return { data: await this.research.createAuditProject(dto, user) };
  }

  /**
   * Method: PATCH
   * URL: /api/doctor/research/audit-projects/:id
   * Purpose: Update a clinical audit project
   * Required permission: doctor-research:write
   * Response: { data: project }
   * Errors: 401, 403, 404
   * Audit: research:audit-project-update
   */
  @Patch('audit-projects/:id')
  @RequirePermissions(PERMISSIONS.DOCTOR_RESEARCH_WRITE)
  async patchAuditProject(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: PatchAuditProjectDto,
    @CurrentUser() user: AuthUser,
  ) {
    return { data: await this.research.patchAuditProject(id, dto, user) };
  }
}
