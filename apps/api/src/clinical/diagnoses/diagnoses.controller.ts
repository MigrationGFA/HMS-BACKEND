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
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PERMISSIONS } from '../../common/constants';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import type { AuthUser } from '../../auth/types/auth-user.type';
import { DiagnosesService } from './diagnoses.service';
import {
  CreatePatientDiagnosisDto,
  UpdatePatientDiagnosisDto,
} from './dto/diagnosis.dto';

@Controller('diagnoses')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class DiagnosesController {
  constructor(private readonly diagnosesService: DiagnosesService) {}

  /**
   * Method: GET
   * URL: /api/diagnoses/catalog?q=&system=&category=
   * Purpose: Search Active diagnosis catalog (ICD-11 / DSM / Local)
   * Required permission: diagnosis:read
   * Response: { data: { items: [{ diagnosisCodeId, code, name, system, isPsychiatric, ... }] } }
   * Errors: 401, 403
   */
  @Get('catalog')
  @RequirePermissions(PERMISSIONS.DIAGNOSIS_READ)
  async catalog(
    @Query('q') q?: string,
    @Query('system') system?: string,
    @Query('category') category?: string,
  ) {
    const data = await this.diagnosesService.listCatalog({ q, system, category });
    return { data };
  }

  /**
   * Method: GET
   * URL: /api/diagnoses/stats?personId=
   * Purpose: KPI counts for diagnosis engine tabs
   * Required permission: diagnosis:read
   * Response: { data: { active, newThisWeek, chronic, psychiatric, provisional, differential, resolved } }
   * Errors: 401, 403
   */
  @Get('stats')
  @RequirePermissions(PERMISSIONS.DIAGNOSIS_READ)
  async stats(@Query('personId') personId?: string) {
    const data = await this.diagnosesService.stats(
      personId ? Number(personId) : undefined,
    );
    return { data };
  }

  /**
   * Method: GET
   * URL: /api/diagnoses?personId=&status=&type=&tab=&q=&page=&limit=
   * Purpose: List patient diagnoses (problem list / history)
   * Required permission: diagnosis:read
   * Response: { data: { items, meta } }
   * Errors: 401, 403
   */
  @Get()
  @RequirePermissions(PERMISSIONS.DIAGNOSIS_READ)
  async list(
    @Query('personId') personId?: string,
    @Query('status') status?: string,
    @Query('type') type?: string,
    @Query('tab') tab?: string,
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const data = await this.diagnosesService.list({
      personId: personId ? Number(personId) : undefined,
      status,
      type,
      tab,
      q,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 50,
    });
    return { data };
  }

  /**
   * Method: GET
   * URL: /api/diagnoses/:id
   * Purpose: Patient diagnosis detail
   * Required permission: diagnosis:read
   * Errors: 404, 401, 403
   */
  @Get(':id')
  @RequirePermissions(PERMISSIONS.DIAGNOSIS_READ)
  async findOne(@Param('id', ParseIntPipe) id: number) {
    const data = await this.diagnosesService.findById(id);
    return { data };
  }

  /**
   * Method: POST
   * URL: /api/diagnoses
   * Purpose: Add diagnosis to patient problem list (snapshots catalog fields)
   * Required permission: diagnosis:create
   * Request body: { personId, diagnosisCodeId?|code?, name?, type?, severity?, status?, certainty?, ... }
   * Response: { data: PatientDiagnosis }
   * Errors: 400, 404 person, 401, 403
   */
  @Post()
  @RequirePermissions(PERMISSIONS.DIAGNOSIS_CREATE)
  async create(
    @Body() dto: CreatePatientDiagnosisDto,
    @CurrentUser() user: AuthUser,
  ) {
    const data = await this.diagnosesService.create(dto, user);
    return { data };
  }

  /**
   * Method: PATCH
   * URL: /api/diagnoses/:id
   * Purpose: Update type/status (promote, chronic, resolve, rule-out)
   * Required permission: diagnosis:update
   * Request body: { type?, status?, severity?, certainty?, notes?, closedReason?, ... }
   * Errors: 404, 401, 403
   */
  @Patch(':id')
  @RequirePermissions(PERMISSIONS.DIAGNOSIS_UPDATE)
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePatientDiagnosisDto,
    @CurrentUser() user: AuthUser,
  ) {
    const data = await this.diagnosesService.update(id, dto, user);
    return { data };
  }
}
