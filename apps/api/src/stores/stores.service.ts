import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../auth/types/auth-user.type';
import {
  CreateRequisitionDto,
  CreateStoreItemDto,
  DecideRequisitionDto,
  IssueRequisitionDto,
  ListQueryDto,
  StockAdjustDto,
  StockIssueDto,
  StockReceiveDto,
  UpdateStoreItemDto,
} from './dto/stores.dto';

function actorLabel(user: AuthUser): string {
  return (
    [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email
  );
}

function pagination(page?: number, limit?: number) {
  const p = Math.max(page ?? 1, 1);
  const l = Math.min(Math.max(limit ?? 50, 1), 200);
  return { page: p, limit: l, skip: (p - 1) * l };
}

function padId(id: number, width = 5): string {
  return String(id).padStart(width, '0');
}

@Injectable()
export class StoresService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async getDashboard() {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [activeItems, pendingRequisitions, recentMovements, lowStockAgg] =
      await Promise.all([
        this.prisma.storeItems.count({ where: { STATUS: 'Active' } }),
        this.prisma.storeRequisitions.count({ where: { STATUS: 'Pending' } }),
        this.prisma.storeMovements.count({
          where: { CREATED_DATE: { gte: weekAgo } },
        }),
        this.prisma.$queryRaw<{ count: bigint }[]>`
          SELECT COUNT(DISTINCT i."ITEM_ID")::bigint AS count
          FROM "STORE_ITEMS" i
          LEFT JOIN (
            SELECT "ITEM_ID", SUM("QTY_AVAILABLE") AS on_hand
            FROM "STORE_BATCHES"
            WHERE "STATUS" = 'Available'
            GROUP BY "ITEM_ID"
          ) b ON b."ITEM_ID" = i."ITEM_ID"
          WHERE i."STATUS" = 'Active'
            AND i."REORDER_LEVEL" > 0
            AND COALESCE(b.on_hand, 0) <= i."REORDER_LEVEL"
        `,
      ]);

    return {
      asOf: new Date().toISOString(),
      activeItems,
      lowStockItems: Number(lowStockAgg[0]?.count ?? 0),
      pendingRequisitions,
      movementsLast7Days: recentMovements,
    };
  }

  async listItems(query: ListQueryDto) {
    const { page, limit, skip } = pagination(query.page, query.limit);
    const where: Prisma.StoreItemsWhereInput = {
      STATUS: query.status ?? undefined,
      ...(query.q
        ? {
            OR: [
              { NAME: { contains: query.q, mode: 'insensitive' } },
              { SKU: { contains: query.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.storeItems.findMany({
        where,
        include: { category: true },
        orderBy: { NAME: 'asc' },
        skip,
        take: limit,
      }),
      this.prisma.storeItems.count({ where }),
    ]);

    return {
      items: rows.map((r) => ({
        itemId: r.ITEM_ID,
        sku: r.SKU,
        name: r.NAME,
        categoryId: r.CATEGORY_ID,
        categoryName: r.category.NAME,
        unit: r.UNIT,
        reorderLevel: r.REORDER_LEVEL,
        status: r.STATUS,
      })),
      meta: { page, limit, total },
    };
  }

  async createItem(dto: CreateStoreItemDto, user: AuthUser) {
    const created = await this.prisma.storeItems.create({
      data: {
        SKU: dto.sku.trim(),
        NAME: dto.name.trim(),
        CATEGORY_ID: dto.categoryId,
        UNIT: dto.unit.trim(),
        REORDER_LEVEL: dto.reorderLevel ?? 0,
        DESCRIPTION: dto.description?.trim() ?? null,
        CREATED_BY_ID: user.id,
        CREATED_BY: actorLabel(user),
      },
      include: { category: true },
    });

    await this.audit.log({
      type: 'stores:item:create',
      entity: 'STORE_ITEMS',
      entityId: created.ITEM_ID,
      userId: user.id,
      createdBy: actorLabel(user),
    });

    return {
      itemId: created.ITEM_ID,
      sku: created.SKU,
      name: created.NAME,
      categoryName: created.category.NAME,
    };
  }

  async updateItem(id: number, dto: UpdateStoreItemDto, user: AuthUser) {
    const existing = await this.prisma.storeItems.findUnique({
      where: { ITEM_ID: id },
    });
    if (!existing) throw new NotFoundException('Store item not found');

    const updated = await this.prisma.storeItems.update({
      where: { ITEM_ID: id },
      data: {
        ...(dto.name != null ? { NAME: dto.name.trim() } : {}),
        ...(dto.categoryId != null ? { CATEGORY_ID: dto.categoryId } : {}),
        ...(dto.unit != null ? { UNIT: dto.unit.trim() } : {}),
        ...(dto.reorderLevel != null ? { REORDER_LEVEL: dto.reorderLevel } : {}),
        ...(dto.description !== undefined
          ? { DESCRIPTION: dto.description?.trim() ?? null }
          : {}),
        ...(dto.status != null ? { STATUS: dto.status } : {}),
        UPDATED_BY_ID: user.id,
        UPDATED_BY: actorLabel(user),
        UPDATED_DATE: new Date(),
      },
    });

    await this.audit.log({
      type: 'stores:item:update',
      entity: 'STORE_ITEMS',
      entityId: id,
      userId: user.id,
      createdBy: actorLabel(user),
    });

    return { itemId: updated.ITEM_ID, status: updated.STATUS };
  }

  async softDeleteItem(id: number, user: AuthUser) {
    return this.updateItem(id, { status: 'Inactive' }, user);
  }

  async receiveStock(dto: StockReceiveDto, user: AuthUser) {
    const item = await this.prisma.storeItems.findUnique({
      where: { ITEM_ID: dto.itemId },
    });
    if (!item || item.STATUS !== 'Active') {
      throw new BadRequestException('Item is not active');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const batch = await tx.storeBatches.create({
        data: {
          ITEM_ID: dto.itemId,
          LOCATION_ID: dto.locationId,
          BATCH_NO: dto.batchNo.trim(),
          EXPIRY_DATE: dto.expiryDate
            ? new Date(`${dto.expiryDate.slice(0, 10)}T00:00:00.000Z`)
            : null,
          QTY_RECEIVED: dto.qty,
          QTY_AVAILABLE: dto.qty,
          UNIT_COST: dto.unitCost ?? null,
          CREATED_BY_ID: user.id,
          CREATED_BY: actorLabel(user),
        },
      });

      await tx.storeMovements.create({
        data: {
          ITEM_ID: dto.itemId,
          BATCH_ID: batch.BATCH_ID,
          LOCATION_ID: dto.locationId,
          KIND: 'In',
          QTY: dto.qty,
          REF_TYPE: 'manual',
          REASON: dto.reason?.trim() ?? null,
          ACTOR_ID: user.id,
          ACTOR_LABEL: actorLabel(user),
        },
      });

      return batch;
    });

    await this.audit.log({
      type: 'stores:stock:receive',
      entity: 'STORE_BATCHES',
      entityId: result.BATCH_ID,
      userId: user.id,
      createdBy: actorLabel(user),
      newValue: { qty: dto.qty, itemId: dto.itemId },
    });

    return { batchId: result.BATCH_ID, qtyAvailable: result.QTY_AVAILABLE };
  }

  async issueStock(dto: StockIssueDto, user: AuthUser) {
    const batches = await this.prisma.storeBatches.findMany({
      where: {
        ITEM_ID: dto.itemId,
        LOCATION_ID: dto.locationId,
        STATUS: 'Available',
        QTY_AVAILABLE: { gt: 0 },
      },
      orderBy: [{ EXPIRY_DATE: 'asc' }, { BATCH_ID: 'asc' }],
    });

    let remaining = dto.qty;
    const touched: number[] = [];

    await this.prisma.$transaction(async (tx) => {
      for (const batch of batches) {
        if (remaining <= 0) break;
        const take = Math.min(batch.QTY_AVAILABLE, remaining);
        await tx.storeBatches.update({
          where: { BATCH_ID: batch.BATCH_ID },
          data: {
            QTY_AVAILABLE: batch.QTY_AVAILABLE - take,
            STATUS:
              batch.QTY_AVAILABLE - take <= 0 ? 'Exhausted' : batch.STATUS,
            UPDATED_DATE: new Date(),
          },
        });
        await tx.storeMovements.create({
          data: {
            ITEM_ID: dto.itemId,
            BATCH_ID: batch.BATCH_ID,
            LOCATION_ID: dto.locationId,
            KIND: 'Out',
            QTY: take,
            REF_TYPE: 'manual',
            REASON: dto.reason?.trim() ?? null,
            ACTOR_ID: user.id,
            ACTOR_LABEL: actorLabel(user),
          },
        });
        touched.push(batch.BATCH_ID);
        remaining -= take;
      }

      if (remaining > 0) {
        throw new BadRequestException('Insufficient stock at this location');
      }
    });

    return { itemId: dto.itemId, qtyIssued: dto.qty, batchIds: touched };
  }

  async adjustStock(dto: StockAdjustDto, user: AuthUser) {
    const batch = await this.prisma.storeBatches.findUnique({
      where: { BATCH_ID: dto.batchId },
    });
    if (!batch) throw new NotFoundException('Batch not found');

    const nextQty = batch.QTY_AVAILABLE + dto.qtyDelta;
    if (nextQty < 0) {
      throw new BadRequestException('Adjustment would make stock negative');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.storeBatches.update({
        where: { BATCH_ID: dto.batchId },
        data: {
          QTY_AVAILABLE: nextQty,
          STATUS: nextQty <= 0 ? 'Exhausted' : 'Available',
          UPDATED_DATE: new Date(),
        },
      });
      await tx.storeMovements.create({
        data: {
          ITEM_ID: batch.ITEM_ID,
          BATCH_ID: batch.BATCH_ID,
          LOCATION_ID: batch.LOCATION_ID,
          KIND: 'Adjust',
          QTY: Math.abs(dto.qtyDelta),
          REF_TYPE: 'manual',
          REASON: dto.reason,
          ACTOR_ID: user.id,
          ACTOR_LABEL: actorLabel(user),
        },
      });
    });

    return { batchId: dto.batchId, qtyAvailable: nextQty };
  }

  async listRequisitions(query: ListQueryDto) {
    const { page, limit, skip } = pagination(query.page, query.limit);
    const where: Prisma.StoreRequisitionsWhereInput = {
      ...(query.status ? { STATUS: query.status } : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.storeRequisitions.findMany({
        where,
        include: { lines: { include: { item: true } } },
        orderBy: { CREATED_DATE: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.storeRequisitions.count({ where }),
    ]);

    return {
      items: rows.map((r) => ({
        requisitionId: r.REQUISITION_ID,
        requisitionNo: r.REQUISITION_NO,
        fromDepartment: r.FROM_DEPARTMENT,
        status: r.STATUS,
        lineCount: r.lines.length,
        createdAt: r.CREATED_DATE.toISOString(),
      })),
      meta: { page, limit, total },
    };
  }

  async createRequisition(dto: CreateRequisitionDto, user: AuthUser) {
    const year = new Date().getFullYear();
    const label = actorLabel(user);

    const created = await this.prisma.$transaction(async (tx) => {
      const header = await tx.storeRequisitions.create({
        data: {
          REQUISITION_NO: `REQ-${year}-PENDING`,
          FROM_DEPARTMENT: dto.fromDepartment.trim(),
          LOCATION_ID: dto.locationId ?? null,
          NOTES: dto.notes?.trim() ?? null,
          REQUESTED_BY_ID: user.id,
          REQUESTED_BY: label,
          CREATED_BY_ID: user.id,
          CREATED_BY: label,
        },
      });

      const withNo = await tx.storeRequisitions.update({
        where: { REQUISITION_ID: header.REQUISITION_ID },
        data: {
          REQUISITION_NO: `REQ-${year}-${padId(header.REQUISITION_ID)}`,
        },
      });

      for (const line of dto.lines) {
        await tx.storeRequisitionLines.create({
          data: {
            REQUISITION_ID: withNo.REQUISITION_ID,
            ITEM_ID: line.itemId,
            QTY_REQUESTED: line.qtyRequested,
            NOTES: line.notes?.trim() ?? null,
          },
        });
      }

      return withNo;
    });

    return {
      requisitionId: created.REQUISITION_ID,
      requisitionNo: created.REQUISITION_NO,
      status: created.STATUS,
    };
  }

  async approveRequisition(
    id: number,
    dto: DecideRequisitionDto,
    user: AuthUser,
  ) {
    return this.decideRequisition(id, 'Approved', dto, user);
  }

  async rejectRequisition(
    id: number,
    dto: DecideRequisitionDto,
    user: AuthUser,
  ) {
    return this.decideRequisition(id, 'Rejected', dto, user);
  }

  private async decideRequisition(
    id: number,
    status: 'Approved' | 'Rejected',
    dto: DecideRequisitionDto,
    user: AuthUser,
  ) {
    const req = await this.prisma.storeRequisitions.findUnique({
      where: { REQUISITION_ID: id },
      include: { lines: true },
    });
    if (!req) throw new NotFoundException('Requisition not found');
    if (req.STATUS !== 'Pending') {
      throw new BadRequestException(`Requisition is already ${req.STATUS}`);
    }

    const label = actorLabel(user);
    await this.prisma.$transaction(async (tx) => {
      await tx.storeRequisitions.update({
        where: { REQUISITION_ID: id },
        data: {
          STATUS: status,
          DECISION_NOTE: dto.decisionNote?.trim() ?? null,
          APPROVED_BY_ID: user.id,
          APPROVED_BY: label,
          APPROVED_AT: new Date(),
          UPDATED_BY_ID: user.id,
          UPDATED_BY: label,
          UPDATED_DATE: new Date(),
        },
      });

      if (status === 'Approved') {
        for (const line of req.lines) {
          await tx.storeRequisitionLines.update({
            where: { LINE_ID: line.LINE_ID },
            data: { QTY_APPROVED: line.QTY_REQUESTED },
          });
        }
      }
    });

    return { requisitionId: id, status };
  }

  async issueRequisition(
    id: number,
    dto: IssueRequisitionDto,
    user: AuthUser,
  ) {
    const req = await this.prisma.storeRequisitions.findUnique({
      where: { REQUISITION_ID: id },
      include: { lines: true },
    });
    if (!req) throw new NotFoundException('Requisition not found');
    if (req.STATUS !== 'Approved') {
      throw new BadRequestException('Only approved requisitions can be issued');
    }

    const locationId = dto.locationId ?? req.LOCATION_ID;
    if (locationId == null) {
      throw new BadRequestException('Issue location is required');
    }

    const label = actorLabel(user);

    for (const line of req.lines) {
      const qty = line.QTY_APPROVED ?? line.QTY_REQUESTED;
      if (qty <= 0) continue;
      await this.issueStock(
        {
          itemId: line.ITEM_ID,
          locationId,
          qty,
          reason: `Requisition ${req.REQUISITION_NO}`,
        },
        user,
      );
      await this.prisma.storeRequisitionLines.update({
        where: { LINE_ID: line.LINE_ID },
        data: { QTY_ISSUED: qty },
      });
    }

    await this.prisma.storeRequisitions.update({
      where: { REQUISITION_ID: id },
      data: {
        STATUS: 'Issued',
        ISSUED_BY_ID: user.id,
        ISSUED_BY: label,
        ISSUED_AT: new Date(),
        UPDATED_DATE: new Date(),
      },
    });

    return { requisitionId: id, status: 'Issued' };
  }

  async listCategories() {
    const rows = await this.prisma.storeItemCategories.findMany({
      where: { STATUS: 'Active' },
      orderBy: { NAME: 'asc' },
    });
    return rows.map((c) => ({
      categoryId: c.CATEGORY_ID,
      code: c.CODE,
      name: c.NAME,
    }));
  }

  async listLocations() {
    const rows = await this.prisma.storeLocations.findMany({
      where: { STATUS: 'Active' },
      orderBy: { NAME: 'asc' },
    });
    return rows.map((l) => ({
      locationId: l.LOCATION_ID,
      code: l.CODE,
      name: l.NAME,
    }));
  }
}
