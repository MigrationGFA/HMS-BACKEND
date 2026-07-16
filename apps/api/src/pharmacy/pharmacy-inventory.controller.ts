import {
  Body,
  Controller,
  Get,
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
import { AdjustStockDto } from './dto/adjust-stock.dto';
import { DrugsService } from './drugs.service';

@Controller('pharmacy/inventory')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PharmacyInventoryController {
  constructor(private readonly drugsService: DrugsService) {}

  /**
   * Method: GET
   * URL: /api/pharmacy/inventory?q=&category=&stockStatus=&page=&limit=
   * Purpose: Inventory page list — drugs with stock, batch, expiry and status (stockStatus: Active | Low | Out of Stock | Expired | Expiring Soon)
   * Required permission: pharmacy:read
   * Request body: none
   * Response example: { data: { items: [{ drugId, name, stock, earliestExpiry, earliestBatchNo, stockStatus, supplierName, ... }], meta } }
   * Error cases: 401 unauthorized, 403 missing permission
   */
  @Get()
  @RequirePermissions(PERMISSIONS.PHARMACY_READ)
  async list(
    @Query('q') q?: string,
    @Query('category') category?: string,
    @Query('stockStatus') stockStatus?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const result = await this.drugsService.list({
      q,
      category,
      stockStatus,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 50,
    });
    return { data: result };
  }

  /**
   * Method: GET
   * URL: /api/pharmacy/inventory/stats
   * Purpose: Inventory summary cards (totals, low stock, out of stock, expired, expiring soon, recently received)
   * Required permission: pharmacy:read
   * Request body: none
   * Response example: { data: { totalDrugs, available, lowStock, outOfStock, expired, expiringSoon, recentlyReceived } }
   * Error cases: 401 unauthorized, 403 missing permission
   */
  @Get('stats')
  @RequirePermissions(PERMISSIONS.PHARMACY_READ)
  async stats() {
    const stats = await this.drugsService.inventoryStats();
    return { data: stats };
  }

  /**
   * Method: POST
   * URL: /api/pharmacy/inventory/adjustments
   * Purpose: Manual stock adjustment (+/-) with mandatory reason; audit-logged
   * Required permission: stock:adjust
   * Request body: AdjustStockDto { drugId, qty (non-zero, +add/-deduct), reason }
   * Response example: { data: { drugId, name, stock, stockStatus, ... } }
   * Error cases: 400 validation / insufficient stock / no batches, 401, 403, 404 drug not found
   */
  @Post('adjustments')
  @RequirePermissions(PERMISSIONS.STOCK_ADJUST)
  async adjust(@Body() dto: AdjustStockDto, @CurrentUser() user: AuthUser) {
    const drug = await this.drugsService.adjustStock(dto, user);
    return { data: drug };
  }
}
