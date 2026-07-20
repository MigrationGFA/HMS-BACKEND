import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
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
import { LaboratoryService } from './laboratory.service';

@Controller('laboratory/samples')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class LabSamplesController {
  constructor(private readonly laboratoryService: LaboratoryService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.NURSING_SAMPLE_READ)
  async list(
    @Query('personId') personId?: string,
    @Query('admissionId') admissionId?: string,
  ) {
    const result = await this.laboratoryService.listSamples({
      personId: personId ? Number(personId) : undefined,
      admissionId: admissionId ? Number(admissionId) : undefined,
    });
    return { data: result };
  }

  @Post(':id/collect')
  @RequirePermissions(PERMISSIONS.NURSING_SAMPLE_UPDATE)
  async collect(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
  ) {
    const row = await this.laboratoryService.collectSample(id, user);
    return { data: row };
  }
}
