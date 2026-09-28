import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { PERMISSIONS } from '../common/constants';
import { IctService } from './ict.service';

@Controller('it')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class IctController {
  constructor(private readonly ict: IctService) {}

  @Get('dashboard')
  @RequirePermissions(PERMISSIONS.AUDIT_READ, PERMISSIONS.USER_READ)
  async getDashboard() {
    return { data: await this.ict.getDashboard() };
  }
}
