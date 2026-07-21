import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { PERMISSIONS } from '../common/constants';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/types/auth-user.type';
import { AdmissionsService } from './admissions.service';
import { CreateWardDto } from './dto/admission.dto';

@Controller('admissions/wards')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class WardsController {
  constructor(private readonly admissionsService: AdmissionsService) {}

  /**
   * Method: GET
   * URL: /api/admissions/wards?status=Active&personSex=Male|Female&q=
   * Purpose: List wards with bed counts, gender, rates; optional sex filter (Male/Female + Mixed)
   * Required permission: admission:read
   * Response: { data: { items: [{ wardId, code, name, gender, wardClass, availableBeds, totalBeds, ... }] } }
   * Errors: 401, 403
   */
  @Get()
  @RequirePermissions(PERMISSIONS.ADMISSION_READ)
  async list(
    @Query('status') status?: string,
    @Query('personSex') personSex?: string,
    @Query('q') q?: string,
  ) {
    const result = await this.admissionsService.listWards({
      status,
      personSex,
      q,
    });
    return { data: result };
  }

  /**
   * Method: POST
   * URL: /api/admissions/wards
   * Purpose: Create a ward with optional gender/class/rates and bedCount AVAILABLE beds
   * Required permission: admission:create
   * Request body: { code, name, wardType?, wardClass?, gender?, dailyBedRate?, admissionDepositDefault?, bedCount? }
   * Response: { data: { wardId, code, name, gender, wardClass, bedsCreated, ... } }
   * Errors: 400 validation, 409 duplicate code, 401, 403
   */
  @Post()
  @RequirePermissions(PERMISSIONS.ADMISSION_CREATE)
  async create(@Body() dto: CreateWardDto, @CurrentUser() user: AuthUser) {
    const row = await this.admissionsService.createWard(dto, user);
    return { data: row };
  }
}
