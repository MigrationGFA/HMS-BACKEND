import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { PERMISSIONS } from '../common/constants';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/types/auth-user.type';
import { LaboratoryService } from './laboratory.service';
import { CreateLabRequestDto } from './dto/create-lab-request.dto';

@Controller('laboratory/requests')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class LabRequestsController {
  constructor(private readonly laboratoryService: LaboratoryService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.NURSING_ORDER_READ)
  async list(
    @Query('personId') personId?: string,
    @Query('admissionId') admissionId?: string,
    @Query('status') status?: string,
  ) {
    const result = await this.laboratoryService.listRequests({
      personId: personId ? Number(personId) : undefined,
      admissionId: admissionId ? Number(admissionId) : undefined,
      status,
    });
    return { data: result };
  }

  @Post()
  @RequirePermissions(PERMISSIONS.NURSING_ORDER_CREATE)
  async create(
    @Body() dto: CreateLabRequestDto,
    @CurrentUser() user: AuthUser,
  ) {
    const row = await this.laboratoryService.createRequest(dto, user);
    return { data: row };
  }
}
