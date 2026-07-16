import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreatePurchaseRequestDto } from './dto/create-purchase-request.dto';
import { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto';
import { ReceiveStockDto } from './dto/receive-stock.dto';
import type { AuthUser } from '../auth/types/auth-user.type';

export type PurchaseRequestResponse = {
  requestId: number;
  requestNo: string;
  drugId: number;
  drugName: string;
  category: string | null;
  currentStock: number;
  reorderLevel: number;
  qty: number;
  priority: string;
  status: string;
  reason: string | null;
  note: string | null;
  requestedBy: string | null;
  approvedBy: string | null;
  createdAt: string | null;
};

export type PurchaseOrderResponse = {
  poId: number;
  poNo: string;
  supplierId: number;
  supplierName: string;
  items: {
    poItemId: number;
    drugId: number;
    drugName: string;
    qty: number;
    unitCost: number;
    qtyReceived: number;
  }[];
  total: number;
  approvalStatus: string;
  deliveryStatus: string;
  status: string;
  expectedDate: string | null;
  paymentTerms: string | null;
  notes: string | null;
  createdBy: string | null;
  approvedBy: string | null;
  createdAt: string | null;
};

export type GrnResponse = {
  grnId: number;
  grnNo: string;
  poId: number | null;
  poNo: string | null;
  supplierName: string | null;
  drugId: number;
  drugName: string;
  batchNo: string;
  mfgDate: string | null;
  expiryDate: string | null;
  qtyOrdered: number;
  qtyReceived: number;
  qtyDamaged: number;
  qtyAccepted: number;
  location: string | null;
  receivedBy: string | null;
  receivedAt: string | null;
};

type PrRow = Prisma.PurchaseRequestsGetPayload<{
  include: { drug: { include: { batches: true } } };
}>;
type PoRow = Prisma.PurchaseOrdersGetPayload<{
  include: { supplier: true; items: { include: { drug: true } } };
}>;
type GrnRow = Prisma.GoodsReceivedNotesGetPayload<{
  include: { drug: true; purchaseOrder: { include: { supplier: true } } };
}>;

function actorLabel(actor?: AuthUser): string {
  if (!actor) return 'SYSTEM';
  const name = [actor.firstName, actor.lastName].filter(Boolean).join(' ');
  return name || actor.email;
}

function pad(id: number): string {
  return String(id).padStart(4, '0');
}

function toPrResponse(row: PrRow): PurchaseRequestResponse {
  const stock = row.drug.batches
    .filter((b) => b.STATUS === 'Available')
    .reduce((s, b) => s + b.QTY_AVAILABLE, 0);
  return {
    requestId: row.REQUEST_ID,
    requestNo: row.REQUEST_NO,
    drugId: row.DRUG_ID,
    drugName: [row.drug.NAME, row.drug.STRENGTH].filter(Boolean).join(' '),
    category: row.drug.CATEGORY,
    currentStock: stock,
    reorderLevel: row.drug.REORDER_LEVEL,
    qty: row.QTY,
    priority: row.PRIORITY,
    status: row.STATUS,
    reason: row.REASON,
    note: row.NOTE,
    requestedBy: row.REQUESTED_BY,
    approvedBy: row.APPROVED_BY,
    createdAt: row.CREATED_DATE?.toISOString() ?? null,
  };
}

function toPoResponse(row: PoRow): PurchaseOrderResponse {
  return {
    poId: row.PO_ID,
    poNo: row.PO_NO,
    supplierId: row.SUPPLIER_ID,
    supplierName: row.supplier.NAME,
    items: row.items.map((i) => ({
      poItemId: i.PO_ITEM_ID,
      drugId: i.DRUG_ID,
      drugName: [i.drug.NAME, i.drug.STRENGTH].filter(Boolean).join(' '),
      qty: i.QTY,
      unitCost: Number(i.UNIT_COST),
      qtyReceived: i.QTY_RECEIVED,
    })),
    total: Number(row.TOTAL),
    approvalStatus: row.APPROVAL_STATUS,
    deliveryStatus: row.DELIVERY_STATUS,
    status: row.STATUS,
    expectedDate: row.EXPECTED_DATE?.toISOString() ?? null,
    paymentTerms: row.PAYMENT_TERMS,
    notes: row.NOTES,
    createdBy: row.CREATED_BY,
    approvedBy: row.APPROVED_BY,
    createdAt: row.CREATED_DATE?.toISOString() ?? null,
  };
}

function toGrnResponse(row: GrnRow): GrnResponse {
  return {
    grnId: row.GRN_ID,
    grnNo: row.GRN_NO,
    poId: row.PO_ID,
    poNo: row.purchaseOrder?.PO_NO ?? null,
    supplierName: row.purchaseOrder?.supplier.NAME ?? null,
    drugId: row.DRUG_ID,
    drugName: [row.drug.NAME, row.drug.STRENGTH].filter(Boolean).join(' '),
    batchNo: row.BATCH_NO,
    mfgDate: row.MFG_DATE?.toISOString() ?? null,
    expiryDate: row.EXPIRY_DATE?.toISOString() ?? null,
    qtyOrdered: row.QTY_ORDERED,
    qtyReceived: row.QTY_RECEIVED,
    qtyDamaged: row.QTY_DAMAGED,
    qtyAccepted: row.QTY_ACCEPTED,
    location: row.LOCATION,
    receivedBy: row.RECEIVED_BY,
    receivedAt: row.RECEIVED_DATE?.toISOString() ?? null,
  };
}

const PR_INCLUDE = { drug: { include: { batches: true } } } as const;
const PO_INCLUDE = { supplier: true, items: { include: { drug: true } } } as const;
const GRN_INCLUDE = {
  drug: true,
  purchaseOrder: { include: { supplier: true } },
} as const;

@Injectable()
export class ProcurementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ---------- Purchase Requests ----------

  async createRequest(
    dto: CreatePurchaseRequestDto,
    actor?: AuthUser,
  ): Promise<PurchaseRequestResponse> {
    const drug = await this.prisma.drugs.findUnique({
      where: { DRUG_ID: dto.drugId },
    });
    if (!drug) throw new BadRequestException('Drug does not exist');

    const year = new Date().getFullYear();
    const created = await this.prisma.$transaction(async (tx) => {
      const row = await tx.purchaseRequests.create({
        data: {
          REQUEST_NO: `PR-${year}-PENDING`,
          DRUG_ID: dto.drugId,
          QTY: dto.qty,
          PRIORITY: dto.priority ?? 'Normal',
          STATUS: 'Submitted',
          REASON: dto.reason ?? null,
          NOTE: dto.note ?? null,
          REQUESTED_BY: dto.requestedBy ?? actorLabel(actor),
          CREATED_BY_ID: actor?.id ?? null,
          CREATED_BY: actorLabel(actor),
          CREATED_DATE: new Date(),
        },
      });
      return tx.purchaseRequests.update({
        where: { REQUEST_ID: row.REQUEST_ID },
        data: { REQUEST_NO: `PR-${year}-${pad(row.REQUEST_ID)}` },
        include: PR_INCLUDE,
      });
    });

    await this.audit.log({
      type: 'procurement:request-create',
      entity: 'purchase_requests',
      entityId: created.REQUEST_ID,
      userId: actor?.id,
      createdBy: actorLabel(actor),
      item: `Purchase request ${created.REQUEST_NO} — ${dto.qty} × ${drug.NAME}`,
      newValue: toPrResponse(created),
    });

    return toPrResponse(created);
  }

  async listRequests(params?: {
    q?: string;
    status?: string;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(params?.page ?? 1, 1);
    const limit = Math.min(Math.max(params?.limit ?? 50, 1), 100);
    const where: Prisma.PurchaseRequestsWhereInput = {
      ...(params?.status && params.status !== 'all' ? { STATUS: params.status } : {}),
      ...(params?.q
        ? {
            OR: [
              { REQUEST_NO: { contains: params.q, mode: 'insensitive' } },
              { REQUESTED_BY: { contains: params.q, mode: 'insensitive' } },
              { drug: { NAME: { contains: params.q, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.purchaseRequests.findMany({
        where,
        include: PR_INCLUDE,
        orderBy: { CREATED_DATE: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.purchaseRequests.count({ where }),
    ]);

    return { items: rows.map(toPrResponse), meta: { page, limit, total } };
  }

  async setRequestStatus(
    id: number,
    status: 'Approved' | 'Rejected',
    actor?: AuthUser,
  ): Promise<PurchaseRequestResponse> {
    const existing = await this.prisma.purchaseRequests.findUnique({
      where: { REQUEST_ID: id },
      include: PR_INCLUDE,
    });
    if (!existing) throw new NotFoundException('Purchase request not found');
    if (existing.STATUS === 'Approved' || existing.STATUS === 'Rejected') {
      throw new BadRequestException(`Request is already ${existing.STATUS}`);
    }

    const updated = await this.prisma.purchaseRequests.update({
      where: { REQUEST_ID: id },
      data: {
        STATUS: status,
        APPROVED_BY: actorLabel(actor),
        APPROVED_DATE: new Date(),
        UPDATED_BY_ID: actor?.id ?? null,
        UPDATED_BY: actorLabel(actor),
        UPDATED_DATE: new Date(),
      },
      include: PR_INCLUDE,
    });

    await this.audit.log({
      type: `procurement:request-${status.toLowerCase()}`,
      entity: 'purchase_requests',
      entityId: id,
      userId: actor?.id,
      createdBy: actorLabel(actor),
      item: `Purchase request ${updated.REQUEST_NO} ${status.toLowerCase()}`,
      oldValue: { status: existing.STATUS },
      newValue: { status },
    });

    return toPrResponse(updated);
  }

  // ---------- Purchase Orders ----------

  async createOrder(
    dto: CreatePurchaseOrderDto,
    actor?: AuthUser,
  ): Promise<PurchaseOrderResponse> {
    const supplier = await this.prisma.suppliers.findUnique({
      where: { SUPPLIER_ID: dto.supplierId },
    });
    if (!supplier) throw new BadRequestException('Supplier does not exist');

    const drugIds = dto.items.map((i) => i.drugId);
    const drugs = await this.prisma.drugs.findMany({
      where: { DRUG_ID: { in: drugIds } },
    });
    if (drugs.length !== new Set(drugIds).size) {
      throw new BadRequestException('One or more drugs do not exist');
    }

    const total = dto.items.reduce((s, i) => s + i.qty * i.unitCost, 0);
    const year = new Date().getFullYear();

    const created = await this.prisma.$transaction(async (tx) => {
      const row = await tx.purchaseOrders.create({
        data: {
          PO_NO: `PO-${year}-PENDING`,
          SUPPLIER_ID: dto.supplierId,
          TOTAL: total,
          APPROVAL_STATUS: 'Pending',
          DELIVERY_STATUS: 'Not Sent',
          STATUS: 'Pending Approval',
          EXPECTED_DATE: dto.expectedDate ? new Date(dto.expectedDate) : null,
          PAYMENT_TERMS: dto.paymentTerms ?? null,
          NOTES: dto.notes ?? null,
          CREATED_BY_ID: actor?.id ?? null,
          CREATED_BY: actorLabel(actor),
          CREATED_DATE: new Date(),
          items: {
            create: dto.items.map((i) => ({
              DRUG_ID: i.drugId,
              QTY: i.qty,
              UNIT_COST: i.unitCost,
            })),
          },
        },
      });
      return tx.purchaseOrders.update({
        where: { PO_ID: row.PO_ID },
        data: { PO_NO: `PO-${year}-${pad(row.PO_ID)}` },
        include: PO_INCLUDE,
      });
    });

    await this.audit.log({
      type: 'procurement:po-create',
      entity: 'purchase_orders',
      entityId: created.PO_ID,
      userId: actor?.id,
      createdBy: actorLabel(actor),
      item: `Purchase order ${created.PO_NO} → ${supplier.NAME} (${dto.items.length} items)`,
      newValue: toPoResponse(created),
    });

    return toPoResponse(created);
  }

  async listOrders(params?: {
    q?: string;
    status?: string;
    approvalStatus?: string;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(params?.page ?? 1, 1);
    const limit = Math.min(Math.max(params?.limit ?? 50, 1), 100);
    const where: Prisma.PurchaseOrdersWhereInput = {
      ...(params?.status && params.status !== 'all' ? { STATUS: params.status } : {}),
      ...(params?.approvalStatus && params.approvalStatus !== 'all'
        ? { APPROVAL_STATUS: params.approvalStatus }
        : {}),
      ...(params?.q
        ? {
            OR: [
              { PO_NO: { contains: params.q, mode: 'insensitive' } },
              { supplier: { NAME: { contains: params.q, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.purchaseOrders.findMany({
        where,
        include: PO_INCLUDE,
        orderBy: { CREATED_DATE: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.purchaseOrders.count({ where }),
    ]);

    return { items: rows.map(toPoResponse), meta: { page, limit, total } };
  }

  async findOrderById(id: number): Promise<PurchaseOrderResponse> {
    const row = await this.prisma.purchaseOrders.findUnique({
      where: { PO_ID: id },
      include: PO_INCLUDE,
    });
    if (!row) throw new NotFoundException('Purchase order not found');
    return toPoResponse(row);
  }

  async setOrderApproval(
    id: number,
    approval: 'Approved' | 'Rejected',
    actor?: AuthUser,
  ): Promise<PurchaseOrderResponse> {
    const existing = await this.prisma.purchaseOrders.findUnique({
      where: { PO_ID: id },
      include: PO_INCLUDE,
    });
    if (!existing) throw new NotFoundException('Purchase order not found');
    if (existing.APPROVAL_STATUS !== 'Pending') {
      throw new BadRequestException(`Order is already ${existing.APPROVAL_STATUS}`);
    }

    const updated = await this.prisma.purchaseOrders.update({
      where: { PO_ID: id },
      data: {
        APPROVAL_STATUS: approval,
        STATUS: approval === 'Approved' ? 'Approved' : 'Cancelled',
        APPROVED_BY: actorLabel(actor),
        APPROVED_DATE: new Date(),
        UPDATED_BY_ID: actor?.id ?? null,
        UPDATED_BY: actorLabel(actor),
        UPDATED_DATE: new Date(),
      },
      include: PO_INCLUDE,
    });

    await this.audit.log({
      type: `procurement:po-${approval.toLowerCase()}`,
      entity: 'purchase_orders',
      entityId: id,
      userId: actor?.id,
      createdBy: actorLabel(actor),
      item: `Purchase order ${updated.PO_NO} ${approval.toLowerCase()}`,
      oldValue: { approvalStatus: existing.APPROVAL_STATUS, status: existing.STATUS },
      newValue: { approvalStatus: approval, status: updated.STATUS },
    });

    return toPoResponse(updated);
  }

  async sendOrder(id: number, actor?: AuthUser): Promise<PurchaseOrderResponse> {
    const existing = await this.prisma.purchaseOrders.findUnique({
      where: { PO_ID: id },
      include: PO_INCLUDE,
    });
    if (!existing) throw new NotFoundException('Purchase order not found');
    if (existing.APPROVAL_STATUS !== 'Approved') {
      throw new BadRequestException('Order must be approved before sending');
    }
    if (existing.DELIVERY_STATUS !== 'Not Sent') {
      throw new BadRequestException(`Order is already ${existing.DELIVERY_STATUS}`);
    }

    const updated = await this.prisma.purchaseOrders.update({
      where: { PO_ID: id },
      data: {
        DELIVERY_STATUS: 'Sent',
        STATUS: 'Sent to Supplier',
        UPDATED_BY_ID: actor?.id ?? null,
        UPDATED_BY: actorLabel(actor),
        UPDATED_DATE: new Date(),
      },
      include: PO_INCLUDE,
    });

    await this.audit.log({
      type: 'procurement:po-send',
      entity: 'purchase_orders',
      entityId: id,
      userId: actor?.id,
      createdBy: actorLabel(actor),
      item: `Purchase order ${updated.PO_NO} sent to ${updated.supplier.NAME}`,
      oldValue: { deliveryStatus: 'Not Sent' },
      newValue: { deliveryStatus: 'Sent' },
    });

    return toPoResponse(updated);
  }

  // ---------- Goods Received / Stock Receipt ----------

  async receiveStock(dto: ReceiveStockDto, actor?: AuthUser): Promise<GrnResponse> {
    const drug = await this.prisma.drugs.findUnique({
      where: { DRUG_ID: dto.drugId },
    });
    if (!drug) throw new BadRequestException('Drug does not exist');

    let po: PoRow | null = null;
    if (dto.poId != null) {
      po = await this.prisma.purchaseOrders.findUnique({
        where: { PO_ID: dto.poId },
        include: PO_INCLUDE,
      });
      if (!po) throw new BadRequestException('Purchase order does not exist');
      if (!po.items.some((i) => i.DRUG_ID === dto.drugId)) {
        throw new BadRequestException('Drug is not on this purchase order');
      }
    }

    const qtyDamaged = dto.qtyDamaged ?? 0;
    if (qtyDamaged > dto.qtyReceived) {
      throw new BadRequestException('Damaged quantity cannot exceed received quantity');
    }
    const qtyAccepted = dto.qtyReceived - qtyDamaged;
    const year = new Date().getFullYear();
    const receivedBy = dto.receivedBy ?? actorLabel(actor);

    const grn = await this.prisma.$transaction(async (tx) => {
      const row = await tx.goodsReceivedNotes.create({
        data: {
          GRN_NO: `GRN-${year}-PENDING`,
          PO_ID: dto.poId ?? null,
          DRUG_ID: dto.drugId,
          BATCH_NO: dto.batchNo.trim(),
          MFG_DATE: dto.mfgDate ? new Date(dto.mfgDate) : null,
          EXPIRY_DATE: dto.expiryDate ? new Date(dto.expiryDate) : null,
          QTY_ORDERED: dto.qtyOrdered ?? 0,
          QTY_RECEIVED: dto.qtyReceived,
          QTY_DAMAGED: qtyDamaged,
          QTY_ACCEPTED: qtyAccepted,
          UNIT_COST: dto.unitCost ?? null,
          LOCATION: dto.location ?? null,
          RECEIVED_BY: receivedBy,
          RECEIVED_DATE: new Date(),
          CREATED_BY_ID: actor?.id ?? null,
          CREATED_BY: actorLabel(actor),
          CREATED_DATE: new Date(),
        },
      });

      const withNo = await tx.goodsReceivedNotes.update({
        where: { GRN_ID: row.GRN_ID },
        data: { GRN_NO: `GRN-${year}-${pad(row.GRN_ID)}` },
        include: GRN_INCLUDE,
      });

      // Each acceptance creates a batch so expiry/amount are tracked per receipt.
      if (qtyAccepted > 0) {
        await tx.drugBatches.create({
          data: {
            DRUG_ID: dto.drugId,
            BATCH_NO: dto.batchNo.trim(),
            MFG_DATE: dto.mfgDate ? new Date(dto.mfgDate) : null,
            EXPIRY_DATE: dto.expiryDate ? new Date(dto.expiryDate) : null,
            QTY_RECEIVED: qtyAccepted,
            QTY_AVAILABLE: qtyAccepted,
            UNIT_COST: dto.unitCost ?? null,
            SELLING_PRICE: dto.sellingPrice ?? null,
            LOCATION: dto.location ?? null,
            GRN_ID: withNo.GRN_ID,
            STATUS: 'Available',
            CREATED_BY_ID: actor?.id ?? null,
            CREATED_BY: actorLabel(actor),
            CREATED_DATE: new Date(),
          },
        });
      }

      if (po) {
        const item = po.items.find((i) => i.DRUG_ID === dto.drugId)!;
        await tx.purchaseOrderItems.update({
          where: { PO_ITEM_ID: item.PO_ITEM_ID },
          data: { QTY_RECEIVED: { increment: qtyAccepted } },
        });

        const items = await tx.purchaseOrderItems.findMany({
          where: { PO_ID: po.PO_ID },
        });
        const fullyReceived = items.every((i) => i.QTY_RECEIVED >= i.QTY);
        await tx.purchaseOrders.update({
          where: { PO_ID: po.PO_ID },
          data: {
            DELIVERY_STATUS: fullyReceived ? 'Delivered' : 'Partial',
            STATUS: fullyReceived ? 'Completed' : 'Partially Delivered',
            UPDATED_BY_ID: actor?.id ?? null,
            UPDATED_BY: actorLabel(actor),
            UPDATED_DATE: new Date(),
          },
        });
      }

      return withNo;
    });

    await this.audit.log({
      type: 'stock:receive',
      entity: 'goods_received_notes',
      entityId: grn.GRN_ID,
      userId: actor?.id,
      createdBy: actorLabel(actor),
      item: `Stock received ${grn.GRN_NO}: ${qtyAccepted} × ${drug.NAME} (batch ${dto.batchNo})`,
      newValue: toGrnResponse(grn),
    });

    return toGrnResponse(grn);
  }

  async listGrns(params?: { q?: string; page?: number; limit?: number }) {
    const page = Math.max(params?.page ?? 1, 1);
    const limit = Math.min(Math.max(params?.limit ?? 50, 1), 100);
    const where: Prisma.GoodsReceivedNotesWhereInput = params?.q
      ? {
          OR: [
            { GRN_NO: { contains: params.q, mode: 'insensitive' } },
            { BATCH_NO: { contains: params.q, mode: 'insensitive' } },
            { drug: { NAME: { contains: params.q, mode: 'insensitive' } } },
            { purchaseOrder: { PO_NO: { contains: params.q, mode: 'insensitive' } } },
          ],
        }
      : {};

    const [rows, total] = await Promise.all([
      this.prisma.goodsReceivedNotes.findMany({
        where,
        include: GRN_INCLUDE,
        orderBy: { RECEIVED_DATE: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.goodsReceivedNotes.count({ where }),
    ]);

    return { items: rows.map(toGrnResponse), meta: { page, limit, total } };
  }

  /** Summary cards for the procurement dashboard. */
  async stats() {
    const [
      pendingRequests,
      posAwaitingApproval,
      sentToSuppliers,
      partiallyDelivered,
      completed,
      openPoTotal,
    ] = await Promise.all([
      this.prisma.purchaseRequests.count({
        where: { STATUS: { in: ['Submitted', 'Pending Approval'] } },
      }),
      this.prisma.purchaseOrders.count({ where: { APPROVAL_STATUS: 'Pending' } }),
      this.prisma.purchaseOrders.count({ where: { DELIVERY_STATUS: 'Sent' } }),
      this.prisma.purchaseOrders.count({ where: { DELIVERY_STATUS: 'Partial' } }),
      this.prisma.purchaseOrders.count({ where: { STATUS: 'Completed' } }),
      this.prisma.purchaseOrders.aggregate({
        _sum: { TOTAL: true },
        where: { STATUS: { notIn: ['Cancelled'] } },
      }),
    ]);

    return {
      asOf: new Date().toISOString(),
      pendingRequests,
      posAwaitingApproval,
      sentToSuppliers,
      partiallyDelivered,
      completed,
      totalProcurementValue: Number(openPoTotal._sum.TOTAL ?? 0),
    };
  }
}
