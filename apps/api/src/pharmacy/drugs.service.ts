import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateDrugDto } from './dto/create-drug.dto';
import { UpdateDrugDto } from './dto/update-drug.dto';
import { AdjustStockDto } from './dto/adjust-stock.dto';
import type { AuthUser } from '../auth/types/auth-user.type';
import { PharmacySettingsService } from './pharmacy-settings.service';

const FALLBACK_EXPIRING_SOON_DAYS = 180;
const FALLBACK_RECENTLY_RECEIVED_DAYS = 7;

export type DrugBatchResponse = {
  batchId: number;
  batchNo: string;
  mfgDate: string | null;
  expiryDate: string | null;
  qtyReceived: number;
  qtyAvailable: number;
  unitCost: number | null;
  sellingPrice: number | null;
  location: string | null;
  status: string;
  receivedAt: string | null;
};

export type DrugResponse = {
  drugId: number;
  name: string;
  genericName: string | null;
  category: string | null;
  form: string | null;
  strength: string | null;
  unit: string | null;
  unitPrice: number;
  reorderLevel: number;
  shelf: string | null;
  controlled: boolean;
  status: string;
  supplierId: number | null;
  supplierName: string | null;
  /** Sum of available quantity across non-expired batches. */
  stock: number;
  /** Earliest expiry among batches that still hold stock. */
  earliestExpiry: string | null;
  /** Batch number of the earliest-expiry batch holding stock. */
  earliestBatchNo: string | null;
  /** Out of Stock | Low | Expired | Active (derived) */
  stockStatus: string;
  createdAt: string | null;
  batches?: DrugBatchResponse[];
};

type DrugWithRelations = Prisma.DrugsGetPayload<{
  include: { supplier: true; batches: true };
}>;

function actorLabel(actor?: AuthUser): string {
  if (!actor) return 'SYSTEM';
  const name = [actor.firstName, actor.lastName].filter(Boolean).join(' ');
  return name || actor.email;
}

function toBatchResponse(b: DrugWithRelations['batches'][number]): DrugBatchResponse {
  return {
    batchId: b.BATCH_ID,
    batchNo: b.BATCH_NO,
    mfgDate: b.MFG_DATE?.toISOString() ?? null,
    expiryDate: b.EXPIRY_DATE?.toISOString() ?? null,
    qtyReceived: b.QTY_RECEIVED,
    qtyAvailable: b.QTY_AVAILABLE,
    unitCost: b.UNIT_COST != null ? Number(b.UNIT_COST) : null,
    sellingPrice: b.SELLING_PRICE != null ? Number(b.SELLING_PRICE) : null,
    location: b.LOCATION,
    status: b.STATUS,
    receivedAt: b.CREATED_DATE?.toISOString() ?? null,
  };
}

export function toDrugResponse(
  row: DrugWithRelations,
  opts?: { includeBatches?: boolean },
): DrugResponse {
  const now = new Date();
  const holdingBatches = row.batches
    .filter((b) => b.STATUS === 'Available' && b.QTY_AVAILABLE > 0)
    .sort((a, b) => {
      const ax = a.EXPIRY_DATE?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const bx = b.EXPIRY_DATE?.getTime() ?? Number.MAX_SAFE_INTEGER;
      return ax - bx;
    });

  const stock = holdingBatches.reduce((s, b) => s + b.QTY_AVAILABLE, 0);
  const earliest = holdingBatches[0] ?? null;
  const expired =
    earliest?.EXPIRY_DATE != null && earliest.EXPIRY_DATE.getTime() < now.getTime();

  const stockStatus = expired
    ? 'Expired'
    : stock <= 0
      ? 'Out of Stock'
      : stock <= row.REORDER_LEVEL
        ? 'Low'
        : 'Active';

  return {
    drugId: row.DRUG_ID,
    name: row.NAME,
    genericName: row.GENERIC_NAME,
    category: row.CATEGORY,
    form: row.FORM,
    strength: row.STRENGTH,
    unit: row.UNIT,
    unitPrice: Number(row.UNIT_PRICE),
    reorderLevel: row.REORDER_LEVEL,
    shelf: row.SHELF,
    controlled: row.CONTROLLED_FLAG === 'Y',
    status: row.STATUS,
    supplierId: row.SUPPLIER_ID,
    supplierName: row.supplier?.NAME ?? null,
    stock,
    earliestExpiry: earliest?.EXPIRY_DATE?.toISOString() ?? null,
    earliestBatchNo: earliest?.BATCH_NO ?? null,
    stockStatus,
    createdAt: row.CREATED_DATE?.toISOString() ?? null,
    ...(opts?.includeBatches
      ? {
          batches: [...row.batches]
            .sort((a, b) => (b.CREATED_DATE?.getTime() ?? 0) - (a.CREATED_DATE?.getTime() ?? 0))
            .map(toBatchResponse),
        }
      : {}),
  };
}

