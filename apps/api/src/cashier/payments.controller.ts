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

@Controller('cashier/payments')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PaymentsController {
  constructor(private readonly cardsService: CardsService) {}

  /**
   * Method: GET
   * URL: /api/cashier/payments/cards?paymentStatus=Pending&q=&page=&limit=
   * Purpose: Cashier work queue — registration cards awaiting payment
   * Required permission: card:read (CASHIER, FINANCE, RECORDS, ADMIN, SUPER_ADMIN, CMD, IT)
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
   * Required permission: card:confirm-payment (CASHIER, FINANCE, ADMIN, SUPER_ADMIN, CMD, IT)
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
}
