import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PERMISSIONS } from '../../common/constants';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import type { AuthUser } from '../../auth/types/auth-user.type';
import { PrescriptionsService } from './prescriptions.service';
import { CreatePrescriptionDto } from './dto/create-prescription.dto';

@Controller('prescriptions')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PrescriptionsController {
  constructor(private readonly prescriptionsService: PrescriptionsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.NURSING_ORDER_READ)
  async list(
    @Query('personId') personId?: string,
    @Query('admissionId') admissionId?: string,
    @Query('status') status?: string,
  ) {
    const result = await this.prescriptionsService.list({
      personId: personId ? Number(personId) : undefined,
      admissionId: admissionId ? Number(admissionId) : undefined,
      status,
    });
    return { data: result };
  }

  /** Creates a drug order + MAR rows via nursing ops (interim clinical bridge). */
  @Post()
  @RequirePermissions(PERMISSIONS.NURSING_ORDER_CREATE)
  async create(
    @Body() dto: CreatePrescriptionDto,
    @CurrentUser() user: AuthUser,
  ) {
    const row = await this.prescriptionsService.createDrugOrder(dto, user);
    return { data: row };
  }
}
