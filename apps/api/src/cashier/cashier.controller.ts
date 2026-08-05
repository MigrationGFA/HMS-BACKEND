import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
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
import { CashierService } from './cashier.service';
import {
  CloseShiftDto,
  CreateDiscountDto,
  CreateRefundDto,
  OpenShiftDto,
  UpdateCashierSettingsDto,
} from './dto/cashier-ops.dto';

@Controller('cashier')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CashierController {
  constructor(private readonly cashierService: CashierService) {}

  /**
   * Method: GET
   * URL: /api/cashier/reports?from=&to=
   * Purpose: Revenue KPIs, by-source/channel breakdowns, outstanding unpaid bills
   * Required permission: cashier:report-read
   * Request body: none
   * Response example: { data: { kpis: { collected, refunds, receiptCount, outstanding, discounted }, bySource, byChannel, outstandingItems } }
   * Error cases: 401, 403
   */
  @Get('reports')
  @RequirePermissions(PERMISSIONS.CASHIER_REPORT_READ)
  async reports(@Query('from') from?: string, @Query('to') to?: string) {
    const data = await this.cashierService.getReports({ from, to });
    return { data };
  }

  /**
   * Method: GET
   * URL: /api/cashier/patients/:personId/payment-history
   * Purpose: Patient financial snapshot — receipts, outstanding bills, refunds
   * Required permission: cashier:receipt-read
   * Request body: none
   * Response example: { data: { person, outstanding, receipts, outstandingBills, refunds, wallet, walletTxns } }
   * Error cases: 401, 403, 404 patient not found
   */
  @Get('patients/:personId/payment-history')
  @RequirePermissions(PERMISSIONS.CASHIER_RECEIPT_READ)
  async patientPaymentHistory(
    @Param('personId', ParseIntPipe) personId: number,
  ) {
    const data = await this.cashierService.getPatientPaymentHistory(personId);
    return { data };
  }

  /**
   * Method: GET
   * URL: /api/cashier/receipts/verify?receiptNo=
   * Purpose: Verify any receipt (including fully Refunded) by receipt number
   * Required permission: cashier:receipt-read
   * Request body: none
   * Response example: { data: { valid: true, receipt: { receiptNo, amount, status, ... } } }
   * Error cases: 400 missing receiptNo, 401, 403, 404 not found
   */
  @Get('receipts/verify')
  @RequirePermissions(PERMISSIONS.CASHIER_RECEIPT_READ)
  async verifyReceipt(
    @Query('receiptNo') receiptNo: string,
    @CurrentUser() user: AuthUser,
  ) {
    const data = await this.cashierService.verifyReceipt(receiptNo, user);
    return { data };
  }

  /**
   * Method: GET
   * URL: /api/cashier/receipts?q=&page=&limit=
   * Purpose: List refundable payment receipts
   * Required permission: cashier:receipt-read
   */
  @Get('receipts')
  @RequirePermissions(PERMISSIONS.CASHIER_RECEIPT_READ)
  async listReceipts(
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const data = await this.cashierService.listReceipts({
      q,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 50,
    });
    return { data };
  }

  /**
   * Method: POST
   * URL: /api/cashier/receipts/:id/reprint
   * Purpose: Audit-only reprint event (optional watermark from settings)
   * Required permission: cashier:receipt-read
   * Request body: none
   * Response example: { data: { receiptId, receiptNo, watermark, reprinted: true } }
   * Error cases: 401, 403, 404
   */
  @Post('receipts/:id/reprint')
  @RequirePermissions(PERMISSIONS.CASHIER_RECEIPT_READ)
  async reprintReceipt(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
  ) {
    const data = await this.cashierService.reprintReceipt(id, user);
    return { data };
  }

  /**
   * Method: GET
   * URL: /api/cashier/refunds
   * Purpose: Refund request list + KPIs
   * Required permission: cashier:refund-request
   */
  @Get('refunds')
  @RequirePermissions(PERMISSIONS.CASHIER_REFUND_REQUEST)
  async listRefunds(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const data = await this.cashierService.listRefunds({
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 50,
    });
    return { data };
  }

  /**
   * Method: POST
   * URL: /api/cashier/refunds
   * Purpose: Create refund/reversal (partial or full amount)
   * Required permission: cashier:refund-request
   * Request body: { receiptId, amount, kind, method, reason }
   */
  @Post('refunds')
  @RequirePermissions(PERMISSIONS.CASHIER_REFUND_REQUEST)
  async createRefund(
    @Body() dto: CreateRefundDto,
    @CurrentUser() user: AuthUser,
  ) {
    const data = await this.cashierService.createRefund(dto, user);
    return { data };
  }

  /**
   * Method: PATCH
   * URL: /api/cashier/refunds/:id/approve
   * Purpose: Approve refund and apply to receipt
   * Required permission: cashier:refund-approve
   */
  @Patch('refunds/:id/approve')
  @RequirePermissions(PERMISSIONS.CASHIER_REFUND_APPROVE)
  async approveRefund(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
  ) {
    const data = await this.cashierService.approveRefund(id, user);
    return { data };
  }

  /**
   * Method: PATCH
   * URL: /api/cashier/refunds/:id/reject
   * Required permission: cashier:refund-approve
   */
  @Patch('refunds/:id/reject')
  @RequirePermissions(PERMISSIONS.CASHIER_REFUND_APPROVE)
  async rejectRefund(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
  ) {
    const data = await this.cashierService.rejectRefund(id, user);
    return { data };
  }

  /**
   * Method: GET
   * URL: /api/cashier/discounts/eligible
   * Purpose: Unpaid clinical bills for discount picker
   * Required permission: cashier:discount-request
   */
  @Get('discounts/eligible')
  @RequirePermissions(PERMISSIONS.CASHIER_DISCOUNT_REQUEST)
  async eligibleDiscounts() {
    const data = await this.cashierService.listEligibleBills();
    return { data };
  }

  /**
   * Method: GET
   * URL: /api/cashier/discounts
   * Required permission: cashier:discount-request
   */
  @Get('discounts')
  @RequirePermissions(PERMISSIONS.CASHIER_DISCOUNT_REQUEST)
  async listDiscounts(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const data = await this.cashierService.listDiscounts({
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 50,
    });
    return { data };
  }

  /**
   * Method: POST
   * URL: /api/cashier/discounts
   * Required permission: cashier:discount-request
   * Request body: { sourceType, sourceId, discKind, value?, category, reason }
   */
  @Post('discounts')
  @RequirePermissions(PERMISSIONS.CASHIER_DISCOUNT_REQUEST)
  async createDiscount(
    @Body() dto: CreateDiscountDto,
    @CurrentUser() user: AuthUser,
  ) {
    const data = await this.cashierService.createDiscount(dto, user);
    return { data };
  }

  /**
   * Method: PATCH
   * URL: /api/cashier/discounts/:id/approve
   * Required permission: cashier:discount-approve
   */
  @Patch('discounts/:id/approve')
  @RequirePermissions(PERMISSIONS.CASHIER_DISCOUNT_APPROVE)
  async approveDiscount(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
  ) {
    const data = await this.cashierService.approveDiscount(id, user);
    return { data };
  }

  /**
   * Method: PATCH
   * URL: /api/cashier/discounts/:id/reject
   * Required permission: cashier:discount-approve
   */
  @Patch('discounts/:id/reject')
  @RequirePermissions(PERMISSIONS.CASHIER_DISCOUNT_APPROVE)
  async rejectDiscount(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
  ) {
    const data = await this.cashierService.rejectDiscount(id, user);
    return { data };
  }

  /**
   * Method: GET
   * URL: /api/cashier/shifts/current
   * Required permission: cashier:shift-read
   */
  @Get('shifts/current')
  @RequirePermissions(PERMISSIONS.CASHIER_SHIFT_READ)
  async currentShift(@CurrentUser() user: AuthUser) {
    const data = await this.cashierService.currentShift(user);
    return { data };
  }

  /**
   * Method: GET
   * URL: /api/cashier/shifts
   * Required permission: cashier:shift-read
   */
  @Get('shifts')
  @RequirePermissions(PERMISSIONS.CASHIER_SHIFT_READ)
  async listShifts(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const data = await this.cashierService.listShifts({
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 50,
    });
    return { data };
  }

  /**
   * Method: POST
   * URL: /api/cashier/shifts/open
   * Required permission: cashier:shift-open
   * Request body: { openingFloat }
   */
  @Post('shifts/open')
  @RequirePermissions(PERMISSIONS.CASHIER_SHIFT_OPEN)
  async openShift(@Body() dto: OpenShiftDto, @CurrentUser() user: AuthUser) {
    const data = await this.cashierService.openShift(dto, user);
    return { data };
  }

  /**
   * Method: POST
   * URL: /api/cashier/shifts/:id/close
   * Required permission: cashier:shift-close
   * Request body: { actualCash, note? }
   */
  @Post('shifts/:id/close')
  @RequirePermissions(PERMISSIONS.CASHIER_SHIFT_CLOSE)
  async closeShift(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CloseShiftDto,
    @CurrentUser() user: AuthUser,
  ) {
    const data = await this.cashierService.closeShift(id, dto, user);
    return { data };
  }

  /**
   * Method: PATCH
   * URL: /api/cashier/shifts/:id/approve
   * Required permission: cashier:shift-approve
   */
  @Patch('shifts/:id/approve')
  @RequirePermissions(PERMISSIONS.CASHIER_SHIFT_APPROVE)
  async approveShift(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
  ) {
    const data = await this.cashierService.approveShift(id, user);
    return { data };
  }

  /**
   * Method: GET
   * URL: /api/cashier/audit?q=&page=&limit=
   * Purpose: Cashier-scoped audit trail (payments, refunds, discounts, shifts, settings)
   * Required permission: audit:read
   * Request body: none
   * Response example: { data: { items: [...], meta, stats } }
   * Error cases: 401, 403
   */
  @Get('audit')
  @RequirePermissions(PERMISSIONS.AUDIT_READ)
  async listAudit(
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const data = await this.cashierService.listAudit({
      q,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 50,
    });
    return { data };
  }

  /**
   * Method: GET
   * URL: /api/cashier/audit/stats
   * Purpose: Today counts for payments / refunds / discounts / shifts
   * Required permission: audit:read
   * Request body: none
   * Response example: { data: { totalToday, payments, refunds, discounts, shifts } }
   * Error cases: 401, 403
   */
  @Get('audit/stats')
  @RequirePermissions(PERMISSIONS.AUDIT_READ)
  async auditStats() {
    const data = await this.cashierService.auditStats();
    return { data };
  }

  /**
   * Method: GET
   * URL: /api/cashier/settings
   * Purpose: Load hospital cashier desk settings (channels + policy)
   * Required permission: cashier:settings-read
   * Request body: none
   * Response example: { data: { cashEnabled, posEnabled, requireOpenShift, ... } }
   * Error cases: 401, 403
   */
  @Get('settings')
  @RequirePermissions(PERMISSIONS.CASHIER_SETTINGS_READ)
  async getSettings() {
    const data = await this.cashierService.getOrCreateSettings();
    return { data };
  }

  /**
   * Method: PATCH
   * URL: /api/cashier/settings
   * Purpose: Update enabled payment channels and desk policy
   * Required permission: cashier:settings-update
   * Request body: UpdateCashierSettingsDto (partial booleans + varianceTolerance)
   * Response example: { data: { cashEnabled: false, ... } }
   * Error cases: 400 validation, 401, 403
   */
  @Patch('settings')
  @RequirePermissions(PERMISSIONS.CASHIER_SETTINGS_UPDATE)
  async updateSettings(
    @Body() dto: UpdateCashierSettingsDto,
    @CurrentUser() user: AuthUser,
  ) {
    const data = await this.cashierService.updateSettings(dto, user);
    return { data };
  }
}
