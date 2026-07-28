import {
  BadRequestException,
  Body,
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
import { ConfirmWalkInPaymentDto } from './dto/walk-in-sale.dto';
import { PharmacyBillingService } from './pharmacy-billing.service';

@Controller('pharmacy/billing')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PharmacyBillingController {
  constructor(private readonly billing: PharmacyBillingService) {}

  /**
   * Method: GET
   * URL: /api/pharmacy/billing/summary?from=&to=
   * Purpose: Summary cards for pharmacy billing (paid/pending Rx + walk-in, channel revenue)
   * Required permission: pharmacy:sale-read
   * Request body: none
   * Response example: { data: { paidCount, pendingCount, channelTotals, revenueTotal } }
   * Error cases: 401, 403
   */
  @Get('summary')
  @RequirePermissions(PERMISSIONS.PHARMACY_SALE_READ)
  async summary(@Query('from') from?: string, @Query('to') to?: string) {
    const data = await this.billing.summary({ from, to });
    return { data };
  }

  /**
   * Method: GET
   * URL: /api/pharmacy/billing/bills?q=&paymentStatus=&type=&page=&limit=
   * Purpose: Unified pharmacy bills list (doctor Rx + walk-in sales)
   * Required permission: pharmacy:sale-read
   * Request body: none
   * Response example: { data: { items: [{ type, id, refNo, patientName, total, paymentStatus }], meta } }
   * Error cases: 401, 403
   */
  @Get('bills')
  @RequirePermissions(PERMISSIONS.PHARMACY_SALE_READ)
  async listBills(
    @Query('q') q?: string,
    @Query('paymentStatus') paymentStatus?: string,
    @Query('type') type?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const data = await this.billing.listBills({
      q,
      paymentStatus,
      type,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 50,
    });
    return { data };
  }

  /**
   * Method: POST
   * URL: /api/pharmacy/billing/bills/:type/:id/confirm
   * Purpose: Confirm payment for a pharmacy bill (prescription or walk_in)
   * Required permission: pharmacy:sale-pay (walk-in) or prescription:pay (handled via both required — use sale-pay OR prescription pay via dual check)
   * Request body: { paymentChannel, paymentRef? }
   * Response example: { data: { type, bill: {...} } }
   * Error cases: 400 already paid, 401, 403, 404
   */
  @Post('bills/:type/:id/confirm')
  @RequirePermissions(PERMISSIONS.PHARMACY_SALE_PAY, PERMISSIONS.PRESCRIPTION_PAY)
  async confirmBill(
    @Param('type') type: string,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ConfirmWalkInPaymentDto,
    @CurrentUser() user: AuthUser,
  ) {
    if (!['prescription', 'rx', 'walk_in', 'walk-in', 'sale'].includes(type)) {
      throw new BadRequestException('type must be prescription or walk_in');
    }
    const data = await this.billing.confirmBill(type, id, dto, user);
    return { data };
  }
}
