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
import { RadiologyService } from './radiology.service';
import {
  AdjustConsumableDto,
  CreateConsumableDto,
  CreateEquipmentDto,
  CreateRadiologyReportDto,
  CreateRadFormDto,
  ImportImagingOrderDto,
  ReturnReportDto,
  UpdateEquipmentDto,
} from './dto/radiology.dto';

@Controller('radiology')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class RadiologyController {
  constructor(private readonly radiology: RadiologyService) {}

  @Get('metrics')
  @RequirePermissions(PERMISSIONS.RADIOLOGY_REQUEST_READ)
  async metrics() {
    return { data: await this.radiology.metrics() };
  }

  @Get('critical')
  @RequirePermissions(PERMISSIONS.RADIOLOGY_REPORT_READ)
  async critical() {
    return { data: await this.radiology.criticalFindings() };
  }

  @Get('results')
  @RequirePermissions(PERMISSIONS.RADIOLOGY_REPORT_READ)
  async consumerResults(
    @Query('status') status?: string,
    @Query('personId') personId?: string,
    @Query('critical') critical?: string,
    @Query('limit') limit?: string,
  ) {
    return {
      data: await this.radiology.listConsumerResults({
        status,
        personId: personId ? Number(personId) : undefined,
        critical: critical === 'true' ? true : critical === 'false' ? false : undefined,
        limit: limit ? Number(limit) : undefined,
      }),
    };
  }

  @Get('reports')
  @RequirePermissions(PERMISSIONS.RADIOLOGY_REPORT_READ)
  async listReports(
    @Query('imagingRequestId') imagingRequestId?: string,
    @Query('status') status?: string,
    @Query('critical') critical?: string,
  ) {
    const result = await this.radiology.listReports({
      imagingRequestId: imagingRequestId ? Number(imagingRequestId) : undefined,
      status,
      critical: critical === 'true' ? true : critical === 'false' ? false : undefined,
    });
    return { data: result };
  }

  @Post('reports')
  @RequirePermissions(PERMISSIONS.RADIOLOGY_REPORT_CREATE)
  async submitReport(
    @Body() dto: CreateRadiologyReportDto,
    @CurrentUser() user: AuthUser,
  ) {
    return { data: await this.radiology.submitReport(dto, user) };
  }

  @Post('reports/:reportId/verify')
  @RequirePermissions(PERMISSIONS.RADIOLOGY_REPORT_VERIFY)
  async verify(
    @Param('reportId', ParseIntPipe) reportId: number,
    @CurrentUser() user: AuthUser,
  ) {
    return { data: await this.radiology.verifyReport(reportId, user) };
  }

  @Post('reports/:reportId/return')
  @RequirePermissions(PERMISSIONS.RADIOLOGY_REPORT_VERIFY)
  async returnReport(
    @Param('reportId', ParseIntPipe) reportId: number,
    @Body() dto: ReturnReportDto,
    @CurrentUser() user: AuthUser,
  ) {
    return { data: await this.radiology.returnReport(reportId, dto, user) };
  }

  @Post('reports/:reportId/release')
  @RequirePermissions(PERMISSIONS.RADIOLOGY_REPORT_RELEASE)
  async release(
    @Param('reportId', ParseIntPipe) reportId: number,
    @CurrentUser() user: AuthUser,
  ) {
    return { data: await this.radiology.releaseReport(reportId, user) };
  }

  @Post('import-order')
  @RequirePermissions(PERMISSIONS.RADIOLOGY_REQUEST_CREATE)
  async importOrder(
    @Body() dto: ImportImagingOrderDto,
    @CurrentUser() user: AuthUser,
  ) {
    return { data: await this.radiology.importOrder(dto, user) };
  }

  @Get('equipment')
  @RequirePermissions(PERMISSIONS.RADIOLOGY_EQUIPMENT_READ)
  async equipment() {
    return { data: await this.radiology.listEquipment() };
  }

  @Post('equipment')
  @RequirePermissions(PERMISSIONS.RADIOLOGY_EQUIPMENT_UPDATE)
  async createEquipment(
    @Body() dto: CreateEquipmentDto,
    @CurrentUser() user: AuthUser,
  ) {
    return { data: await this.radiology.createEquipment(dto, user) };
  }

  @Patch('equipment/:id')
  @RequirePermissions(PERMISSIONS.RADIOLOGY_EQUIPMENT_UPDATE)
  async updateEquipment(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateEquipmentDto,
    @CurrentUser() user: AuthUser,
  ) {
    return { data: await this.radiology.updateEquipment(id, dto, user) };
  }

  @Get('consumables')
  @RequirePermissions(PERMISSIONS.RADIOLOGY_EQUIPMENT_READ)
  async consumables() {
    return { data: await this.radiology.listConsumables() };
  }

  @Post('consumables')
  @RequirePermissions(PERMISSIONS.RADIOLOGY_EQUIPMENT_UPDATE)
  async createConsumable(
    @Body() dto: CreateConsumableDto,
    @CurrentUser() user: AuthUser,
  ) {
    return { data: await this.radiology.createConsumable(dto, user) };
  }

  @Post('consumables/:id/adjust')
  @RequirePermissions(PERMISSIONS.RADIOLOGY_EQUIPMENT_UPDATE)
  async adjustConsumable(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AdjustConsumableDto,
    @CurrentUser() user: AuthUser,
  ) {
    return { data: await this.radiology.adjustConsumable(id, dto, user) };
  }

  @Get('forms')
  @RequirePermissions(PERMISSIONS.RADIOLOGY_FORMS_READ)
  async listForms(
    @Query('personId') personId?: string,
    @Query('formType') formType?: string,
  ) {
    return {
      data: await this.radiology.listForms({
        personId: personId ? Number(personId) : undefined,
        formType,
      }),
    };
  }

  @Post('forms')
  @RequirePermissions(PERMISSIONS.RADIOLOGY_FORMS_CREATE)
  async createForm(
    @Body() dto: CreateRadFormDto,
    @CurrentUser() user: AuthUser,
  ) {
    return { data: await this.radiology.createForm(dto, user) };
  }
}
