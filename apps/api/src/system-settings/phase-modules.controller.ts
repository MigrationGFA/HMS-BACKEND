import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { PERMISSIONS } from '../common/constants';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/types/auth-user.type';
import { SystemSettingsService } from './system-settings.service';
import { PatchPhaseModulesDto } from './dto/phase-modules.dto';

@Controller('system-settings/phase-modules')
export class PhaseModulesController {
  constructor(private readonly systemSettingsService: SystemSettingsService) {}

  /**
   * Method: GET
   * URL: /api/system-settings/phase-modules
   * Purpose: Read Phase 1 module release map (any authenticated user — drives FE nav)
   */
  @Get()
  @UseGuards(JwtAuthGuard)
  async get() {
    const data = await this.systemSettingsService.getPhaseModules();
    return { data };
  }

  /**
   * Method: PATCH
   * URL: /api/system-settings/phase-modules
   * Purpose: Update module release statuses (Super Admin / IT)
   * Body: { modules: { lab: "released", ... } }
   * Audit: system:phase-modules-update
   */
  @Patch()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.PHASE_MODULES_UPDATE)
  async patch(@Body() dto: PatchPhaseModulesDto, @CurrentUser() user: AuthUser) {
    const data = await this.systemSettingsService.patchPhaseModules(
      dto.modules,
      user,
    );
    return { data };
  }
}
