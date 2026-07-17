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
  ConfirmWalkInPaymentDto,
  CreateWalkInSaleDto,
  DispenseWalkInSaleDto,
} from './dto/walk-in-sale.dto';

export type WalkInSaleItemResponse = {
  itemId: number;
  drugId: number;
  drugName: string;
  strength: string | null;
  form: string | null;
  unit: string | null;
  quantity: number;
  qtyDispensed: number;
  unitPrice: number;
  lineStatus: string;
  lineTotal: number;
};

export type WalkInSalePerson = {
  personId: number;
  hospitalNo: string | null;
  firstName: string | null;
  lastName: string | null;
  middleName: string | null;
  phone: string | null;
};

export type WalkInSaleResponse = {
  saleId: number;
  saleNo: string;
  personId: number;
  status: string;
  paymentStatus: string;
  paymentChannel: string | null;
  paymentRef: string | null;
  paidAt: string | null;
  paidBy: string | null;
  total: number;
  notes: string | null;
  dispensedAt: string | null;
  dispensedBy: string | null;
  createdBy: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  items: WalkInSaleItemResponse[];
  person: WalkInSalePerson | null;
};

const SALE_INCLUDE = {
  items: { orderBy: { ITEM_ID: 'asc' as const } },
  person: {
    select: {
      PERSON_ID: true,
      HOSPITAL_NO: true,
      FIRST_NAME: true,
      LAST_NAME: true,
      MIDDLE_NAME: true,
      PATIENT_PHONE_NO: true,
    },
  },
} as const;

type SaleRow = Prisma.PharmacySalesGetPayload<{ include: typeof SALE_INCLUDE }>;

function actorLabel(actor?: AuthUser): string {
  if (!actor) return 'SYSTEM';
  const name = [actor.firstName, actor.lastName].filter(Boolean).join(' ');
  return name || actor.email;
}

function pad(id: number): string {
  return String(id).padStart(4, '0');
}

function normalizeChannel(channel?: string | null): string | null {
  if (!channel) return null;
  if (channel === 'POS') return 'POS Card';
  if (channel === 'Transfer') return 'Bank Transfer';
  return channel;
}

function toResponse(row: SaleRow): WalkInSaleResponse {
  const items = row.items.map((i) => ({
    itemId: i.ITEM_ID,
    drugId: i.DRUG_ID,
    drugName: i.DRUG_NAME,
    strength: i.STRENGTH,
    form: i.FORM,
    unit: i.UNIT,
    quantity: i.QUANTITY,
    qtyDispensed: i.QTY_DISPENSED,
    unitPrice: Number(i.UNIT_PRICE),
    lineStatus: i.LINE_STATUS,
    lineTotal: i.QUANTITY * Number(i.UNIT_PRICE),
  }));
  return {
    saleId: row.SALE_ID,
    saleNo: row.SALE_NO,
    personId: row.PERSON_ID,
    status: row.STATUS,
    paymentStatus: row.PAYMENT_STATUS,
    paymentChannel: row.PAYMENT_CHANNEL,
    paymentRef: row.PAYMENT_REF,
    paidAt: row.PAID_AT?.toISOString() ?? null,
    paidBy: row.PAID_BY,
    total: Number(row.TOTAL),
    notes: row.NOTES,
    dispensedAt: row.DISPENSED_AT?.toISOString() ?? null,
    dispensedBy: row.DISPENSED_BY,
    createdBy: row.CREATED_BY,
    createdAt: row.CREATED_DATE?.toISOString() ?? null,
    updatedAt: row.UPDATED_DATE?.toISOString() ?? null,
    items,
    person: row.person
      ? {
          personId: row.person.PERSON_ID,
          hospitalNo: row.person.HOSPITAL_NO,
          firstName: row.person.FIRST_NAME,
          lastName: row.person.LAST_NAME,
          middleName: row.person.MIDDLE_NAME,
          phone: row.person.PATIENT_PHONE_NO,
        }
      : null,
  };
}

