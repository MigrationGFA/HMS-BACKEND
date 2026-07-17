import {
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
import { CardsService } from '../patients/cards.service';
import { ConfirmCardPaymentDto } from './dto/confirm-card-payment.dto';
import { ConfirmWalkInPaymentDto } from '../pharmacy/dto/walk-in-sale.dto';
import { WalkInSalesService } from '../pharmacy/walk-in-sales.service';

@Controller('cashier/payments')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PaymentsController {
  constructor(
    private readonly cardsService: CardsService,
    private readonly walkInSales: WalkInSalesService,
  ) {}

  /**
   * Method: GET
   * URL: /api/cashier/payments/cards?paymentStatus=Pending&q=&page=&limit=
   * Purpose: Cashier work queue — registration cards awaiting payment
   * Required permission: card:read
   * Request body: none
   * Response example: { data: { items: [{ cardId, cardNo, paymentStatus, totalAmount, person }], meta } }
   * Error cases: 401 unauthorized, 403 missing permission
   */
  @Get('cards')
  @RequirePermissions(PERMISSIONS.CARD_READ)
  async listCardPayments(
    @Query('paymentStatus') paymentStatus?: string,
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const result = await this.cardsService.list({
      paymentStatus: paymentStatus ?? 'Pending',
      q,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 50,
    });
    return { data: result };
  }

  /**
   * Method: POST
   * URL: /api/cashier/payments/cards/:cardId/confirm
   * Purpose: Confirm a pending registration-card payment (unblocks Records workflow)
   * Required permission: card:confirm-payment
   * Request body: { paymentChannel: "Cash" | "POS Card" | "Bank Transfer" | "Online Card" | "Wallet", paymentRef?: string }
   * Response example: { data: { cardId, paymentStatus: "Paid", status: "Active", paidAt, confirmedBy } }
   * Error cases: 400 validation, 401 unauthorized, 403 missing permission, 404 card not found, 409 already paid/waived
   */
  @Post('cards/:cardId/confirm')
  @RequirePermissions(PERMISSIONS.CARD_CONFIRM_PAYMENT)
  async confirmCardPayment(
    @Param('cardId', ParseIntPipe) cardId: number,
    @Body() dto: ConfirmCardPaymentDto,
    @CurrentUser() user: AuthUser,
  ) {
    const card = await this.cardsService.confirmPayment(cardId, dto, user);
    return { data: card };
  }

  /**
   * Method: GET
   * URL: /api/cashier/payments/pharmacy-sales?paymentStatus=Unpaid&q=&page=&limit=
   * Purpose: Cashier queue — walk-in pharmacy sales awaiting payment before dispense
   * Required permission: pharmacy:sale-read
   * Request body: none
   * Response example: { data: { items: [{ saleId, saleNo, total, paymentStatus, person, items }], meta } }
   * Error cases: 401, 403
   */
  @Get('pharmacy-sales')
  @RequirePermissions(PERMISSIONS.PHARMACY_SALE_READ)
  async listPharmacySales(
    @Query('paymentStatus') paymentStatus?: string,
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const result = await this.walkInSales.list({
      paymentStatus: paymentStatus ?? 'Unpaid',
      q,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 50,
    });
    return { data: result };
  }

  /**
   * Method: POST
   * URL: /api/cashier/payments/pharmacy-sales/:saleId/confirm
   * Purpose: Confirm walk-in pharmacy payment — unlocks pharmacist dispense
   * Required permission: pharmacy:sale-pay
   * Request body: { paymentChannel: "Cash" | "POS Card" | "Bank Transfer" | "Online Card" | "Wallet", paymentRef?: string }
   * Response example: { data: { saleId, saleNo, paymentStatus: "Paid", status: "Paid", paidBy } }
   * Error cases: 400 already paid / cancelled, 401, 403, 404
   */
  @Post('pharmacy-sales/:saleId/confirm')
  @RequirePermissions(PERMISSIONS.PHARMACY_SALE_PAY)
  async confirmPharmacySalePayment(
    @Param('saleId', ParseIntPipe) saleId: number,
    @Body() dto: ConfirmWalkInPaymentDto,
    @CurrentUser() user: AuthUser,
  ) {
    const sale = await this.walkInSales.confirmPayment(saleId, dto, user);
    return { data: sale };
  }
}
