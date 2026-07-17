import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { PERMISSIONS } from '../common/constants';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/types/auth-user.type';
import { UpdatePharmacySettingsDto } from './dto/pharmacy-settings.dto';
import { PharmacySettingsService } from './pharmacy-settings.service';

@Controller('pharmacy/settings')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PharmacySettingsController {
  constructor(private readonly settings: PharmacySettingsService) {}

  /**
   * Method: GET
   * URL: /api/pharmacy/settings
   * Purpose: Load pharmacy alert thresholds (reorder default, expiry windows, flags)
   * Required permission: pharmacy:read
   * Request body: none
   * Response example: { data: { defaultReorderLevel, expiringSoonDays, expiryCriticalDays, ... } }
   * Error cases: 401, 403
   */
  @Get()
  @RequirePermissions(PERMISSIONS.PHARMACY_READ)
  async get() {
    const data = await this.settings.getOrCreate();
    return { data };
  }

  /**
   * Method: PATCH
   * URL: /api/pharmacy/settings
   * Purpose: Update pharmacy hospital-level thresholds and alert flags
   * Required permission: pharmacy:settings-update
   * Request body: UpdatePharmacySettingsDto (partial)
   * Response example: { data: { expiringSoonDays: 90, defaultReorderLevel: 40, ... } }
   * Error cases: 400 validation, 401, 403
   */
  @Patch()
  @RequirePermissions(PERMISSIONS.PHARMACY_SETTINGS_UPDATE)
  async update(
    @Body() dto: UpdatePharmacySettingsDto,
    @CurrentUser() user: AuthUser,
  ) {
    const data = await this.settings.update(dto, user);
    return { data };
  }
}