@Injectable()
export class DrugsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly pharmacySettings: PharmacySettingsService,
  ) {}

  private async thresholdDays() {
    try {
      const s = await this.pharmacySettings.getOrCreate();
      return {
        expiringSoon: s.expiringSoonDays || FALLBACK_EXPIRING_SOON_DAYS,
        recentlyReceived: s.recentlyReceivedDays || FALLBACK_RECENTLY_RECEIVED_DAYS,
        defaultReorder: s.defaultReorderLevel,
      };
    } catch {
      return {
        expiringSoon: FALLBACK_EXPIRING_SOON_DAYS,
        recentlyReceived: FALLBACK_RECENTLY_RECEIVED_DAYS,
        defaultReorder: 0,
      };
    }
  }

  async create(dto: CreateDrugDto, actor?: AuthUser): Promise<DrugResponse> {
    if (dto.supplierId != null) {
      const supplier = await this.prisma.suppliers.findUnique({
        where: { SUPPLIER_ID: dto.supplierId },
      });
      if (!supplier) throw new BadRequestException('Supplier does not exist');
    }

    const thresholds = await this.thresholdDays();
    const reorder =
      dto.reorderLevel !== undefined ? dto.reorderLevel : thresholds.defaultReorder;

    const created = await this.prisma.drugs.create({
      data: {
        NAME: dto.name.trim(),
        GENERIC_NAME: dto.genericName ?? null,
        CATEGORY: dto.category ?? null,
        FORM: dto.form ?? null,
        STRENGTH: dto.strength ?? null,
        UNIT: dto.unit ?? null,
        UNIT_PRICE: dto.unitPrice ?? 0,
        REORDER_LEVEL: reorder,
        SHELF: dto.shelf ?? null,
        CONTROLLED_FLAG: dto.controlled ? 'Y' : 'N',
        SUPPLIER_ID: dto.supplierId ?? null,
        STATUS: 'Active',
        CREATED_BY_ID: actor?.id ?? null,
        CREATED_BY: actorLabel(actor),
        CREATED_DATE: new Date(),
      },
      include: { supplier: true, batches: true },
    });

    await this.audit.log({
      type: 'drug:create',
      entity: 'drugs',
      entityId: created.DRUG_ID,
      userId: actor?.id,
      createdBy: actorLabel(actor),
      item: `Drug added: ${created.NAME}${created.STRENGTH ? ` ${created.STRENGTH}` : ''}`,
      newValue: toDrugResponse(created),
    });

    return toDrugResponse(created);
  }

  async list(params?: {
    q?: string;
    category?: string;
    status?: string;
    stockStatus?: string;
    supplierId?: number;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(params?.page ?? 1, 1);
    const limit = Math.min(Math.max(params?.limit ?? 50, 1), 200);
    const status = params?.status && params.status !== 'all' ? params.status : 'Active';

    const where: Prisma.DrugsWhereInput = {
      STATUS: status,
      ...(params?.category && params.category !== 'all'
        ? { CATEGORY: params.category }
        : {}),
      ...(params?.supplierId != null ? { SUPPLIER_ID: params.supplierId } : {}),
      ...(params?.q
        ? {
            OR: [
              { NAME: { contains: params.q, mode: 'insensitive' } },
              { GENERIC_NAME: { contains: params.q, mode: 'insensitive' } },
              { CATEGORY: { contains: params.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    // stockStatus is derived from batches, so filter after mapping. Pagination
    // applies to the DB query; derived filters narrow the current page.
    const [rows, total] = await Promise.all([
      this.prisma.drugs.findMany({
        where,
        include: { supplier: true, batches: true },
        orderBy: { NAME: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.drugs.count({ where }),
    ]);

    let items = rows.map((r) => toDrugResponse(r));
    if (params?.stockStatus && params.stockStatus !== 'all') {
      const now = Date.now();
      const { expiringSoon } = await this.thresholdDays();
      const soonCutoff = now + expiringSoon * 24 * 60 * 60 * 1000;
      if (params.stockStatus === 'Expiring Soon') {
        items = items.filter((d) => {
          if (!d.earliestExpiry) return false;
          const t = new Date(d.earliestExpiry).getTime();
          return t >= now && t <= soonCutoff;
        });
      } else {
        items = items.filter((d) => d.stockStatus === params.stockStatus);
      }
    }

    return { items, meta: { page, limit, total } };
  }

  async findById(id: number): Promise<DrugResponse> {
    const row = await this.prisma.drugs.findUnique({
      where: { DRUG_ID: id },
      include: { supplier: true, batches: true },
    });
    if (!row) throw new NotFoundException('Drug not found');
    return toDrugResponse(row, { includeBatches: true });
  }

  async update(id: number, dto: UpdateDrugDto, actor?: AuthUser): Promise<DrugResponse> {
    const existing = await this.prisma.drugs.findUnique({
      where: { DRUG_ID: id },
      include: { supplier: true, batches: true },
    });
    if (!existing) throw new NotFoundException('Drug not found');

    if (dto.supplierId != null) {
      const supplier = await this.prisma.suppliers.findUnique({
        where: { SUPPLIER_ID: dto.supplierId },
      });
      if (!supplier) throw new BadRequestException('Supplier does not exist');
    }

    const updated = await this.prisma.drugs.update({
      where: { DRUG_ID: id },
      data: {
        ...(dto.name !== undefined ? { NAME: dto.name.trim() } : {}),
        ...(dto.genericName !== undefined ? { GENERIC_NAME: dto.genericName } : {}),
        ...(dto.category !== undefined ? { CATEGORY: dto.category } : {}),
        ...(dto.form !== undefined ? { FORM: dto.form } : {}),
        ...(dto.strength !== undefined ? { STRENGTH: dto.strength } : {}),
        ...(dto.unit !== undefined ? { UNIT: dto.unit } : {}),
        ...(dto.unitPrice !== undefined ? { UNIT_PRICE: dto.unitPrice } : {}),
        ...(dto.reorderLevel !== undefined ? { REORDER_LEVEL: dto.reorderLevel } : {}),
        ...(dto.shelf !== undefined ? { SHELF: dto.shelf } : {}),
        ...(dto.controlled !== undefined
          ? { CONTROLLED_FLAG: dto.controlled ? 'Y' : 'N' }
          : {}),
        ...(dto.supplierId !== undefined ? { SUPPLIER_ID: dto.supplierId } : {}),
        ...(dto.status !== undefined ? { STATUS: dto.status } : {}),
        UPDATED_BY_ID: actor?.id ?? null,
        UPDATED_BY: actorLabel(actor),
        UPDATED_DATE: new Date(),
      },
      include: { supplier: true, batches: true },
    });

    await this.audit.log({
      type: 'drug:update',
      entity: 'drugs',
      entityId: id,
      userId: actor?.id,
      createdBy: actorLabel(actor),
      item: `Drug updated: ${updated.NAME}`,
      oldValue: toDrugResponse(existing),
      newValue: toDrugResponse(updated),
    });

    return toDrugResponse(updated);
  }

  /** Inventory summary cards. */
  async inventoryStats() {
    const rows = await this.prisma.drugs.findMany({
      where: { STATUS: 'Active' },
      include: { supplier: true, batches: true },
    });
    const items = rows.map((r) => toDrugResponse(r));
    const { expiringSoon, recentlyReceived: recentDays } =
      await this.thresholdDays();

    const now = Date.now();
    const soonCutoff = now + expiringSoon * 24 * 60 * 60 * 1000;
    const recentCutoff = now - recentDays * 24 * 60 * 60 * 1000;

    const recentlyReceived = await this.prisma.drugBatches.count({
      where: { CREATED_DATE: { gte: new Date(recentCutoff) } },
    });

    return {
      asOf: new Date().toISOString(),
      totalDrugs: items.length,
      available: items.filter((d) => d.stockStatus === 'Active').length,
      lowStock: items.filter((d) => d.stockStatus === 'Low').length,
      outOfStock: items.filter((d) => d.stockStatus === 'Out of Stock').length,
      expired: items.filter((d) => d.stockStatus === 'Expired').length,
      expiringSoon: items.filter((d) => {
        if (!d.earliestExpiry) return false;
        const t = new Date(d.earliestExpiry).getTime();
        return t >= now && t <= soonCutoff;
      }).length,
      recentlyReceived,
      thresholds: {
        expiringSoonDays: expiringSoon,
        recentlyReceivedDays: recentDays,
      },
    };
  }

  /**
   * Manual stock adjustment. Positive quantities add to the most recent
   * available batch; negative quantities deduct oldest-expiry-first (FEFO).
   */
  async adjustStock(dto: AdjustStockDto, actor?: AuthUser): Promise<DrugResponse> {
    const drug = await this.prisma.drugs.findUnique({
      where: { DRUG_ID: dto.drugId },
      include: { supplier: true, batches: true },
    });
    if (!drug) throw new NotFoundException('Drug not found');

    const before = toDrugResponse(drug);

    await this.prisma.$transaction(async (tx) => {
      if (dto.qty > 0) {
        const target = [...drug.batches]
          .filter((b) => b.STATUS === 'Available')
          .sort(
            (a, b) => (b.CREATED_DATE?.getTime() ?? 0) - (a.CREATED_DATE?.getTime() ?? 0),
          )[0];
        if (!target) {
          throw new BadRequestException(
            'No batch exists for this drug — receive stock first',
          );
        }
        await tx.drugBatches.update({
          where: { BATCH_ID: target.BATCH_ID },
          data: {
            QTY_AVAILABLE: { increment: dto.qty },
            UPDATED_BY_ID: actor?.id ?? null,
            UPDATED_BY: actorLabel(actor),
            UPDATED_DATE: new Date(),
          },
        });
      } else {
        let remaining = -dto.qty;
        const sources = [...drug.batches]
          .filter((b) => b.STATUS === 'Available' && b.QTY_AVAILABLE > 0)
          .sort((a, b) => {
            const ax = a.EXPIRY_DATE?.getTime() ?? Number.MAX_SAFE_INTEGER;
            const bx = b.EXPIRY_DATE?.getTime() ?? Number.MAX_SAFE_INTEGER;
            return ax - bx;
          });
        const availableTotal = sources.reduce((s, b) => s + b.QTY_AVAILABLE, 0);
        if (availableTotal < remaining) {
          throw new BadRequestException(
            `Cannot deduct ${remaining} — only ${availableTotal} available`,
          );
        }
        for (const batch of sources) {
          if (remaining <= 0) break;
          const take = Math.min(batch.QTY_AVAILABLE, remaining);
          remaining -= take;
          await tx.drugBatches.update({
            where: { BATCH_ID: batch.BATCH_ID },
            data: {
              QTY_AVAILABLE: { decrement: take },
              UPDATED_BY_ID: actor?.id ?? null,
              UPDATED_BY: actorLabel(actor),
              UPDATED_DATE: new Date(),
            },
          });
        }
      }
    });

    const after = await this.findById(dto.drugId);

    await this.audit.log({
      type: 'stock:adjust',
      entity: 'drugs',
      entityId: dto.drugId,
      userId: actor?.id,
      createdBy: actorLabel(actor),
      item: `Stock adjusted ${dto.qty > 0 ? '+' : ''}${dto.qty} × ${drug.NAME} — ${dto.reason}`,
      oldValue: { stock: before.stock, reason: dto.reason },
      newValue: { stock: after.stock, reason: dto.reason },
    });

    return after;
  }
}
