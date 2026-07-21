import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
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
   * URL: /api/admissions/wards
   * Purpose: List wards with bed counts and configured rates
   * Required permission: admission:read
   */
  @Get()
  @RequirePermissions(PERMISSIONS.ADMISSION_READ)
  async list() {
    const result = await this.admissionsService.listWards();
    return { data: result };
  }

  /**
   * Method: POST
   * URL: /api/admissions/wards
   * Purpose: Create a ward (optional bedCount seeds AVAILABLE beds)
   * Required permission: admission:create
   */
  @Post()
  @RequirePermissions(PERMISSIONS.ADMISSION_CREATE)
  async create(@Body() dto: CreateWardDto, @CurrentUser() user: AuthUser) {
    const row = await this.admissionsService.createWard(dto, user);
    return { data: row };
  }
}
