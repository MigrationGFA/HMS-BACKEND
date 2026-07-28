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
import {
  CreateWalkInSaleDto,
  DispenseWalkInSaleDto,
} from './dto/walk-in-sale.dto';
import { WalkInSalesService } from './walk-in-sales.service';

@Controller('pharmacy/walk-in')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class WalkInSalesController {
  constructor(private readonly walkInSales: WalkInSalesService) {}

  /**
   * Method: POST
   * URL: /api/pharmacy/walk-in
   * Purpose: Create walk-in pharmacy request (Awaiting Payment). Does NOT dispense.
   * Required permission: pharmacy:sale-create
   * Request body: CreateWalkInSaleDto { personId? | customerName+phone?, items[{drugId,quantity}], preferredPaymentChannel?, notes? }
   * Response example: { data: { saleId, saleNo: "WS-2026-0001", status: "Awaiting Payment", paymentStatus: "Unpaid", items, person } }
   * Error cases: 400 validation / insufficient stock, 401, 403, 404 person
   */
  @Post()
  @RequirePermissions(PERMISSIONS.PHARMACY_SALE_CREATE)
  async create(@Body() dto: CreateWalkInSaleDto, @CurrentUser() user: AuthUser) {
    const sale = await this.walkInSales.create(dto, user);
    return { data: sale };
  }

  /**
   * Method: GET
   * URL: /api/pharmacy/walk-in?q=&status=&paymentStatus=&page=&limit=
   * Purpose: List walk-in sales for pharmacy queue
   * Required permission: pharmacy:sale-read
   * Request body: none
   * Response example: { data: { items: [...], meta } }
   * Error cases: 401, 403
   */
  @Get()
  @RequirePermissions(PERMISSIONS.PHARMACY_SALE_READ)
  async list(
    @Query('q') q?: string,
    @Query('status') status?: string,
    @Query('paymentStatus') paymentStatus?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const result = await this.walkInSales.list({
      q,
      status,
      paymentStatus,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 50,
    });
    return { data: result };
  }

  /**
   * Method: GET
   * URL: /api/pharmacy/walk-in/by-no/:saleNo
   * Purpose: Load walk-in sale by human number (e.g. WS-2026-0001)
   * Required permission: pharmacy:sale-read
   * Request body: none
   * Response example: { data: { saleId, saleNo, paymentStatus, items, person } }
   * Error cases: 401, 403, 404
   */
  @Get('by-no/:saleNo')
  @RequirePermissions(PERMISSIONS.PHARMACY_SALE_READ)
  async findBySaleNo(@Param('saleNo') saleNo: string) {
    const sale = await this.walkInSales.findBySaleNo(saleNo);
    return { data: sale };
  }

  /**
   * Method: GET
   * URL: /api/pharmacy/walk-in/:id
   * Purpose: Walk-in sale detail
   * Required permission: pharmacy:sale-read
   * Request body: none
   * Response example: { data: { saleId, saleNo, ... } }
   * Error cases: 401, 403, 404
   */
  @Get(':id')
  @RequirePermissions(PERMISSIONS.PHARMACY_SALE_READ)
  async findOne(@Param('id', ParseIntPipe) id: number) {
    const sale = await this.walkInSales.findById(id);
    return { data: sale };
  }

  /**
   * Method: POST
   * URL: /api/pharmacy/walk-in/:id/dispense
   * Purpose: Dispense after cashier payment (FEFO stock deduct). Blocked if Unpaid.
   * Required permission: pharmacy:dispense
   * Request body: DispenseWalkInSaleDto { items?, pharmacyNotes? }
   * Response example: { data: { saleId, status: "Dispensed", dispensedBy, items } }
   * Error cases: 400 unpaid / insufficient stock, 401, 403, 404
   */
  @Post(':id/dispense')
  @RequirePermissions(PERMISSIONS.PHARMACY_DISPENSE)
  async dispense(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: DispenseWalkInSaleDto,
    @CurrentUser() user: AuthUser,
  ) {
    const sale = await this.walkInSales.dispense(id, dto ?? {}, user);
    return { data: sale };
  }

  /**
   * Method: PATCH
   * URL: /api/pharmacy/walk-in/:id/cancel
   * Purpose: Cancel unpaid / not-yet-dispensing walk-in sale
   * Required permission: pharmacy:sale-create
   * Request body: none
   * Response example: { data: { saleId, status: "Cancelled" } }
   * Error cases: 400 already dispensed, 401, 403, 404
   */
  @Patch(':id/cancel')
  @RequirePermissions(PERMISSIONS.PHARMACY_SALE_CREATE)
  async cancel(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
  ) {
    const sale = await this.walkInSales.cancel(id, user);
    return { data: sale };
  }
}
