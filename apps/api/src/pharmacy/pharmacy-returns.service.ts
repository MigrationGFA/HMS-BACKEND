import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../auth/types/auth-user.type';
import { CreatePharmacyReturnDto } from './dto/pharmacy-return.dto';

export type PharmacyReturnItemResponse = {
  returnItemId: number;
  drugId: number;
  drugName: string;
  quantity: number;
  sourceItemId: number;
  unitPrice: number;
};

export type PharmacyReturnResponse = {
  returnId: number;
  returnNo: string;
  sourceType: string;
  sourceId: number;
  personId: number;
  status: string;
  reason: string;
  returnedByRole: string;
  returnedByName: string;
  receivedBy: string | null;
  totalValue: number;
  createdAt: string | null;
  items: PharmacyReturnItemResponse[];
  patientName: string | null;
  hospitalNo: string | null;
  sourceRefNo: string | null;
};

function actorLabel(actor?: AuthUser): string {
  if (!actor) return 'SYSTEM';
  const name = [actor.firstName, actor.lastName].filter(Boolean).join(' ');
  return name || actor.email;
}

function pad(id: number): string {
  return String(id).padStart(4, '0');
}

const RETURN_INCLUDE = {
  items: { orderBy: { RETURN_ITEM_ID: 'asc' as const } },
  person: {
    select: {
      FIRST_NAME: true,
      LAST_NAME: true,
      MIDDLE_NAME: true,
      HOSPITAL_NO: true,
    },
  },
} as const;

type ReturnRow = Prisma.PharmacyReturnsGetPayload<{
  include: typeof RETURN_INCLUDE;
}>;

function toResponse(
  row: ReturnRow,
  sourceRefNo: string | null = null,
): PharmacyReturnResponse {
  const patientName = [
    row.person.FIRST_NAME,
    row.person.MIDDLE_NAME,
    row.person.LAST_NAME,
  ]
    .filter(Boolean)
    .join(' ');
  return {
    returnId: row.RETURN_ID,
    returnNo: row.RETURN_NO,
    sourceType: row.SOURCE_TYPE,
    sourceId: row.SOURCE_ID,
    personId: row.PERSON_ID,
    status: row.STATUS,
    reason: row.REASON,
    returnedByRole: row.RETURNED_BY_ROLE,
    returnedByName: row.RETURNED_BY_NAME,
    receivedBy: row.RECEIVED_BY,
    totalValue: Number(row.TOTAL_VALUE),
    createdAt: row.CREATED_DATE?.toISOString() ?? null,
    items: row.items.map((i) => ({
      returnItemId: i.RETURN_ITEM_ID,
      drugId: i.DRUG_ID,
      drugName: i.DRUG_NAME,
      quantity: i.QUANTITY,
      sourceItemId: i.SOURCE_ITEM_ID,
      unitPrice: Number(i.UNIT_PRICE),
    })),
    patientName: patientName || null,
    hospitalNo: row.person.HOSPITAL_NO,
    sourceRefNo,
  };
}

