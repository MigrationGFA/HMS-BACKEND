import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Body,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { PERMISSIONS } from '../common/constants';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/types/auth-user.type';
import { RadiologyService } from './radiology.service';
import { ConfirmImagingPaymentDto } from './dto/radiology.dto';

/**
 * Cashier payment endpoints for imaging requests (Phase 3).
 * Mounted under /api/cashier/payments via PaymentsController extension —
 * this dedicated controller keeps radiology payment logic colocated.
 */
@Controller('cashier/payments')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ImagingPaymentsController {
  constructor(private readonly radiology: RadiologyService) {}

  @Get('imaging-requests')
  @RequirePermissions(PERMISSIONS.RADIOLOGY_REQUEST_READ)
  async list(
    @Query('paymentStatus') paymentStatus?: string,
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return {
      data: await this.radiology.listCashierQueue({
        paymentStatus: paymentStatus ?? 'Unpaid',
        q,
        page: page ? Number(page) : 1,
        limit: limit ? Number(limit) : 50,
      }),
    };
  }

  @Post('imaging-requests/:id/confirm')
  @RequirePermissions(PERMISSIONS.CARD_CONFIRM_PAYMENT)
  async confirm(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ConfirmImagingPaymentDto,
    @CurrentUser() user: AuthUser,
  ) {
    return { data: await this.radiology.confirmPayment(id, dto, user) };
  }
}
