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
import { ClinicalPharmacyService } from './clinical-pharmacy.service';
import {
  CheckInteractionsDto,
  CreateAllergyDto,
  CreateRuleDto,
  NotifyAlertDto,
  OverrideAlertDto,
  UpdateAllergyDto,
  UpdateRuleDto,
} from './dto/clinical-pharmacy.dto';

@Controller('clinical-pharmacy')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ClinicalPharmacyController {
  constructor(private readonly service: ClinicalPharmacyService) {}

  /**
   * Method: GET
   * URL: /api/clinical-pharmacy/alerts?status=&severity=&type=&q=&page=&limit=
   * Purpose: Clinical Pharmacy alert worklist + KPIs
   * Required permission: clinical-pharmacy:read
   * Response: { data: { items, meta, kpis } }
   * Errors: 401, 403
   */
  @Get('alerts')
  @RequirePermissions(PERMISSIONS.CLINICAL_PHARMACY_READ)
  async listAlerts(
    @Query('status') status?: string,
    @Query('severity') severity?: string,
    @Query('type') type?: string,
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return {
      data: await this.service.listAlerts({
        status,
        severity,
        type,
        q,
        page: page ? Number(page) : undefined,
        limit: limit ? Number(limit) : undefined,
      }),
    };
  }

  /**
   * Method: GET
   * URL: /api/clinical-pharmacy/alerts/:id
   * Purpose: Alert detail
   * Required permission: clinical-pharmacy:read
   * Errors: 401, 403, 404
   */
  @Get('alerts/:id')
  @RequirePermissions(PERMISSIONS.CLINICAL_PHARMACY_READ)
  async getAlert(@Param('id', ParseIntPipe) id: number) {
    return { data: await this.service.getAlert(id) };
  }

  /**
   * Method: POST
   * URL: /api/clinical-pharmacy/check
   * Purpose: Run interaction check; upsert Open alerts
   * Required permission: clinical-pharmacy:read
   * Request body: { personId, drugIds?, prescriptionId? }
   * Audit: clinical-pharmacy:check
   * Errors: 400, 401, 403, 404
   */
  @Post('check')
  @RequirePermissions(PERMISSIONS.CLINICAL_PHARMACY_READ)
  async check(@Body() dto: CheckInteractionsDto, @CurrentUser() user: AuthUser) {
    return { data: await this.service.check(dto, user) };
  }

  /**
   * Method: POST
   * URL: /api/clinical-pharmacy/alerts/:id/override
   * Purpose: Pharmacist override with required reason
   * Required permission: clinical-pharmacy:update
   * Request body: { reason }
   * Audit: clinical-pharmacy:override
   */
  @Post('alerts/:id/override')
  @RequirePermissions(PERMISSIONS.CLINICAL_PHARMACY_UPDATE)
  async override(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: OverrideAlertDto,
    @CurrentUser() user: AuthUser,
  ) {
    return { data: await this.service.override(id, dto, user) };
  }

  /**
   * Method: POST
   * URL: /api/clinical-pharmacy/alerts/:id/notify
   * Purpose: Notify prescribing doctor via in-app notification
   * Required permission: clinical-pharmacy:update
   * Request body: { note? }
   * Audit: clinical-pharmacy:notify
   */
  @Post('alerts/:id/notify')
  @RequirePermissions(PERMISSIONS.CLINICAL_PHARMACY_UPDATE)
  async notify(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: NotifyAlertDto,
    @CurrentUser() user: AuthUser,
  ) {
    return { data: await this.service.notify(id, dto, user) };
  }

  /**
   * Method: PATCH
   * URL: /api/clinical-pharmacy/alerts/:id/close
   * Purpose: Close alert
   * Required permission: clinical-pharmacy:update
   * Audit: clinical-pharmacy:close
   */
  @Patch('alerts/:id/close')
  @RequirePermissions(PERMISSIONS.CLINICAL_PHARMACY_UPDATE)
  async close(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
  ) {
    return { data: await this.service.close(id, user) };
  }

  /**
   * Method: GET
   * URL: /api/clinical-pharmacy/rules?status=&q=
   * Purpose: List configurable interaction rules
   * Required permission: clinical-pharmacy:manage-rules
   */
  @Get('rules')
  @RequirePermissions(PERMISSIONS.CLINICAL_PHARMACY_MANAGE_RULES)
  async listRules(@Query('status') status?: string, @Query('q') q?: string) {
    return { data: await this.service.listRules({ status, q }) };
  }

  /**
   * Method: POST
   * URL: /api/clinical-pharmacy/rules
   * Purpose: Create interaction rule
   * Required permission: clinical-pharmacy:manage-rules
   */
  @Post('rules')
  @RequirePermissions(PERMISSIONS.CLINICAL_PHARMACY_MANAGE_RULES)
  async createRule(@Body() dto: CreateRuleDto, @CurrentUser() user: AuthUser) {
    return { data: await this.service.createRule(dto, user) };
  }

  /**
   * Method: PATCH
   * URL: /api/clinical-pharmacy/rules/:id
   * Purpose: Update interaction rule
   * Required permission: clinical-pharmacy:manage-rules
   */
  @Patch('rules/:id')
  @RequirePermissions(PERMISSIONS.CLINICAL_PHARMACY_MANAGE_RULES)
  async updateRule(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateRuleDto,
    @CurrentUser() user: AuthUser,
  ) {
    return { data: await this.service.updateRule(id, dto, user) };
  }

  /**
   * Method: GET
   * URL: /api/clinical-pharmacy/allergies?personId=
   * Purpose: List patient allergies
   * Required permission: clinical-pharmacy:read
   */
  @Get('allergies')
  @RequirePermissions(PERMISSIONS.CLINICAL_PHARMACY_READ)
  async listAllergies(@Query('personId') personId: string) {
    const id = Number(personId);
    if (!Number.isFinite(id) || id < 1) {
      return { data: { items: [] } };
    }
    return {
      data: await this.service.listAllergies(id),
    };
  }

  /**
   * Method: POST
   * URL: /api/clinical-pharmacy/allergies
   * Purpose: Create patient allergy
   * Required permission: clinical-pharmacy:update
   */
  @Post('allergies')
  @RequirePermissions(PERMISSIONS.CLINICAL_PHARMACY_UPDATE)
  async createAllergy(
    @Body() dto: CreateAllergyDto,
    @CurrentUser() user: AuthUser,
  ) {
    return { data: await this.service.createAllergy(dto, user) };
  }

  /**
   * Method: PATCH
   * URL: /api/clinical-pharmacy/allergies/:id
   * Purpose: Update patient allergy
   * Required permission: clinical-pharmacy:update
   */
  @Patch('allergies/:id')
  @RequirePermissions(PERMISSIONS.CLINICAL_PHARMACY_UPDATE)
  async updateAllergy(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAllergyDto,
    @CurrentUser() user: AuthUser,
  ) {
    return { data: await this.service.updateAllergy(id, dto, user) };
  }
}
