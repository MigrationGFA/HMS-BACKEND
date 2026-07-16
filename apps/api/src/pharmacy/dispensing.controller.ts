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
import { PharmacyService } from './pharmacy.service';

@Controller('pharmacy/dispensing')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class DispensingController {
  constructor(private readonly pharmacyService: PharmacyService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.NURSING_MAR_READ)
  async listPending(
    @Query('personId') personId?: string,
    @Query('admissionId') admissionId?: string,
  ) {
    const result = await this.pharmacyService.listMarPending({
      personId: personId ? Number(personId) : undefined,
      admissionId: admissionId ? Number(admissionId) : undefined,
    });
    return { data: result };
  }

  @Post(':marId/dispense')
  @RequirePermissions(PERMISSIONS.NURSING_MAR_UPDATE)
  async dispense(
    @Param('marId', ParseIntPipe) marId: number,
    @CurrentUser() user: AuthUser,
  ) {
    const row = await this.pharmacyService.dispenseMar(marId, user);
    return { data: row };
  }
}