@Injectable()
export class WalkInSalesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private async resolvePerson(
    dto: CreateWalkInSaleDto,
    actor?: AuthUser,
  ): Promise<number> {
    if (dto.personId) {
      const existing = await this.prisma.persons.findUnique({
        where: { PERSON_ID: dto.personId },
        select: { PERSON_ID: true },
      });
      if (!existing) throw new NotFoundException('Patient not found');
      return existing.PERSON_ID;
    }

    if (dto.hospitalNo?.trim()) {
      const byHosp = await this.prisma.persons.findFirst({
        where: {
          HOSPITAL_NO: { equals: dto.hospitalNo.trim(), mode: 'insensitive' },
          DISCONTINUE_FLAG: { not: 'Y' },
        },
        select: { PERSON_ID: true },
      });
      if (byHosp) return byHosp.PERSON_ID;
    }

    const phone = dto.phone?.trim();
    const name = dto.customerName?.trim();
    if (!name) {
      throw new BadRequestException(
        'Provide personId or customerName for walk-in customer',
      );
    }

    const parts = name.split(/\s+/).filter(Boolean);
    const firstName = parts[0] ?? name;
    const lastName = parts.length > 1 ? parts.slice(1).join(' ') : 'Walk-In';

    if (phone) {
      const byPhone = await this.prisma.persons.findFirst({
        where: {
          PATIENT_PHONE_NO: phone,
          FIRST_NAME: { equals: firstName, mode: 'insensitive' },
          DISCONTINUE_FLAG: { not: 'Y' },
        },
        select: { PERSON_ID: true },
      });
      if (byPhone) return byPhone.PERSON_ID;
    }

    const year = new Date().getFullYear();
    const created = await this.prisma.persons.create({
      data: {
        FIRST_NAME: firstName,
        LAST_NAME: lastName,
        PATIENT_PHONE_NO: phone ?? null,
        HOSPITAL_NO: `WI-${year}-PENDING`,
        PATIENT_TYPE: 'Walk-In',
        REG_TYPE: 'Walk-In',
        STATUS: 'Active',
        SEX: 'Other',
        DATE_OF_REGISTRATION: new Date(),
        CREATED_BY: actorLabel(actor),
        CREATED_DATE: new Date(),
      },
    });

    const hospitalNo = `WI-${year}-${pad(created.PERSON_ID)}`;
    await this.prisma.persons.update({
      where: { PERSON_ID: created.PERSON_ID },
      data: { HOSPITAL_NO: hospitalNo },
    });

    await this.audit.log({
      type: 'patient:create',
      entity: 'persons',
      entityId: created.PERSON_ID,
      personId: created.PERSON_ID,
      userId: actor?.id,
      createdBy: actorLabel(actor),
      item: `Walk-in customer registered ${hospitalNo}: ${firstName} ${lastName}`,
    });

    return created.PERSON_ID;
  }

  async create(
    dto: CreateWalkInSaleDto,
    actor?: AuthUser,
  ): Promise<WalkInSaleResponse> {
    const personId = await this.resolvePerson(dto, actor);
    const drugIds = [...new Set(dto.items.map((i) => i.drugId))];
    const drugs = await this.prisma.drugs.findMany({
      where: { DRUG_ID: { in: drugIds }, STATUS: 'Active' },
      include: { batches: { where: { STATUS: 'Available' } } },
    });
    const drugMap = new Map(drugs.map((d) => [d.DRUG_ID, d]));
    const missing = drugIds.filter((id) => !drugMap.has(id));
    if (missing.length > 0) {
      throw new BadRequestException(
        `Unknown or inactive drug id(s): ${missing.join(', ')}`,
      );
    }

    for (const line of dto.items) {
      const drug = drugMap.get(line.drugId)!;
      const stock = drug.batches.reduce((s, b) => s + b.QTY_AVAILABLE, 0);
      if (stock < line.quantity) {
        throw new BadRequestException(
          `Insufficient stock for ${drug.NAME}: need ${line.quantity}, available ${stock}`,
        );
      }
    }

    const year = new Date().getFullYear();
    const label = actorLabel(actor);
    const now = new Date();
    const total = dto.items.reduce((sum, line) => {
      const drug = drugMap.get(line.drugId)!;
      return sum + line.quantity * Number(drug.UNIT_PRICE);
    }, 0);

    const created = await this.prisma.$transaction(async (tx) => {
      const row = await tx.pharmacySales.create({
        data: {
          SALE_NO: `WS-${year}-PENDING`,
          PERSON_ID: personId,
          STATUS: 'Awaiting Payment',
          PAYMENT_STATUS: 'Unpaid',
          PAYMENT_CHANNEL: normalizeChannel(dto.preferredPaymentChannel),
          TOTAL: total,
          NOTES: dto.notes ?? null,
          CREATED_BY_ID: actor?.id ?? null,
          CREATED_BY: label,
          CREATED_DATE: now,
          items: {
            create: dto.items.map((line) => {
              const drug = drugMap.get(line.drugId)!;
              return {
                DRUG_ID: line.drugId,
                DRUG_NAME: drug.NAME,
                STRENGTH: drug.STRENGTH,
                FORM: drug.FORM,
                UNIT: drug.UNIT,
                QUANTITY: line.quantity,
                UNIT_PRICE: drug.UNIT_PRICE,
              };
            }),
          },
        },
        include: SALE_INCLUDE,
      });

      return tx.pharmacySales.update({
        where: { SALE_ID: row.SALE_ID },
        data: { SALE_NO: `WS-${year}-${pad(row.SALE_ID)}` },
        include: SALE_INCLUDE,
      });
    });

    const response = toResponse(created);
    await this.audit.log({
      type: 'pharmacy:sale-create',
      entity: 'pharmacy_sales',
      entityId: created.SALE_ID,
      personId,
      userId: actor?.id,
      createdBy: label,
      item: `Walk-in sale ${response.saleNo} created — awaiting cashier payment (₦${total})`,
      newValue: response,
    });

    return response;
  }

  async list(params?: {
    q?: string;
    status?: string;
    paymentStatus?: string;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(params?.page ?? 1, 1);
    const limit = Math.min(Math.max(params?.limit ?? 50, 1), 100);
    const where: Prisma.PharmacySalesWhereInput = {
      ...(params?.status && params.status !== 'all'
        ? { STATUS: params.status }
        : {}),
      ...(params?.paymentStatus && params.paymentStatus !== 'all'
        ? { PAYMENT_STATUS: params.paymentStatus }
        : {}),
      ...(params?.q
        ? {
            OR: [
              { SALE_NO: { contains: params.q, mode: 'insensitive' } },
              {
                person: {
                  OR: [
                    { HOSPITAL_NO: { contains: params.q, mode: 'insensitive' } },
                    { FIRST_NAME: { contains: params.q, mode: 'insensitive' } },
                    { LAST_NAME: { contains: params.q, mode: 'insensitive' } },
                    {
                      PATIENT_PHONE_NO: {
                        contains: params.q,
                        mode: 'insensitive',
                      },
                    },
                  ],
                },
              },
            ],
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.pharmacySales.findMany({
        where,
        include: SALE_INCLUDE,
        orderBy: { CREATED_DATE: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.pharmacySales.count({ where }),
    ]);

    return { items: rows.map(toResponse), meta: { page, limit, total } };
  }

  async findById(id: number): Promise<WalkInSaleResponse> {
    const row = await this.prisma.pharmacySales.findUnique({
      where: { SALE_ID: id },
      include: SALE_INCLUDE,
    });
    if (!row) throw new NotFoundException('Walk-in sale not found');
    return toResponse(row);
  }

  async findBySaleNo(saleNo: string): Promise<WalkInSaleResponse> {
    let decoded = saleNo?.trim() ?? '';
    try {
      decoded = decodeURIComponent(decoded).trim();
    } catch {
      /* keep trimmed */
    }
    const row = await this.prisma.pharmacySales.findFirst({
      where: { SALE_NO: { equals: decoded, mode: 'insensitive' } },
      include: SALE_INCLUDE,
    });
    if (!row) throw new NotFoundException('Walk-in sale not found');
    return toResponse(row);
  }

  /** Cashier confirms payment — required before dispense. */
  async confirmPayment(
    id: number,
    dto: ConfirmWalkInPaymentDto,
    actor?: AuthUser,
  ): Promise<WalkInSaleResponse> {
    const existing = await this.prisma.pharmacySales.findUnique({
      where: { SALE_ID: id },
      include: SALE_INCLUDE,
    });
    if (!existing) throw new NotFoundException('Walk-in sale not found');
    if (existing.STATUS === 'Cancelled') {
      throw new BadRequestException('Cannot pay a cancelled sale');
    }
    if (existing.PAYMENT_STATUS === 'Paid') {
      throw new BadRequestException('Sale is already paid');
    }

    const label = actorLabel(actor);
    const now = new Date();
    const updated = await this.prisma.pharmacySales.update({
      where: { SALE_ID: id },
      data: {
        PAYMENT_STATUS: 'Paid',
        STATUS: 'Paid',
        PAYMENT_CHANNEL: dto.paymentChannel,
        PAYMENT_REF: dto.paymentRef?.trim() || null,
        PAID_AT: now,
        PAID_BY: label,
        PAID_BY_ID: actor?.id ?? null,
        UPDATED_BY_ID: actor?.id ?? null,
        UPDATED_BY: label,
        UPDATED_DATE: now,
      },
      include: SALE_INCLUDE,
    });

    const response = toResponse(updated);
    await this.audit.log({
      type: 'pharmacy:sale-pay',
      entity: 'pharmacy_sales',
      entityId: id,
      personId: existing.PERSON_ID,
      userId: actor?.id,
      createdBy: label,
      item: `Walk-in sale ${updated.SALE_NO} paid via ${dto.paymentChannel}`,
      oldValue: {
        paymentStatus: existing.PAYMENT_STATUS,
        status: existing.STATUS,
      },
      newValue: response,
    });

    return response;
  }

  /**
   * Dispense after payment. Deducts DRUG_BATCHES FEFO.
   * Blocked until PAYMENT_STATUS = Paid.
   */
  async dispense(
    id: number,
    dto: DispenseWalkInSaleDto,
    actor?: AuthUser,
  ): Promise<WalkInSaleResponse> {
    const existing = await this.prisma.pharmacySales.findUnique({
      where: { SALE_ID: id },
      include: SALE_INCLUDE,
    });
    if (!existing) throw new NotFoundException('Walk-in sale not found');
    if (existing.PAYMENT_STATUS !== 'Paid') {
      throw new BadRequestException(
        'Customer must pay at cashier before drugs can be dispensed',
      );
    }
    if (existing.STATUS === 'Cancelled') {
      throw new BadRequestException('Cannot dispense a cancelled sale');
    }
    if (existing.STATUS === 'Dispensed') {
      throw new BadRequestException('Sale already fully dispensed');
    }

    const label = actorLabel(actor);
    const now = new Date();
    const requested = new Map(
      (dto.items ?? []).map((i) => [i.itemId, i.quantity]),
    );

    const lines = existing.items
      .filter((i) => i.LINE_STATUS === 'Active')
      .map((i) => {
        const remaining = i.QUANTITY - i.QTY_DISPENSED;
        const qty =
          requested.size > 0 ? (requested.get(i.ITEM_ID) ?? 0) : remaining;
        return { row: i, qty, remaining };
      })
      .filter((l) => l.qty > 0);

    if (lines.length === 0) {
      throw new BadRequestException('No items to dispense');
    }
    for (const line of lines) {
      if (line.qty > line.remaining) {
        throw new BadRequestException(
          `Item ${line.row.ITEM_ID}: cannot dispense ${line.qty} (only ${line.remaining} remaining)`,
        );
      }
    }

    await this.prisma.$transaction(async (tx) => {
      for (const line of lines) {
        let remaining = line.qty;
        const batches = await tx.drugBatches.findMany({
          where: {
            DRUG_ID: line.row.DRUG_ID,
            STATUS: 'Available',
            QTY_AVAILABLE: { gt: 0 },
          },
          orderBy: [{ EXPIRY_DATE: 'asc' }, { BATCH_ID: 'asc' }],
        });
        const availableTotal = batches.reduce((s, b) => s + b.QTY_AVAILABLE, 0);
        if (availableTotal < remaining) {
          throw new BadRequestException(
            `Insufficient stock for ${line.row.DRUG_NAME}: need ${remaining}, available ${availableTotal}`,
          );
        }
        for (const batch of batches) {
          if (remaining <= 0) break;
          const take = Math.min(batch.QTY_AVAILABLE, remaining);
          remaining -= take;
          await tx.drugBatches.update({
            where: { BATCH_ID: batch.BATCH_ID },
            data: {
              QTY_AVAILABLE: { decrement: take },
              UPDATED_BY_ID: actor?.id ?? null,
              UPDATED_BY: label,
              UPDATED_DATE: now,
            },
          });
        }

        const newQty = line.row.QTY_DISPENSED + line.qty;
        await tx.pharmacySaleItems.update({
          where: { ITEM_ID: line.row.ITEM_ID },
          data: {
            QTY_DISPENSED: newQty,
            LINE_STATUS:
              newQty >= line.row.QUANTITY ? 'Dispensed' : 'Active',
          },
        });
      }

      const refreshed = await tx.pharmacySaleItems.findMany({
        where: { SALE_ID: id },
      });
      const allDone = refreshed.every(
        (i) =>
          i.LINE_STATUS === 'Cancelled' || i.QTY_DISPENSED >= i.QUANTITY,
      );

      await tx.pharmacySales.update({
        where: { SALE_ID: id },
        data: {
          STATUS: allDone ? 'Dispensed' : 'Partially Dispensed',
          DISPENSED_AT: now,
          DISPENSED_BY: label,
          DISPENSED_BY_ID: actor?.id ?? null,
          ...(dto.pharmacyNotes !== undefined
            ? { NOTES: dto.pharmacyNotes }
            : {}),
          UPDATED_BY_ID: actor?.id ?? null,
          UPDATED_BY: label,
          UPDATED_DATE: now,
        },
      });
    });

    const after = await this.findById(id);
    await this.audit.log({
      type: 'pharmacy:sale-dispense',
      entity: 'pharmacy_sales',
      entityId: id,
      personId: existing.PERSON_ID,
      userId: actor?.id,
      createdBy: label,
      item: `Walk-in sale ${after.saleNo} dispensed: ${lines
        .map((l) => `${l.row.DRUG_NAME} × ${l.qty}`)
        .join(', ')}`,
      oldValue: toResponse(existing),
      newValue: after,
    });

    return after;
  }

  async cancel(id: number, actor?: AuthUser): Promise<WalkInSaleResponse> {
    const existing = await this.prisma.pharmacySales.findUnique({
      where: { SALE_ID: id },
      include: SALE_INCLUDE,
    });
    if (!existing) throw new NotFoundException('Walk-in sale not found');
    if (existing.PAYMENT_STATUS === 'Paid' && existing.STATUS !== 'Paid') {
      throw new BadRequestException(
        'Cannot cancel a sale that has already started dispensing',
      );
    }
    if (existing.STATUS === 'Dispensed') {
      throw new BadRequestException('Cannot cancel a dispensed sale');
    }

    const updated = await this.prisma.pharmacySales.update({
      where: { SALE_ID: id },
      data: {
        STATUS: 'Cancelled',
        UPDATED_BY_ID: actor?.id ?? null,
        UPDATED_BY: actorLabel(actor),
        UPDATED_DATE: new Date(),
      },
      include: SALE_INCLUDE,
    });

    await this.audit.log({
      type: 'pharmacy:sale-cancel',
      entity: 'pharmacy_sales',
      entityId: id,
      personId: existing.PERSON_ID,
      userId: actor?.id,
      createdBy: actorLabel(actor),
      item: `Walk-in sale ${updated.SALE_NO} cancelled`,
    });

    return toResponse(updated);
  }
}