@Injectable()
export class PharmacyReturnsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async summary() {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - 7);
    weekStart.setHours(0, 0, 0, 0);

    const [todayRows, weekRows, allRecent] = await Promise.all([
      this.prisma.pharmacyReturns.findMany({
        where: { CREATED_DATE: { gte: todayStart } },
        include: { items: true },
      }),
      this.prisma.pharmacyReturns.findMany({
        where: { CREATED_DATE: { gte: weekStart } },
        include: { items: true },
      }),
      this.prisma.pharmacyReturns.count(),
    ]);

    const unitsToday = todayRows.reduce(
      (s, r) => s + r.items.reduce((a, i) => a + i.QUANTITY, 0),
      0,
    );
    const valueToday = todayRows.reduce((s, r) => s + Number(r.TOTAL_VALUE), 0);

    return {
      todayCount: todayRows.length,
      todayUnits: unitsToday,
      todayValue: valueToday,
      weekCount: weekRows.length,
      totalCount: allRecent,
    };
  }

  async list(params?: { q?: string; page?: number; limit?: number }) {
    const page = Math.max(params?.page ?? 1, 1);
    const limit = Math.min(Math.max(params?.limit ?? 50, 1), 100);
    const q = params?.q?.trim();
    const where: Prisma.PharmacyReturnsWhereInput = q
      ? {
          OR: [
            { RETURN_NO: { contains: q, mode: 'insensitive' } },
            { RETURNED_BY_NAME: { contains: q, mode: 'insensitive' } },
            { REASON: { contains: q, mode: 'insensitive' } },
            {
              person: {
                OR: [
                  { HOSPITAL_NO: { contains: q, mode: 'insensitive' } },
                  { FIRST_NAME: { contains: q, mode: 'insensitive' } },
                  { LAST_NAME: { contains: q, mode: 'insensitive' } },
                ],
              },
            },
          ],
        }
      : {};

    const [rows, total] = await Promise.all([
      this.prisma.pharmacyReturns.findMany({
        where,
        include: RETURN_INCLUDE,
        orderBy: { CREATED_DATE: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.pharmacyReturns.count({ where }),
    ]);

    const items = await Promise.all(
      rows.map(async (r) => toResponse(r, await this.resolveSourceRef(r))),
    );
    return { items, meta: { page, limit, total } };
  }

  async lookup(q: string) {
    const term = q?.trim();
    if (!term || term.length < 2) {
      throw new BadRequestException('Enter at least 2 characters to look up');
    }

    const rx = await this.prisma.prescriptions.findFirst({
      where: {
        RX_NO: { equals: term, mode: 'insensitive' },
        STATUS: { in: ['Dispensed', 'Partially Dispensed'] },
      },
      include: {
        items: true,
        person: {
          select: {
            PERSON_ID: true,
            FIRST_NAME: true,
            LAST_NAME: true,
            HOSPITAL_NO: true,
          },
        },
      },
    });
    if (rx) {
      const lines = rx.items
        .filter((i) => i.QTY_DISPENSED - i.QTY_RETURNED > 0)
        .map((i) => ({
          sourceItemId: i.ITEM_ID,
          drugId: i.DRUG_ID,
          drugName: i.DRUG_NAME,
          strength: i.STRENGTH,
          qtyDispensed: i.QTY_DISPENSED,
          qtyReturned: i.QTY_RETURNED,
          qtyReturnable: i.QTY_DISPENSED - i.QTY_RETURNED,
          unitPrice: Number(i.UNIT_PRICE),
        }));
      return {
        sourceType: 'prescription' as const,
        sourceId: rx.PRESCRIPTION_ID,
        refNo: rx.RX_NO,
        personId: rx.PERSON_ID,
        patientName: [rx.person.FIRST_NAME, rx.person.LAST_NAME]
          .filter(Boolean)
          .join(' '),
        hospitalNo: rx.person.HOSPITAL_NO,
        status: rx.STATUS,
        lines,
      };
    }

    const sale = await this.prisma.pharmacySales.findFirst({
      where: {
        SALE_NO: { equals: term, mode: 'insensitive' },
        STATUS: { in: ['Dispensed', 'Partially Dispensed'] },
      },
      include: {
        items: true,
        person: {
          select: {
            PERSON_ID: true,
            FIRST_NAME: true,
            LAST_NAME: true,
            HOSPITAL_NO: true,
          },
        },
      },
    });
    if (sale) {
      const lines = sale.items
        .filter((i) => i.QTY_DISPENSED - i.QTY_RETURNED > 0)
        .map((i) => ({
          sourceItemId: i.ITEM_ID,
          drugId: i.DRUG_ID,
          drugName: i.DRUG_NAME,
          strength: i.STRENGTH,
          qtyDispensed: i.QTY_DISPENSED,
          qtyReturned: i.QTY_RETURNED,
          qtyReturnable: i.QTY_DISPENSED - i.QTY_RETURNED,
          unitPrice: Number(i.UNIT_PRICE),
        }));
      return {
        sourceType: 'walk_in' as const,
        sourceId: sale.SALE_ID,
        refNo: sale.SALE_NO,
        personId: sale.PERSON_ID,
        patientName: [sale.person.FIRST_NAME, sale.person.LAST_NAME]
          .filter(Boolean)
          .join(' '),
        hospitalNo: sale.person.HOSPITAL_NO,
        status: sale.STATUS,
        lines,
      };
    }

    throw new NotFoundException(
      'No dispensed prescription or walk-in sale found for that number',
    );
  }

  async create(
    dto: CreatePharmacyReturnDto,
    actor?: AuthUser,
  ): Promise<PharmacyReturnResponse> {
    const reason = dto.reason?.trim();
    const returnedByName = dto.returnedByName?.trim();
    if (!reason) throw new BadRequestException('Return reason is required');
    if (!returnedByName) {
      throw new BadRequestException('Returned-by name is required');
    }

    const label = actorLabel(actor);
    const now = new Date();
    const year = now.getFullYear();

    if (dto.sourceType === 'prescription') {
      return this.createFromPrescription(dto, label, now, year, actor);
    }
    return this.createFromWalkIn(dto, label, now, year, actor);
  }

  private async createFromPrescription(
    dto: CreatePharmacyReturnDto,
    label: string,
    now: Date,
    year: number,
    actor?: AuthUser,
  ) {
    const rx = await this.prisma.prescriptions.findUnique({
      where: { PRESCRIPTION_ID: dto.sourceId },
      include: { items: true },
    });
    if (!rx) throw new NotFoundException('Prescription not found');
    if (!['Dispensed', 'Partially Dispensed'].includes(rx.STATUS)) {
      throw new BadRequestException(
        'Only dispensed prescriptions can be returned',
      );
    }

    const itemMap = new Map(rx.items.map((i) => [i.ITEM_ID, i]));
    const lines: {
      sourceItemId: number;
      drugId: number;
      drugName: string;
      quantity: number;
      unitPrice: Prisma.Decimal;
    }[] = [];

    for (const line of dto.items) {
      const src = itemMap.get(line.sourceItemId);
      if (!src) {
        throw new BadRequestException(`Unknown item ${line.sourceItemId}`);
      }
      const returnable = src.QTY_DISPENSED - src.QTY_RETURNED;
      if (line.quantity > returnable) {
        throw new BadRequestException(
          `${src.DRUG_NAME}: can return at most ${returnable}`,
        );
      }
      lines.push({
        sourceItemId: src.ITEM_ID,
        drugId: src.DRUG_ID,
        drugName: src.DRUG_NAME,
        quantity: line.quantity,
        unitPrice: src.UNIT_PRICE,
      });
    }

    const totalValue = lines.reduce(
      (s, l) => s + l.quantity * Number(l.unitPrice),
      0,
    );

    const created = await this.prisma.$transaction(async (tx) => {
      for (const line of lines) {
        await this.restockBatch(tx, line.drugId, line.quantity, label, now, actor);
        await tx.prescriptionItems.update({
          where: { ITEM_ID: line.sourceItemId },
          data: { QTY_RETURNED: { increment: line.quantity } },
        });
      }

      const row = await tx.pharmacyReturns.create({
        data: {
          RETURN_NO: `RT-${year}-PENDING`,
          SOURCE_TYPE: 'prescription',
          SOURCE_ID: dto.sourceId,
          PERSON_ID: rx.PERSON_ID,
          STATUS: 'Completed',
          REASON: dto.reason.trim(),
          RETURNED_BY_ROLE: dto.returnedByRole,
          RETURNED_BY_NAME: dto.returnedByName.trim(),
          RECEIVED_BY: label,
          RECEIVED_BY_ID: actor?.id ?? null,
          TOTAL_VALUE: totalValue,
          CREATED_BY_ID: actor?.id ?? null,
          CREATED_BY: label,
          CREATED_DATE: now,
          items: {
            create: lines.map((l) => ({
              DRUG_ID: l.drugId,
              DRUG_NAME: l.drugName,
              QUANTITY: l.quantity,
              SOURCE_ITEM_ID: l.sourceItemId,
              UNIT_PRICE: l.unitPrice,
            })),
          },
        },
        include: RETURN_INCLUDE,
      });

      return tx.pharmacyReturns.update({
        where: { RETURN_ID: row.RETURN_ID },
        data: { RETURN_NO: `RT-${year}-${pad(row.RETURN_ID)}` },
        include: RETURN_INCLUDE,
      });
    });

    const response = toResponse(created, rx.RX_NO);
    await this.audit.log({
      type: 'pharmacy:return',
      entity: 'pharmacy_returns',
      entityId: created.RETURN_ID,
      personId: rx.PERSON_ID,
      userId: actor?.id,
      createdBy: label,
      item: `Return ${response.returnNo} for ${rx.RX_NO}: ${lines
        .map((l) => `${l.drugName} × ${l.quantity}`)
        .join(', ')}`,
      newValue: response,
    });
    return response;
  }

  private async createFromWalkIn(
    dto: CreatePharmacyReturnDto,
    label: string,
    now: Date,
    year: number,
    actor?: AuthUser,
  ) {
    const sale = await this.prisma.pharmacySales.findUnique({
      where: { SALE_ID: dto.sourceId },
      include: { items: true },
    });
    if (!sale) throw new NotFoundException('Walk-in sale not found');
    if (!['Dispensed', 'Partially Dispensed'].includes(sale.STATUS)) {
      throw new BadRequestException('Only dispensed walk-in sales can be returned');
    }

    const itemMap = new Map(sale.items.map((i) => [i.ITEM_ID, i]));
    const lines: {
      sourceItemId: number;
      drugId: number;
      drugName: string;
      quantity: number;
      unitPrice: Prisma.Decimal;
    }[] = [];

    for (const line of dto.items) {
      const src = itemMap.get(line.sourceItemId);
      if (!src) {
        throw new BadRequestException(`Unknown item ${line.sourceItemId}`);
      }
      const returnable = src.QTY_DISPENSED - src.QTY_RETURNED;
      if (line.quantity > returnable) {
        throw new BadRequestException(
          `${src.DRUG_NAME}: can return at most ${returnable}`,
        );
      }
      lines.push({
        sourceItemId: src.ITEM_ID,
        drugId: src.DRUG_ID,
        drugName: src.DRUG_NAME,
        quantity: line.quantity,
        unitPrice: src.UNIT_PRICE,
      });
    }

    const totalValue = lines.reduce(
      (s, l) => s + l.quantity * Number(l.unitPrice),
      0,
    );

    const created = await this.prisma.$transaction(async (tx) => {
      for (const line of lines) {
        await this.restockBatch(tx, line.drugId, line.quantity, label, now, actor);
        await tx.pharmacySaleItems.update({
          where: { ITEM_ID: line.sourceItemId },
          data: { QTY_RETURNED: { increment: line.quantity } },
        });
      }

      const row = await tx.pharmacyReturns.create({
        data: {
          RETURN_NO: `RT-${year}-PENDING`,
          SOURCE_TYPE: 'walk_in',
          SOURCE_ID: dto.sourceId,
          PERSON_ID: sale.PERSON_ID,
          STATUS: 'Completed',
          REASON: dto.reason.trim(),
          RETURNED_BY_ROLE: dto.returnedByRole,
          RETURNED_BY_NAME: dto.returnedByName.trim(),
          RECEIVED_BY: label,
          RECEIVED_BY_ID: actor?.id ?? null,
          TOTAL_VALUE: totalValue,
          CREATED_BY_ID: actor?.id ?? null,
          CREATED_BY: label,
          CREATED_DATE: now,
          items: {
            create: lines.map((l) => ({
              DRUG_ID: l.drugId,
              DRUG_NAME: l.drugName,
              QUANTITY: l.quantity,
              SOURCE_ITEM_ID: l.sourceItemId,
              UNIT_PRICE: l.unitPrice,
            })),
          },
        },
        include: RETURN_INCLUDE,
      });

      return tx.pharmacyReturns.update({
        where: { RETURN_ID: row.RETURN_ID },
        data: { RETURN_NO: `RT-${year}-${pad(row.RETURN_ID)}` },
        include: RETURN_INCLUDE,
      });
    });

    const response = toResponse(created, sale.SALE_NO);
    await this.audit.log({
      type: 'pharmacy:return',
      entity: 'pharmacy_returns',
      entityId: created.RETURN_ID,
      personId: sale.PERSON_ID,
      userId: actor?.id,
      createdBy: label,
      item: `Return ${response.returnNo} for ${sale.SALE_NO}: ${lines
        .map((l) => `${l.drugName} × ${l.quantity}`)
        .join(', ')}`,
      newValue: response,
    });
    return response;
  }

  /** Restock onto latest non-expired Available batch, or create a RETURN batch. */
  private async restockBatch(
    tx: Prisma.TransactionClient,
    drugId: number,
    qty: number,
    label: string,
    now: Date,
    actor?: AuthUser,
  ) {
    const batch = await tx.drugBatches.findFirst({
      where: {
        DRUG_ID: drugId,
        STATUS: 'Available',
        OR: [{ EXPIRY_DATE: null }, { EXPIRY_DATE: { gt: now } }],
      },
      orderBy: [{ EXPIRY_DATE: 'desc' }, { BATCH_ID: 'desc' }],
    });

    if (batch) {
      await tx.drugBatches.update({
        where: { BATCH_ID: batch.BATCH_ID },
        data: {
          QTY_AVAILABLE: { increment: qty },
          UPDATED_BY_ID: actor?.id ?? null,
          UPDATED_BY: label,
          UPDATED_DATE: now,
        },
      });
      return;
    }

    await tx.drugBatches.create({
      data: {
        DRUG_ID: drugId,
        BATCH_NO: `RETURN-${now.getTime()}`,
        QTY_RECEIVED: qty,
        QTY_AVAILABLE: qty,
        STATUS: 'Available',
        CREATED_BY_ID: actor?.id ?? null,
        CREATED_BY: label,
        CREATED_DATE: now,
      },
    });
  }

  private async resolveSourceRef(row: ReturnRow): Promise<string | null> {
    if (row.SOURCE_TYPE === 'prescription') {
      const rx = await this.prisma.prescriptions.findUnique({
        where: { PRESCRIPTION_ID: row.SOURCE_ID },
        select: { RX_NO: true },
      });
      return rx?.RX_NO ?? null;
    }
    const sale = await this.prisma.pharmacySales.findUnique({
      where: { SALE_ID: row.SOURCE_ID },
      select: { SALE_NO: true },
    });
    return sale?.SALE_NO ?? null;
  }
}
