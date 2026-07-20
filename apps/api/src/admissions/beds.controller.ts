import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { PERMISSIONS } from '../common/constants';
import { AdmissionsService } from './admissions.service';

@Controller('admissions/beds')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class BedsController {
  constructor(private readonly admissionsService: AdmissionsService) {}

  /**
   * Method: GET
   * URL: /api/admissions/beds?wardId=&status=
   * Purpose: List beds filtered by ward and/or status
   * Required permission: admission:read
   */
  @Get()
  @RequirePermissions(PERMISSIONS.ADMISSION_READ)
  async list(
    @Query('wardId') wardId?: string,
    @Query('status') status?: string,
  ) {
    const result = await this.admissionsService.listBeds({
      wardId: wardId ? Number(wardId) : undefined,
      status,
    });
    return { data: result };
  }
}
