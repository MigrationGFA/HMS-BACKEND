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
import { CreatePurchaseRequestDto } from './dto/create-purchase-request.dto';
import { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto';
import { ReceiveStockDto } from './dto/receive-stock.dto';
import { ProcurementService } from './procurement.service';

@Controller('pharmacy/procurement')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PharmacyProcurementController {
  constructor(private readonly procurementService: ProcurementService) {}

  /**
   * Method: GET
   * URL: /api/pharmacy/procurement/stats
   * Purpose: Procurement dashboard summary cards
   * Required permission: pharmacy:read
   * Request body: none
   * Response example: { data: { pendingRequests, posAwaitingApproval, sentToSuppliers, partiallyDelivered, completed, totalProcurementValue } }
   * Error cases: 401 unauthorized, 403 missing permission
   */
  @Get('stats')
  @RequirePermissions(PERMISSIONS.PHARMACY_READ)
  async stats() {
    const stats = await this.procurementService.stats();
    return { data: stats };
  }

  // ---------- Purchase Requests ----------

  /**
   * Method: POST
   * URL: /api/pharmacy/procurement/requests
   * Purpose: Raise a purchase request for stock replenishment
   * Required permission: procurement:create
   * Request body: CreatePurchaseRequestDto { drugId, qty, priority?, reason?, note?, requestedBy? }
   * Response example: { data: { requestId, requestNo: "PR-2026-0001", drugName, qty, status: "Submitted", ... } }
   * Error cases: 400 validation / unknown drug, 401, 403
   */
  @Post('requests')
  @RequirePermissions(PERMISSIONS.PROCUREMENT_CREATE)
  async createRequest(
    @Body() dto: CreatePurchaseRequestDto,
    @CurrentUser() user: AuthUser,
  ) {
    const request = await this.procurementService.createRequest(dto, user);
    return { data: request };
  }

  /**
   * Method: GET
   * URL: /api/pharmacy/procurement/requests?q=&status=&page=&limit=
   * Purpose: List/search purchase requests
   * Required permission: pharmacy:read
   * Request body: none
   * Response example: { data: { items: [...], meta: { page, limit, total } } }
   * Error cases: 401 unauthorized, 403 missing permission
   */
  @Get('requests')
  @RequirePermissions(PERMISSIONS.PHARMACY_READ)
  async listRequests(
    @Query('q') q?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const result = await this.procurementService.listRequests({
      q,
      status,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 50,
    });
    return { data: result };
  }

  /**
   * Method: PATCH
   * URL: /api/pharmacy/procurement/requests/:id/approve
   * Purpose: Approve a pending purchase request
   * Required permission: procurement:approve
   * Request body: none
   * Response example: { data: { requestId, status: "Approved", approvedBy, ... } }
   * Error cases: 400 already decided, 401, 403, 404
   */
  @Patch('requests/:id/approve')
  @RequirePermissions(PERMISSIONS.PROCUREMENT_APPROVE)
  async approveRequest(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
  ) {
    const request = await this.procurementService.setRequestStatus(id, 'Approved', user);
    return { data: request };
  }

  /**
   * Method: PATCH
   * URL: /api/pharmacy/procurement/requests/:id/reject
   * Purpose: Reject a pending purchase request
   * Required permission: procurement:approve
   * Request body: none
   * Response example: { data: { requestId, status: "Rejected", ... } }
   * Error cases: 400 already decided, 401, 403, 404
   */
  @Patch('requests/:id/reject')
  @RequirePermissions(PERMISSIONS.PROCUREMENT_APPROVE)
  async rejectRequest(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
  ) {
    const request = await this.procurementService.setRequestStatus(id, 'Rejected', user);
    return { data: request };
  }

  // ---------- Purchase Orders ----------

  /**
   * Method: POST
   * URL: /api/pharmacy/procurement/orders
   * Purpose: Create a purchase order for a supplier (line items priced per drug)
   * Required permission: procurement:create
   * Request body: CreatePurchaseOrderDto { supplierId, items: [{ drugId, qty, unitCost }], expectedDate?, paymentTerms?, notes? }
   * Response example: { data: { poId, poNo: "PO-2026-0001", supplierName, items, total, approvalStatus: "Pending", ... } }
   * Error cases: 400 validation / unknown supplier or drug, 401, 403
   */
  @Post('orders')
  @RequirePermissions(PERMISSIONS.PROCUREMENT_CREATE)
  async createOrder(
    @Body() dto: CreatePurchaseOrderDto,
    @CurrentUser() user: AuthUser,
  ) {
    const order = await this.procurementService.createOrder(dto, user);
    return { data: order };
  }

  /**
   * Method: GET
   * URL: /api/pharmacy/procurement/orders?q=&status=&approvalStatus=&deliveryStatus=&page=&limit=
   * Purpose: List/search purchase orders
   * Required permission: pharmacy:read
   * Request body: none
   * Response example: { data: { items: [...], meta: { page, limit, total } } }
   * Error cases: 401 unauthorized, 403 missing permission
   */
  @Get('orders')
  @RequirePermissions(PERMISSIONS.PHARMACY_READ)
  async listOrders(
    @Query('q') q?: string,
    @Query('status') status?: string,
    @Query('approvalStatus') approvalStatus?: string,
    @Query('deliveryStatus') deliveryStatus?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const result = await this.procurementService.listOrders({
      q,
      status,
      approvalStatus,
      deliveryStatus,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 50,
    });
    return { data: result };
  }

  /**
   * Method: GET
   * URL: /api/pharmacy/procurement/orders/receivable
   * Purpose: List POs eligible for Receive Stock (Approved + Not Sent/Sent/Partial)
   * Required permission: pharmacy:read
   * Request body: none
   * Response example: { data: { items: [...], meta } }
   * Error cases: 401, 403
   */
  @Get('orders/receivable')
  @RequirePermissions(PERMISSIONS.PHARMACY_READ)
  async listReceivableOrders(
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const result = await this.procurementService.listReceivableOrders({
      q,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 100,
    });
    return { data: result };
  }

  /**
   * Method: GET
   * URL: /api/pharmacy/procurement/history?q=&status=&page=&limit=
   * Purpose: Procurement History tab — summary cards + completed/cancelled/partial POs
   * Required permission: pharmacy:read
   * Request body: none
   * Response example: { data: { cards: { completedOrders, cancelledOrders, grnCount, ... }, items: [...], meta } }
   * Error cases: 401, 403
   */
  @Get('history')
  @RequirePermissions(PERMISSIONS.PHARMACY_READ)
  async history(
    @Query('q') q?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const result = await this.procurementService.history({
      q,
      status,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 50,
    });
    return { data: result };
  }

  /**
   * Method: GET
   * URL: /api/pharmacy/procurement/orders/:id
   * Purpose: Purchase order detail with line items
   * Required permission: pharmacy:read
   * Request body: none
   * Response example: { data: { poId, poNo, items: [...], total, ... } }
   * Error cases: 401, 403, 404
   */
  @Get('orders/:id')
  @RequirePermissions(PERMISSIONS.PHARMACY_READ)
  async findOrder(@Param('id', ParseIntPipe) id: number) {
    const order = await this.procurementService.findOrderById(id);
    return { data: order };
  }

  /**
   * Method: PATCH
   * URL: /api/pharmacy/procurement/orders/:id/approve
   * Purpose: Approve a pending purchase order
   * Required permission: procurement:approve
   * Request body: none
   * Response example: { data: { poId, approvalStatus: "Approved", status: "Approved", ... } }
   * Error cases: 400 already decided, 401, 403, 404
   */
  @Patch('orders/:id/approve')
  @RequirePermissions(PERMISSIONS.PROCUREMENT_APPROVE)
  async approveOrder(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
  ) {
    const order = await this.procurementService.setOrderApproval(id, 'Approved', user);
    return { data: order };
  }

  /**
   * Method: PATCH
   * URL: /api/pharmacy/procurement/orders/:id/reject
   * Purpose: Reject a pending purchase order (cancels it)
   * Required permission: procurement:approve
   * Request body: none
   * Response example: { data: { poId, approvalStatus: "Rejected", status: "Cancelled", ... } }
   * Error cases: 400 already decided, 401, 403, 404
   */
  @Patch('orders/:id/reject')
  @RequirePermissions(PERMISSIONS.PROCUREMENT_APPROVE)
  async rejectOrder(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
  ) {
    const order = await this.procurementService.setOrderApproval(id, 'Rejected', user);
    return { data: order };
  }

  /**
   * Method: PATCH
   * URL: /api/pharmacy/procurement/orders/:id/send
   * Purpose: Mark an approved purchase order as sent to the supplier
   * Required permission: procurement:create
   * Request body: none
   * Response example: { data: { poId, deliveryStatus: "Sent", status: "Sent to Supplier", ... } }
   * Error cases: 400 not approved / already sent, 401, 403, 404
   */
  @Patch('orders/:id/send')
  @RequirePermissions(PERMISSIONS.PROCUREMENT_CREATE)
  async sendOrder(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
  ) {
    const order = await this.procurementService.sendOrder(id, user);
    return { data: order };
  }

  // ---------- Goods Received ----------

  /**
   * Method: POST
   * URL: /api/pharmacy/procurement/receive
   * Purpose: Receive stock (GRN). Creates a drug batch with expiry/location and
   *          increases available stock by the accepted quantity. poId optional
   *          for direct receipts; when present, PO must be Approved and delivery
   *          is updated (Not Sent auto-advances). Receiver is the authenticated user.
   * Required permission: stock:receive
   * Request body: ReceiveStockDto { poId?, drugId, batchNo, mfgDate?, expiryDate?, qtyOrdered?, qtyReceived, qtyDamaged?, unitCost?, sellingPrice?, location? }
   * Response example: { data: { grnId, grnNo: "GRN-2026-0001", drugName, batchNo, qtyAccepted, ... } }
   * Error cases: 400 validation / not approved / over-receipt / damaged > received, 401, 403
   */
  @Post('receive')
  @RequirePermissions(PERMISSIONS.STOCK_RECEIVE)
  async receive(@Body() dto: ReceiveStockDto, @CurrentUser() user: AuthUser) {
    const grn = await this.procurementService.receiveStock(dto, user);
    return { data: grn };
  }

  /**
   * Method: GET
   * URL: /api/pharmacy/procurement/grns?q=&page=&limit=
   * Purpose: List goods received notes
   * Required permission: pharmacy:read
   * Request body: none
   * Response example: { data: { items: [...], meta: { page, limit, total } } }
   * Error cases: 401 unauthorized, 403 missing permission
   */
  @Get('grns')
  @RequirePermissions(PERMISSIONS.PHARMACY_READ)
  async listGrns(
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const result = await this.procurementService.listGrns({
      q,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 50,
    });
    return { data: result };
  }
}
