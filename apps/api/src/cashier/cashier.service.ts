import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { PatientsService } from '../patients/patients.service';
import type { AuthUser } from '../auth/types/auth-user.type';
import type {
  CloseShiftDto,
  CreateDiscountDto,
  CreateRefundDto,
  OpenShiftDto,
  UpdateCashierSettingsDto,
} from './dto/cashier-ops.dto';

const CASHIER_AUDIT_TYPES = [
  'card:payment-confirm',
  'pharmacy:sale-pay',
  'prescription:pay',
  'lab:pay',
  'admission-bill:pay',
  'imaging:pay',
  'opc:pay',
] as const;

const SOURCE_DEPT: Record<string, string> = {
  card: 'Registration',
  pharmacy: 'Pharmacy',
  prescription: 'Prescription',
  lab: 'Laboratory',
  admission: 'Admission',
  imaging: 'Imaging',
  opc: 'Psychiatric OPC',
};

function yn(v: boolean): string {
  return v ? 'Y' : 'N';
}

function dayBounds(from?: string, to?: string, offsetMin = 60) {
  const now = new Date();
  if (!from && !to) {
    const localMs = now.getTime() + offsetMin * 60_000;
    const local = new Date(localMs);
    const startLocal = new Date(
      Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()),
    );
    const start = new Date(startLocal.getTime() - offsetMin * 60_000);
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    return { start, end };
  }
  const start = from
    ? new Date(`${from}T00:00:00.000Z`)
    : new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const end = to
    ? new Date(`${to}T23:59:59.999Z`)
    : new Date(`${(from ?? now.toISOString().slice(0, 10))}T23:59:59.999Z`);
  return { start, end };
}

function cashierAuditWhere(): Prisma.AuditsWhereInput {
  return {
    OR: [
      { AUDIT_TYPE: { startsWith: 'cashier-', mode: 'insensitive' } },
      ...CASHIER_AUDIT_TYPES.map((t) => ({ AUDIT_TYPE: t })),
    ],
  };
}

function bucketChannel(channel: string): string {
  const ch = (channel || '').toLowerCase();
  if (ch.includes('cash')) return 'Cash';
  if (ch.includes('pos')) return 'POS';
  if (ch.includes('transfer') || ch.includes('bank')) return 'Transfer';
  if (ch.includes('online')) return 'Online';
  if (ch.includes('wallet')) return 'Wallet';
  if (ch.includes('nhia') || ch.includes('nhis')) return 'NHIA';
  if (ch.includes('hmo')) return 'HMO';
  return 'Cash';
}

function actorLabel(user?: AuthUser | null): string {
  if (!user) return 'SYSTEM';
  return (
    [user.firstName, user.lastName].filter(Boolean).join(' ') ||
    user.email ||
    'User'
  );
}

function dec(n: number | Prisma.Decimal | string): number {
  return Number(n);
}

function personName(p?: {
  FIRST_NAME?: string | null;
  MIDDLE_NAME?: string | null;
  LAST_NAME?: string | null;
} | null): string {
  if (!p) return 'Unknown';
  return (
    [p.FIRST_NAME, p.MIDDLE_NAME, p.LAST_NAME].filter(Boolean).join(' ') ||
    'Unknown'
  );
}

export type RecordReceiptInput = {
  sourceType: string;
  sourceId: number;
  personId: number;
  amount: number;
  channel: string;
  paymentRef?: string | null;
  patientName?: string | null;
  sourceRef?: string | null;
  user?: AuthUser | null;
};

@Injectable()
export class CashierService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly patientsService: PatientsService,
  ) {}

  private personSelectCompact = {
    PERSON_ID: true,
    HOSPITAL_NO: true,
    FIRST_NAME: true,
    MIDDLE_NAME: true,
    LAST_NAME: true,
    PATIENT_PHONE_NO: true,
  } as const;

  private mapPersonCompact(row: {
    PERSON_ID: number;
    HOSPITAL_NO: string | null;
    FIRST_NAME: string | null;
    MIDDLE_NAME: string | null;
    LAST_NAME: string | null;
    PATIENT_PHONE_NO: string | null;
  }) {
    return {
      personId: row.PERSON_ID,
      hospitalNo: row.HOSPITAL_NO,
      firstName: row.FIRST_NAME,
      middleName: row.MIDDLE_NAME,
      lastName: row.LAST_NAME,
      patientPhoneNo: row.PATIENT_PHONE_NO,
    };
  }

  async listRecentPatients(limit = 10) {
    const take = Math.min(Math.max(limit, 1), 50);
    const receiptRows = await this.prisma.cashierPaymentReceipts.findMany({
      where: this.notDeletedReceipt(),
      orderBy: { PAID_AT: 'desc' },
      distinct: ['PERSON_ID'],
      take,
      select: { PERSON_ID: true },
    });

    const orderedIds = receiptRows.map((r) => r.PERSON_ID);
    const persons =
      orderedIds.length > 0
        ? await this.prisma.persons.findMany({
            where: {
              PERSON_ID: { in: orderedIds },
              DISCONTINUE_FLAG: { not: 'Y' },
            },
            select: this.personSelectCompact,
          })
        : [];

    const byId = new Map(persons.map((p) => [p.PERSON_ID, p]));
    const items = orderedIds
      .map((id) => byId.get(id))
      .filter((p): p is NonNullable<typeof p> => p != null)
      .map((p) => this.mapPersonCompact(p));

    if (items.length < take) {
      const exclude = new Set(items.map((i) => i.personId));
      const backfill = await this.prisma.persons.findMany({
        where: {
          DISCONTINUE_FLAG: { not: 'Y' },
          ...(exclude.size > 0 ? { PERSON_ID: { notIn: [...exclude] } } : {}),
        },
        orderBy: { CREATED_DATE: 'desc' },
        take: take - items.length,
        select: this.personSelectCompact,
      });
      items.push(...backfill.map((p) => this.mapPersonCompact(p)));
    }

    return { items };
  }

  async searchPatients(q?: string, limit = 20) {
    const term = q?.trim();
    if (!term) {
      return this.listRecentPatients(Math.min(limit, 10));
    }
    const take = Math.min(Math.max(limit, 1), 50);
    const result = await this.patientsService.search(term, 1, take);
    return {
      items: result.items.map((p) => ({
        personId: p.personId,
        hospitalNo: p.hospitalNo,
        firstName: p.firstName,
        middleName: p.middleName,
        lastName: p.lastName,
        patientPhoneNo: p.patientPhoneNo,
      })),
    };
  }

  private notDeletedReceipt(): Prisma.CashierPaymentReceiptsWhereInput {
    return { NOT: { DELETED_FLAG: 'Y' } };
  }

  private async nextNo(prefix: string, table: 'receipt' | 'refund' | 'discount' | 'shift') {
    const year = new Date().getFullYear();
    const start = `${prefix}-${year}-`;
    let last: string | null = null;
    if (table === 'receipt') {
      const row = await this.prisma.cashierPaymentReceipts.findFirst({
        where: { RECEIPT_NO: { startsWith: start } },
        orderBy: { RECEIPT_ID: 'desc' },
        select: { RECEIPT_NO: true },
      });
      last = row?.RECEIPT_NO ?? null;
    } else if (table === 'refund') {
      const row = await this.prisma.cashierRefundRequests.findFirst({
        where: { REFUND_NO: { startsWith: start } },
        orderBy: { REFUND_ID: 'desc' },
        select: { REFUND_NO: true },
      });
      last = row?.REFUND_NO ?? null;
    } else if (table === 'discount') {
      const row = await this.prisma.cashierDiscountRequests.findFirst({
        where: { DISCOUNT_NO: { startsWith: start } },
        orderBy: { DISCOUNT_ID: 'desc' },
        select: { DISCOUNT_NO: true },
      });
      last = row?.DISCOUNT_NO ?? null;
    } else {
      const row = await this.prisma.cashierShifts.findFirst({
        where: { SHIFT_NO: { startsWith: start } },
        orderBy: { SHIFT_ID: 'desc' },
        select: { SHIFT_NO: true },
      });
      last = row?.SHIFT_NO ?? null;
    }
    const seq = last ? Number(last.split('-').pop()) + 1 : 1;
    return `${start}${String(seq).padStart(4, '0')}`;
  }

  /** Idempotent receipt write after payment confirm. */
  async recordReceipt(input: RecordReceiptInput) {
    const existing = await this.prisma.cashierPaymentReceipts.findUnique({
      where: {
        SOURCE_TYPE_SOURCE_ID: {
          SOURCE_TYPE: input.sourceType,
          SOURCE_ID: input.sourceId,
        },
      },
    });
    if (existing) return this.mapReceipt(existing);

    const label = actorLabel(input.user);
    const now = new Date();
    const row = await this.prisma.cashierPaymentReceipts.create({
      data: {
        RECEIPT_NO: await this.nextNo('CPR', 'receipt'),
        SOURCE_TYPE: input.sourceType,
        SOURCE_ID: input.sourceId,
        PERSON_ID: input.personId,
        AMOUNT: input.amount,
        CHANNEL: input.channel,
        PAYMENT_REF: input.paymentRef ?? null,
        CASHIER_USER_ID: input.user?.id ?? null,
        CASHIER_LABEL: label,
        PAID_AT: now,
        STATUS: 'Captured',
        AMOUNT_REFUNDED: 0,
        PATIENT_NAME: input.patientName ?? null,
        SOURCE_REF: input.sourceRef ?? null,
        CREATED_BY_ID: input.user?.id ?? null,
        CREATED_BY: label,
        CREATED_DATE: now,
        DELETED_FLAG: 'N',
      },
    });
    return this.mapReceipt(row);
  }

  private mapReceipt(r: {
    RECEIPT_ID: number;
    RECEIPT_NO: string;
    SOURCE_TYPE: string;
    SOURCE_ID: number;
    PERSON_ID: number;
    AMOUNT: Prisma.Decimal;
    CHANNEL: string;
    PAYMENT_REF: string | null;
    CASHIER_USER_ID: number | null;
    CASHIER_LABEL: string | null;
    PAID_AT: Date;
    STATUS: string;
    AMOUNT_REFUNDED: Prisma.Decimal;
    PATIENT_NAME: string | null;
    SOURCE_REF: string | null;
  }) {
    const amount = dec(r.AMOUNT);
    const refunded = dec(r.AMOUNT_REFUNDED);
    return {
      receiptId: r.RECEIPT_ID,
      receiptNo: r.RECEIPT_NO,
      sourceType: r.SOURCE_TYPE,
      sourceId: r.SOURCE_ID,
      personId: r.PERSON_ID,
      amount,
      channel: r.CHANNEL,
      paymentRef: r.PAYMENT_REF,
      cashierUserId: r.CASHIER_USER_ID,
      cashierLabel: r.CASHIER_LABEL,
      paidAt: r.PAID_AT.toISOString(),
      status: r.STATUS,
      amountRefunded: refunded,
      refundableAmount: Math.max(0, amount - refunded),
      patientName: r.PATIENT_NAME,
      sourceRef: r.SOURCE_REF,
    };
  }

  async listReceipts(params?: { q?: string; page?: number; limit?: number }) {
    const page = Math.max(1, params?.page ?? 1);
    const limit = Math.min(100, Math.max(1, params?.limit ?? 50));
    const q = params?.q?.trim();
    const where: Prisma.CashierPaymentReceiptsWhereInput = {
      ...this.notDeletedReceipt(),
      STATUS: { in: ['Captured', 'PartiallyRefunded'] },
    };
    if (q) {
      where.OR = [
        { RECEIPT_NO: { contains: q, mode: 'insensitive' } },
        { PATIENT_NAME: { contains: q, mode: 'insensitive' } },
        { SOURCE_REF: { contains: q, mode: 'insensitive' } },
      ];
    }
    const [rows, total] = await Promise.all([
      this.prisma.cashierPaymentReceipts.findMany({
        where,
        orderBy: { PAID_AT: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.cashierPaymentReceipts.count({ where }),
    ]);
    return {
      items: rows.map((r) => this.mapReceipt(r)),
      meta: { page, limit, total },
    };
  }

  /* ---- Refunds ---- */

  async listRefunds(params?: { page?: number; limit?: number }) {
    const page = Math.max(1, params?.page ?? 1);
    const limit = Math.min(100, Math.max(1, params?.limit ?? 50));
    const where: Prisma.CashierRefundRequestsWhereInput = {
      NOT: { DELETED_FLAG: 'Y' },
    };
    const [rows, total, pending, paid, rejected] = await Promise.all([
      this.prisma.cashierRefundRequests.findMany({
        where,
        include: { receipt: true },
        orderBy: { CREATED_DATE: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.cashierRefundRequests.count({ where }),
      this.prisma.cashierRefundRequests.count({
        where: { ...where, STATUS: 'Pending' },
      }),
      this.prisma.cashierRefundRequests.count({
        where: { ...where, STATUS: 'Paid' },
      }),
      this.prisma.cashierRefundRequests.count({
        where: { ...where, STATUS: 'Rejected' },
      }),
    ]);
    const paidSum = await this.prisma.cashierRefundRequests.aggregate({
      where: { ...where, STATUS: 'Paid' },
      _sum: { AMOUNT: true },
    });
    return {
      kpis: {
        pending,
        paid,
        rejected,
        totalRefunded: dec(paidSum._sum.AMOUNT ?? 0),
      },
      items: rows.map((r) => ({
        refundId: r.REFUND_ID,
        refundNo: r.REFUND_NO,
        receiptId: r.RECEIPT_ID,
        receiptNo: r.receipt.RECEIPT_NO,
        patientName: r.receipt.PATIENT_NAME,
        amount: dec(r.AMOUNT),
        kind: r.KIND,
        method: r.METHOD,
        reason: r.REASON,
        status: r.STATUS,
        requestedBy: r.REQUESTED_BY,
        createdAt: r.CREATED_DATE?.toISOString() ?? null,
      })),
      meta: { page, limit, total },
    };
  }

  async createRefund(dto: CreateRefundDto, user: AuthUser) {
    const receipt = await this.prisma.cashierPaymentReceipts.findFirst({
      where: {
        RECEIPT_ID: dto.receiptId,
        ...this.notDeletedReceipt(),
      },
    });
    if (!receipt) throw new NotFoundException('Receipt not found');
    const refundable = dec(receipt.AMOUNT) - dec(receipt.AMOUNT_REFUNDED);
    if (dto.amount <= 0 || dto.amount > refundable + 1e-9) {
      throw new BadRequestException(
        `Amount must be between 0.01 and ${refundable.toFixed(2)}`,
      );
    }
    if (['Refunded'].includes(receipt.STATUS) && refundable <= 0) {
      throw new ConflictException('Receipt is fully refunded');
    }
    const label = actorLabel(user);
    const now = new Date();
    const row = await this.prisma.cashierRefundRequests.create({
      data: {
        REFUND_NO: await this.nextNo('CRF', 'refund'),
        RECEIPT_ID: dto.receiptId,
        AMOUNT: dto.amount,
        KIND: dto.kind,
        METHOD: dto.method,
        REASON: dto.reason.trim(),
        STATUS: 'Pending',
        REQUESTED_BY_ID: user.id,
        REQUESTED_BY: label,
        CREATED_BY_ID: user.id,
        CREATED_BY: label,
        CREATED_DATE: now,
        DELETED_FLAG: 'N',
      },
    });
    await this.audit.log({
      type: 'cashier-refund:create',
      entity: 'CashierRefundRequests',
      entityId: row.REFUND_ID,
      userId: user.id,
      createdBy: label,
      newValue: { amount: dto.amount, receiptId: dto.receiptId },
    });
    return { refundId: row.REFUND_ID, refundNo: row.REFUND_NO, status: row.STATUS };
  }

  async approveRefund(id: number, user: AuthUser) {
    const row = await this.prisma.cashierRefundRequests.findFirst({
      where: { REFUND_ID: id, NOT: { DELETED_FLAG: 'Y' } },
      include: { receipt: true },
    });
    if (!row) throw new NotFoundException('Refund request not found');
    if (row.STATUS !== 'Pending') {
      throw new ConflictException(`Refund is already ${row.STATUS}`);
    }
    const refundable =
      dec(row.receipt.AMOUNT) - dec(row.receipt.AMOUNT_REFUNDED);
    if (dec(row.AMOUNT) > refundable + 1e-9) {
      throw new BadRequestException('Refund amount exceeds refundable balance');
    }
    const label = actorLabel(user);
    const now = new Date();
    const newRefunded = dec(row.receipt.AMOUNT_REFUNDED) + dec(row.AMOUNT);
    const receiptStatus =
      newRefunded >= dec(row.receipt.AMOUNT) - 1e-9
        ? 'Refunded'
        : 'PartiallyRefunded';

    await this.prisma.$transaction(async (tx) => {
      await tx.cashierRefundRequests.update({
        where: { REFUND_ID: id },
        data: {
          STATUS: 'Paid',
          APPROVED_BY_ID: user.id,
          APPROVED_BY: label,
          APPROVED_AT: now,
          UPDATED_BY_ID: user.id,
          UPDATED_BY: label,
          UPDATED_DATE: now,
        },
      });
      await tx.cashierPaymentReceipts.update({
        where: { RECEIPT_ID: row.RECEIPT_ID },
        data: {
          AMOUNT_REFUNDED: newRefunded,
          STATUS: receiptStatus,
          UPDATED_BY_ID: user.id,
          UPDATED_BY: label,
          UPDATED_DATE: now,
        },
      });
    });
    await this.audit.log({
      type: 'cashier-refund:approve',
      entity: 'CashierRefundRequests',
      entityId: id,
      userId: user.id,
      createdBy: label,
      newValue: { status: 'Paid', amount: dec(row.AMOUNT) },
    });
    return { refundId: id, status: 'Paid' };
  }

  async rejectRefund(id: number, user: AuthUser) {
    const row = await this.prisma.cashierRefundRequests.findFirst({
      where: { REFUND_ID: id, NOT: { DELETED_FLAG: 'Y' } },
    });
    if (!row) throw new NotFoundException('Refund request not found');
    if (row.STATUS !== 'Pending') {
      throw new ConflictException(`Refund is already ${row.STATUS}`);
    }
    const label = actorLabel(user);
    const now = new Date();
    await this.prisma.cashierRefundRequests.update({
      where: { REFUND_ID: id },
      data: {
        STATUS: 'Rejected',
        APPROVED_BY_ID: user.id,
        APPROVED_BY: label,
        APPROVED_AT: now,
        UPDATED_BY_ID: user.id,
        UPDATED_BY: label,
        UPDATED_DATE: now,
      },
    });
    await this.audit.log({
      type: 'cashier-refund:reject',
      entity: 'CashierRefundRequests',
      entityId: id,
      userId: user.id,
      createdBy: label,
    });
    return { refundId: id, status: 'Rejected' };
  }

  /* ---- Discounts ---- */

  async listEligibleBills(opts?: { personId?: number }) {
    const personId = opts?.personId;
    const personWhere =
      personId != null ? { PERSON_ID: personId } : ({} as { PERSON_ID?: number });
    const partialErrors: string[] = [];
    const personSelect = {
      FIRST_NAME: true,
      MIDDLE_NAME: true,
      LAST_NAME: true,
      HOSPITAL_NO: true,
    };

    const [cardsR, salesR, rxR, labsR, admsR, imgsR, opcsR] =
      await Promise.allSettled([
        this.prisma.patientCards.findMany({
          where: { PAYMENT_STATUS: 'Pending', ...personWhere },
          take: personId != null ? 100 : 40,
          orderBy: { CREATED_DATE: 'desc' },
          include: { person: { select: personSelect } },
        }),
        this.prisma.pharmacySales.findMany({
          where: { PAYMENT_STATUS: 'Unpaid', ...personWhere },
          take: personId != null ? 100 : 40,
          orderBy: { CREATED_DATE: 'desc' },
          include: { person: { select: personSelect } },
        }),
        this.prisma.prescriptions.findMany({
          where: {
            PAYMENT_STATUS: { in: ['Unpaid', 'Emergency'] },
            ...personWhere,
          },
          take: personId != null ? 100 : 40,
          orderBy: { CREATED_DATE: 'desc' },
          include: {
            person: { select: personSelect },
            items: { select: { QUANTITY: true, UNIT_PRICE: true } },
          },
        }),
        this.prisma.labRequests.findMany({
          where: { PAYMENT_STATUS: 'Unpaid', ...personWhere },
          take: personId != null ? 100 : 40,
          orderBy: { CREATED_DATE: 'desc' },
          include: { person: { select: personSelect } },
        }),
        this.prisma.admissionBills.findMany({
          where: { PAYMENT_STATUS: 'Unpaid', ...personWhere },
          take: personId != null ? 100 : 40,
          orderBy: { CREATED_DATE: 'desc' },
          include: { person: { select: personSelect } },
        }),
        this.prisma.imagingRequests.findMany({
          where: { PAYMENT_STATUS: 'Unpaid', ...personWhere },
          take: personId != null ? 100 : 40,
          orderBy: { CREATED_DATE: 'desc' },
          include: { person: { select: personSelect } },
        }),
        this.prisma.opcVisits.findMany({
          where: { BILLING_STATUS: 'Unpaid', ...personWhere },
          take: personId != null ? 100 : 40,
          orderBy: { CHECK_IN_AT: 'desc' },
          include: { person: { select: personSelect } },
        }),
      ]);

    const unwrap = <T>(
      result: PromiseSettledResult<T[]>,
      label: string,
    ): T[] => {
      if (result.status === 'fulfilled') {
        return result.value;
      }
      const msg =
        result.reason instanceof Error
          ? result.reason.message
          : String(result.reason);
      partialErrors.push(`${label}: ${msg}`);
      return [];
    };

    const cards = unwrap(cardsR, 'Registration cards');
    const sales = unwrap(salesR, 'Pharmacy sales');
    const rx = unwrap(rxR, 'Prescriptions');
    const labs = unwrap(labsR, 'Laboratory');
    const adms = unwrap(admsR, 'Admission bills');
    const imgs = unwrap(imgsR, 'Imaging');
    const opcs = unwrap(opcsR, 'Psychiatric OPC');

    const items: {
      sourceType: string;
      sourceId: number;
      sourceRef: string;
      personId: number;
      patientName: string;
      amount: number;
      department: string;
      paymentStatus: string;
    }[] = [];

    for (const c of cards) {
      items.push({
        sourceType: 'card',
        sourceId: c.CARD_ID,
        sourceRef: c.CARD_NO,
        personId: c.PERSON_ID,
        patientName: personName(c.person),
        amount: dec(c.TOTAL_AMOUNT ?? 0),
        department: 'Registration',
        paymentStatus: c.PAYMENT_STATUS,
      });
    }
    for (const s of sales) {
      items.push({
        sourceType: 'pharmacy',
        sourceId: s.SALE_ID,
        sourceRef: s.SALE_NO,
        personId: s.PERSON_ID ?? 0,
        patientName: personName(s.person),
        amount: dec(s.TOTAL ?? 0),
        department: 'Pharmacy',
        paymentStatus: s.PAYMENT_STATUS,
      });
    }
    for (const r of rx) {
      const rxTotal = r.items.reduce(
        (sum, i) => sum + i.QUANTITY * dec(i.UNIT_PRICE),
        0,
      );
      items.push({
        sourceType: 'prescription',
        sourceId: r.PRESCRIPTION_ID,
        sourceRef: r.RX_NO,
        personId: r.PERSON_ID,
        patientName: personName(r.person),
        amount: rxTotal,
        department: 'Prescription',
        paymentStatus: r.PAYMENT_STATUS,
      });
    }
    for (const l of labs) {
      items.push({
        sourceType: 'lab',
        sourceId: l.LAB_REQUEST_ID,
        sourceRef: l.REQUEST_NO,
        personId: l.PERSON_ID,
        patientName: personName(l.person),
        amount: dec(l.TOTAL_AMOUNT ?? 0),
        department: 'Laboratory',
        paymentStatus: l.PAYMENT_STATUS,
      });
    }
    for (const a of adms) {
      items.push({
        sourceType: 'admission',
        sourceId: a.ADMISSION_BILL_ID,
        sourceRef: a.BILL_NO,
        personId: a.PERSON_ID,
        patientName: personName(a.person),
        amount: dec(a.TOTAL_AMOUNT ?? 0),
        department: 'Admission',
        paymentStatus: a.PAYMENT_STATUS,
      });
    }
    for (const i of imgs) {
      items.push({
        sourceType: 'imaging',
        sourceId: i.IMAGING_REQUEST_ID,
        sourceRef: i.REQUEST_NO,
        personId: i.PERSON_ID,
        patientName: personName(i.person),
        amount: dec(i.TOTAL_AMOUNT ?? 0),
        department: 'Imaging',
        paymentStatus: i.PAYMENT_STATUS,
      });
    }
    for (const o of opcs) {
      items.push({
        sourceType: 'opc',
        sourceId: o.OPC_VISIT_ID,
        sourceRef: o.VISIT_NO,
        personId: o.PERSON_ID,
        patientName: personName(o.person),
        amount: dec(o.CONSULT_AMOUNT ?? 0),
        department: 'Psychiatric OPC',
        paymentStatus: o.BILLING_STATUS,
      });
    }
    return { items, partialErrors };
  }

  async getPatientPaymentHistory(personId: number) {
    const person = await this.prisma.persons.findUnique({
      where: { PERSON_ID: personId },
      select: {
        PERSON_ID: true,
        HOSPITAL_NO: true,
        FIRST_NAME: true,
        MIDDLE_NAME: true,
        LAST_NAME: true,
        PATIENT_PHONE_NO: true,
      },
    });
    if (!person) {
      throw new NotFoundException('Patient not found');
    }

    const receipts = await this.prisma.cashierPaymentReceipts.findMany({
      where: { PERSON_ID: personId, ...this.notDeletedReceipt() },
      orderBy: { PAID_AT: 'desc' },
      take: 100,
    });

    const receiptIds = receipts.map((r) => r.RECEIPT_ID);
    const refunds =
      receiptIds.length > 0
        ? await this.prisma.cashierRefundRequests.findMany({
            where: {
              RECEIPT_ID: { in: receiptIds },
              NOT: { DELETED_FLAG: 'Y' },
            },
            orderBy: { CREATED_DATE: 'desc' },
          })
        : [];

    const eligible = await this.listEligibleBills({ personId });
    const settings = await this.getOrCreateSettings();
    const outstanding = eligible.items.reduce((s, i) => s + i.amount, 0);

    return {
      person: {
        personId: person.PERSON_ID,
        hospitalNo: person.HOSPITAL_NO,
        firstName: person.FIRST_NAME,
        middleName: person.MIDDLE_NAME,
        lastName: person.LAST_NAME,
        phone: person.PATIENT_PHONE_NO,
      },
      outstanding,
      receipts: receipts.map((r) => ({
        receiptNo: r.RECEIPT_NO,
        channel: r.CHANNEL,
        amount: dec(r.AMOUNT),
        paidAt: r.PAID_AT.toISOString(),
        sourceType: r.SOURCE_TYPE,
        sourceRef: r.SOURCE_REF,
        status: r.STATUS,
      })),
      outstandingBills: eligible.items.map((i) => ({
        sourceType: i.sourceType,
        sourceRef: i.sourceRef,
        department: i.department,
        amount: i.amount,
        paymentStatus: i.paymentStatus,
      })),
      refunds: refunds.map((r) => ({
        refundNo: r.REFUND_NO,
        amount: dec(r.AMOUNT),
        method: r.METHOD,
        status: r.STATUS,
      })),
      wallet: {
        balance: 0,
        enabled: settings.walletEnabled,
      },
      walletTxns: [] as {
        kind: string;
        amount: number;
        balanceAfter: number;
        by: string;
        at: string;
      }[],
      partialErrors: eligible.partialErrors,
    };
  }

  async listDiscounts(params?: { page?: number; limit?: number }) {
    const page = Math.max(1, params?.page ?? 1);
    const limit = Math.min(100, Math.max(1, params?.limit ?? 50));
    const where: Prisma.CashierDiscountRequestsWhereInput = {
      NOT: { DELETED_FLAG: 'Y' },
    };
    const [rows, total, pending, approved] = await Promise.all([
      this.prisma.cashierDiscountRequests.findMany({
        where,
        orderBy: { CREATED_DATE: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.cashierDiscountRequests.count({ where }),
      this.prisma.cashierDiscountRequests.count({
        where: { ...where, STATUS: 'Pending' },
      }),
      this.prisma.cashierDiscountRequests.count({
        where: { ...where, STATUS: 'Approved' },
      }),
    ]);
    const approvedSum = await this.prisma.cashierDiscountRequests.aggregate({
      where: { ...where, STATUS: 'Approved' },
      _sum: { COMPUTED_AMOUNT: true },
    });
    return {
      kpis: {
        pending,
        approved,
        totalDiscounted: dec(approvedSum._sum.COMPUTED_AMOUNT ?? 0),
      },
      items: rows.map((r) => ({
        discountId: r.DISCOUNT_ID,
        discountNo: r.DISCOUNT_NO,
        sourceType: r.SOURCE_TYPE,
        sourceId: r.SOURCE_ID,
        sourceRef: r.SOURCE_REF,
        patientName: r.PATIENT_NAME,
        discKind: r.DISC_KIND,
        category: r.CATEGORY,
        computedAmount: dec(r.COMPUTED_AMOUNT),
        status: r.STATUS,
        reason: r.REASON,
        createdAt: r.CREATED_DATE?.toISOString() ?? null,
      })),
      meta: { page, limit, total },
    };
  }

  async createDiscount(dto: CreateDiscountDto, user: AuthUser) {
    const bill = await this.resolveUnpaidBill(dto.sourceType, dto.sourceId);
    let computed = 0;
    if (dto.discKind === 'WAIVER') {
      computed = bill.amount;
    } else if (dto.discKind === 'PERCENT') {
      const pct = dto.value ?? 0;
      if (pct <= 0 || pct > 100) {
        throw new BadRequestException('Percent must be between 0 and 100');
      }
      computed = (bill.amount * pct) / 100;
    } else {
      computed = dto.value ?? 0;
      if (computed <= 0 || computed > bill.amount) {
        throw new BadRequestException('Fixed amount must be within bill total');
      }
    }
    const label = actorLabel(user);
    const now = new Date();
    const row = await this.prisma.cashierDiscountRequests.create({
      data: {
        DISCOUNT_NO: await this.nextNo('CDC', 'discount'),
        SOURCE_TYPE: dto.sourceType,
        SOURCE_ID: dto.sourceId,
        PERSON_ID: bill.personId,
        PATIENT_NAME: bill.patientName,
        SOURCE_REF: bill.sourceRef,
        DISC_KIND: dto.discKind,
        VALUE: dto.value ?? null,
        CATEGORY: dto.category,
        REASON: dto.reason.trim(),
        COMPUTED_AMOUNT: computed,
        BILL_AMOUNT: bill.amount,
        STATUS: 'Pending',
        REQUESTED_BY_ID: user.id,
        REQUESTED_BY: label,
        CREATED_BY_ID: user.id,
        CREATED_BY: label,
        CREATED_DATE: now,
        DELETED_FLAG: 'N',
      },
    });
    await this.audit.log({
      type: 'cashier-discount:create',
      entity: 'CashierDiscountRequests',
      entityId: row.DISCOUNT_ID,
      userId: user.id,
      createdBy: label,
      newValue: { computed, sourceType: dto.sourceType, sourceId: dto.sourceId },
    });
    return {
      discountId: row.DISCOUNT_ID,
      discountNo: row.DISCOUNT_NO,
      status: row.STATUS,
      computedAmount: computed,
    };
  }

  private async resolveUnpaidBill(sourceType: string, sourceId: number) {
    if (sourceType === 'card') {
      const c = await this.prisma.patientCards.findUnique({
        where: { CARD_ID: sourceId },
        include: {
          person: {
            select: { FIRST_NAME: true, MIDDLE_NAME: true, LAST_NAME: true },
          },
        },
      });
      if (!c || c.PAYMENT_STATUS !== 'Pending') {
        throw new BadRequestException('Card not unpaid');
      }
      return {
        personId: c.PERSON_ID,
        patientName: personName(c.person),
        sourceRef: c.CARD_NO,
        amount: dec(c.TOTAL_AMOUNT ?? 0),
      };
    }
    if (sourceType === 'pharmacy') {
      const s = await this.prisma.pharmacySales.findUnique({
        where: { SALE_ID: sourceId },
        include: {
          person: {
            select: { FIRST_NAME: true, MIDDLE_NAME: true, LAST_NAME: true },
          },
        },
      });
      if (!s || s.PAYMENT_STATUS !== 'Unpaid') {
        throw new BadRequestException('Sale not unpaid');
      }
      return {
        personId: s.PERSON_ID ?? 0,
        patientName: personName(s.person),
        sourceRef: s.SALE_NO,
        amount: dec(s.TOTAL ?? 0),
      };
    }
    if (sourceType === 'prescription') {
      const r = await this.prisma.prescriptions.findUnique({
        where: { PRESCRIPTION_ID: sourceId },
        include: {
          person: {
            select: { FIRST_NAME: true, MIDDLE_NAME: true, LAST_NAME: true },
          },
          items: { select: { QUANTITY: true, UNIT_PRICE: true } },
        },
      });
      if (!r || !['Unpaid', 'Emergency'].includes(r.PAYMENT_STATUS ?? '')) {
        throw new BadRequestException('Prescription not unpaid');
      }
      const rxTotal = r.items.reduce(
        (sum, i) => sum + i.QUANTITY * dec(i.UNIT_PRICE),
        0,
      );
      return {
        personId: r.PERSON_ID,
        patientName: personName(r.person),
        sourceRef: r.RX_NO,
        amount: rxTotal,
      };
    }
    if (sourceType === 'lab') {
      const l = await this.prisma.labRequests.findUnique({
        where: { LAB_REQUEST_ID: sourceId },
        include: {
          person: {
            select: { FIRST_NAME: true, MIDDLE_NAME: true, LAST_NAME: true },
          },
        },
      });
      if (!l || l.PAYMENT_STATUS !== 'Unpaid') {
        throw new BadRequestException('Lab request not unpaid');
      }
      return {
        personId: l.PERSON_ID,
        patientName: personName(l.person),
        sourceRef: l.REQUEST_NO,
        amount: dec(l.TOTAL_AMOUNT ?? 0),
      };
    }
    if (sourceType === 'admission') {
      const a = await this.prisma.admissionBills.findUnique({
        where: { ADMISSION_BILL_ID: sourceId },
        include: {
          person: {
            select: { FIRST_NAME: true, MIDDLE_NAME: true, LAST_NAME: true },
          },
        },
      });
      if (!a || a.PAYMENT_STATUS !== 'Unpaid') {
        throw new BadRequestException('Admission bill not unpaid');
      }
      return {
        personId: a.PERSON_ID,
        patientName: personName(a.person),
        sourceRef: a.BILL_NO,
        amount: dec(a.TOTAL_AMOUNT ?? 0),
      };
    }
    if (sourceType === 'imaging') {
      const i = await this.prisma.imagingRequests.findUnique({
        where: { IMAGING_REQUEST_ID: sourceId },
        include: {
          person: {
            select: { FIRST_NAME: true, MIDDLE_NAME: true, LAST_NAME: true },
          },
        },
      });
      if (!i || i.PAYMENT_STATUS !== 'Unpaid') {
        throw new BadRequestException('Imaging request not unpaid');
      }
      return {
        personId: i.PERSON_ID,
        patientName: personName(i.person),
        sourceRef: i.REQUEST_NO,
        amount: dec(i.TOTAL_AMOUNT ?? 0),
      };
    }
    if (sourceType === 'opc') {
      const o = await this.prisma.opcVisits.findUnique({
        where: { OPC_VISIT_ID: sourceId },
        include: {
          person: {
            select: { FIRST_NAME: true, MIDDLE_NAME: true, LAST_NAME: true },
          },
        },
      });
      if (!o || o.BILLING_STATUS !== 'Unpaid') {
        throw new BadRequestException('OPC consult not unpaid');
      }
      return {
        personId: o.PERSON_ID,
        patientName: personName(o.person),
        sourceRef: o.VISIT_NO,
        amount: dec(o.CONSULT_AMOUNT ?? 0),
      };
    }
    throw new BadRequestException('Invalid source type');
  }

  async approveDiscount(id: number, user: AuthUser) {
    const row = await this.prisma.cashierDiscountRequests.findFirst({
      where: { DISCOUNT_ID: id, NOT: { DELETED_FLAG: 'Y' } },
    });
    if (!row) throw new NotFoundException('Discount request not found');
    if (row.STATUS !== 'Pending') {
      throw new ConflictException(`Discount is already ${row.STATUS}`);
    }
    const label = actorLabel(user);
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      await tx.cashierDiscountRequests.update({
        where: { DISCOUNT_ID: id },
        data: {
          STATUS: 'Approved',
          APPROVED_BY_ID: user.id,
          APPROVED_BY: label,
          APPROVED_AT: now,
          UPDATED_BY_ID: user.id,
          UPDATED_BY: label,
          UPDATED_DATE: now,
        },
      });
      // Full waiver (or approve that covers bill): mark Waived
      if (
        row.DISC_KIND === 'WAIVER' ||
        dec(row.COMPUTED_AMOUNT) >= dec(row.BILL_AMOUNT) - 1e-9
      ) {
        await this.applyWaive(tx, row.SOURCE_TYPE, row.SOURCE_ID, label);
      } else {
        // Partial discount: still mark Waived for v1 clinical gate simplicity
        // when FIXED/PERCENT — domain bills are full-pay; use Waived for approved discounts
        await this.applyWaive(tx, row.SOURCE_TYPE, row.SOURCE_ID, label);
      }
    });

    await this.audit.log({
      type: 'cashier-discount:approve',
      entity: 'CashierDiscountRequests',
      entityId: id,
      userId: user.id,
      createdBy: label,
    });
    return { discountId: id, status: 'Approved' };
  }

  private async applyWaive(
    tx: Prisma.TransactionClient,
    sourceType: string,
    sourceId: number,
    label: string,
  ) {
    const now = new Date();
    if (sourceType === 'card') {
      await tx.patientCards.update({
        where: { CARD_ID: sourceId },
        data: {
          PAYMENT_STATUS: 'Waived',
          STATUS: 'Active',
          UPDATED_BY: label,
          UPDATED_DATE: now,
        },
      });
      return;
    }
    if (sourceType === 'pharmacy') {
      await tx.pharmacySales.update({
        where: { SALE_ID: sourceId },
        data: {
          PAYMENT_STATUS: 'Waived',
          UPDATED_BY: label,
          UPDATED_DATE: now,
        },
      });
      return;
    }
    if (sourceType === 'prescription') {
      await tx.prescriptions.update({
        where: { PRESCRIPTION_ID: sourceId },
        data: {
          PAYMENT_STATUS: 'Waived',
          UPDATED_BY: label,
          UPDATED_DATE: now,
        },
      });
      return;
    }
    if (sourceType === 'lab') {
      await tx.labRequests.update({
        where: { LAB_REQUEST_ID: sourceId },
        data: {
          PAYMENT_STATUS: 'Waived',
          UPDATED_BY: label,
          UPDATED_DATE: now,
        },
      });
      return;
    }
    if (sourceType === 'admission') {
      await tx.admissionBills.update({
        where: { ADMISSION_BILL_ID: sourceId },
        data: {
          PAYMENT_STATUS: 'Waived',
          UPDATED_BY: label,
          UPDATED_DATE: now,
        },
      });
      return;
    }
    if (sourceType === 'imaging') {
      await tx.imagingRequests.update({
        where: { IMAGING_REQUEST_ID: sourceId },
        data: {
          PAYMENT_STATUS: 'Waived',
          UPDATED_DATE: now,
        },
      });
      return;
    }
    if (sourceType === 'opc') {
      await tx.opcVisits.update({
        where: { OPC_VISIT_ID: sourceId },
        data: {
          BILLING_STATUS: 'Waived',
          UPDATED_DATE: now,
        },
      });
    }
  }

  async rejectDiscount(id: number, user: AuthUser) {
    const row = await this.prisma.cashierDiscountRequests.findFirst({
      where: { DISCOUNT_ID: id, NOT: { DELETED_FLAG: 'Y' } },
    });
    if (!row) throw new NotFoundException('Discount request not found');
    if (row.STATUS !== 'Pending') {
      throw new ConflictException(`Discount is already ${row.STATUS}`);
    }
    const label = actorLabel(user);
    const now = new Date();
    await this.prisma.cashierDiscountRequests.update({
      where: { DISCOUNT_ID: id },
      data: {
        STATUS: 'Rejected',
        APPROVED_BY_ID: user.id,
        APPROVED_BY: label,
        APPROVED_AT: now,
        UPDATED_BY_ID: user.id,
        UPDATED_BY: label,
        UPDATED_DATE: now,
      },
    });
    await this.audit.log({
      type: 'cashier-discount:reject',
      entity: 'CashierDiscountRequests',
      entityId: id,
      userId: user.id,
      createdBy: label,
    });
    return { discountId: id, status: 'Rejected' };
  }

  /* ---- Shifts ---- */

  private async shiftTotals(userId: number, openedAt: Date) {
    const receipts = await this.prisma.cashierPaymentReceipts.findMany({
      where: {
        ...this.notDeletedReceipt(),
        PAID_AT: { gte: openedAt },
        OR: [{ CASHIER_USER_ID: userId }, { CASHIER_USER_ID: null }],
        STATUS: { in: ['Captured', 'PartiallyRefunded', 'Refunded'] },
      },
    });
    const totals = {
      cash: 0,
      pos: 0,
      transfer: 0,
      online: 0,
      wallet: 0,
      nhia: 0,
      hmo: 0,
      refunds: 0,
      captured: 0,
    };
    for (const r of receipts) {
      if (r.CASHIER_USER_ID != null && r.CASHIER_USER_ID !== userId) continue;
      const net = dec(r.AMOUNT) - dec(r.AMOUNT_REFUNDED);
      totals.captured += net;
      totals.refunds += dec(r.AMOUNT_REFUNDED);
      const ch = (r.CHANNEL || '').toLowerCase();
      if (ch.includes('cash')) totals.cash += net;
      else if (ch.includes('pos')) totals.pos += net;
      else if (ch.includes('transfer') || ch.includes('bank')) totals.transfer += net;
      else if (ch.includes('online')) totals.online += net;
      else if (ch.includes('wallet')) totals.wallet += net;
      else if (ch.includes('nhia') || ch.includes('nhis')) totals.nhia += net;
      else if (ch.includes('hmo')) totals.hmo += net;
      else totals.cash += net;
    }
    return totals;
  }

  async currentShift(user: AuthUser) {
    const shift = await this.prisma.cashierShifts.findFirst({
      where: {
        CASHIER_USER_ID: user.id,
        STATUS: 'Open',
        NOT: { DELETED_FLAG: 'Y' },
      },
      orderBy: { OPENED_AT: 'desc' },
    });
    if (!shift) return { shift: null };
    const totals = await this.shiftTotals(user.id, shift.OPENED_AT);
    const expectedCash = dec(shift.OPENING_FLOAT) + totals.cash - totals.refunds;
    return {
      shift: {
        shiftId: shift.SHIFT_ID,
        shiftNo: shift.SHIFT_NO,
        cashierLabel: shift.CASHIER_LABEL,
        openingFloat: dec(shift.OPENING_FLOAT),
        openedAt: shift.OPENED_AT.toISOString(),
        status: shift.STATUS,
        totals,
        expectedCash,
      },
    };
  }

  async listShifts(params?: { page?: number; limit?: number }) {
    const page = Math.max(1, params?.page ?? 1);
    const limit = Math.min(100, Math.max(1, params?.limit ?? 50));
    const where: Prisma.CashierShiftsWhereInput = {
      NOT: { DELETED_FLAG: 'Y' },
    };
    const [rows, total] = await Promise.all([
      this.prisma.cashierShifts.findMany({
        where,
        orderBy: { OPENED_AT: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.cashierShifts.count({ where }),
    ]);
    return {
      items: rows.map((s) => ({
        shiftId: s.SHIFT_ID,
        shiftNo: s.SHIFT_NO,
        cashierLabel: s.CASHIER_LABEL,
        openedAt: s.OPENED_AT.toISOString(),
        closedAt: s.CLOSED_AT?.toISOString() ?? null,
        openingFloat: dec(s.OPENING_FLOAT),
        actualCash: s.ACTUAL_CASH != null ? dec(s.ACTUAL_CASH) : null,
        variance: s.VARIANCE != null ? dec(s.VARIANCE) : null,
        expectedCash:
          s.TOTALS_JSON &&
          typeof s.TOTALS_JSON === 'object' &&
          'expectedCash' in (s.TOTALS_JSON as object)
            ? Number((s.TOTALS_JSON as { expectedCash?: number }).expectedCash)
            : null,
        status: s.STATUS,
        note: s.NOTE,
      })),
      meta: { page, limit, total },
    };
  }

  async openShift(dto: OpenShiftDto, user: AuthUser) {
    const open = await this.prisma.cashierShifts.findFirst({
      where: {
        CASHIER_USER_ID: user.id,
        STATUS: 'Open',
        NOT: { DELETED_FLAG: 'Y' },
      },
    });
    if (open) throw new ConflictException('You already have an open shift');
    const label = actorLabel(user);
    const now = new Date();
    const row = await this.prisma.cashierShifts.create({
      data: {
        SHIFT_NO: await this.nextNo('CSH', 'shift'),
        CASHIER_USER_ID: user.id,
        CASHIER_LABEL: label,
        OPENING_FLOAT: dto.openingFloat,
        OPENED_AT: now,
        STATUS: 'Open',
        CREATED_BY_ID: user.id,
        CREATED_BY: label,
        CREATED_DATE: now,
        DELETED_FLAG: 'N',
      },
    });
    await this.audit.log({
      type: 'cashier-shift:open',
      entity: 'CashierShifts',
      entityId: row.SHIFT_ID,
      userId: user.id,
      createdBy: label,
      newValue: { openingFloat: dto.openingFloat },
    });
    return { shiftId: row.SHIFT_ID, shiftNo: row.SHIFT_NO, status: 'Open' };
  }

  async closeShift(id: number, dto: CloseShiftDto, user: AuthUser) {
    const shift = await this.prisma.cashierShifts.findFirst({
      where: { SHIFT_ID: id, NOT: { DELETED_FLAG: 'Y' } },
    });
    if (!shift) throw new NotFoundException('Shift not found');
    if (shift.STATUS !== 'Open') {
      throw new ConflictException(`Shift is already ${shift.STATUS}`);
    }
    if (shift.CASHIER_USER_ID !== user.id) {
      throw new BadRequestException('You can only close your own shift');
    }
    const totals = await this.shiftTotals(user.id, shift.OPENED_AT);
    const expectedCash =
      dec(shift.OPENING_FLOAT) + totals.cash - totals.refunds;
    const variance = dto.actualCash - expectedCash;
    const label = actorLabel(user);
    const now = new Date();
    await this.prisma.cashierShifts.update({
      where: { SHIFT_ID: id },
      data: {
        STATUS: 'Closed',
        CLOSED_AT: now,
        ACTUAL_CASH: dto.actualCash,
        VARIANCE: variance,
        NOTE: dto.note?.trim() || null,
        TOTALS_JSON: { ...totals, expectedCash },
        UPDATED_BY_ID: user.id,
        UPDATED_BY: label,
        UPDATED_DATE: now,
      },
    });
    await this.audit.log({
      type: 'cashier-shift:close',
      entity: 'CashierShifts',
      entityId: id,
      userId: user.id,
      createdBy: label,
      newValue: { actualCash: dto.actualCash, variance, expectedCash },
    });
    return { shiftId: id, status: 'Closed', variance, expectedCash };
  }

  async approveShift(id: number, user: AuthUser) {
    const shift = await this.prisma.cashierShifts.findFirst({
      where: { SHIFT_ID: id, NOT: { DELETED_FLAG: 'Y' } },
    });
    if (!shift) throw new NotFoundException('Shift not found');
    if (shift.STATUS !== 'Closed') {
      throw new ConflictException('Only closed shifts can be approved');
    }
    const label = actorLabel(user);
    const now = new Date();
    await this.prisma.cashierShifts.update({
      where: { SHIFT_ID: id },
      data: {
        STATUS: 'Approved',
        APPROVED_BY_ID: user.id,
        APPROVED_BY: label,
        APPROVED_AT: now,
        UPDATED_BY_ID: user.id,
        UPDATED_BY: label,
        UPDATED_DATE: now,
      },
    });
    await this.audit.log({
      type: 'cashier-shift:approve',
      entity: 'CashierShifts',
      entityId: id,
      userId: user.id,
      createdBy: label,
    });
    return { shiftId: id, status: 'Approved' };
  }

  /* ---- Reports ---- */

  async getReports(params?: { from?: string; to?: string }) {
    const { start, end } = dayBounds(params?.from, params?.to);
    const receipts = await this.prisma.cashierPaymentReceipts.findMany({
      where: {
        ...this.notDeletedReceipt(),
        PAID_AT: { gte: start, lt: end },
        STATUS: { in: ['Captured', 'PartiallyRefunded', 'Refunded'] },
      },
    });

    const bySourceMap = new Map<string, number>();
    const byChannelMap = new Map<string, number>();
    let collected = 0;
    let refunds = 0;
    for (const r of receipts) {
      const net = dec(r.AMOUNT) - dec(r.AMOUNT_REFUNDED);
      collected += net;
      refunds += dec(r.AMOUNT_REFUNDED);
      const dept = SOURCE_DEPT[r.SOURCE_TYPE] ?? r.SOURCE_TYPE;
      bySourceMap.set(dept, (bySourceMap.get(dept) ?? 0) + net);
      const ch = bucketChannel(r.CHANNEL);
      byChannelMap.set(ch, (byChannelMap.get(ch) ?? 0) + net);
    }

    const discountedAgg = await this.prisma.cashierDiscountRequests.aggregate({
      where: {
        NOT: { DELETED_FLAG: 'Y' },
        STATUS: 'Approved',
        APPROVED_AT: { gte: start, lt: end },
      },
      _sum: { COMPUTED_AMOUNT: true },
    });

    const eligible = await this.listEligibleBills();
    const outstandingItems = eligible.items.slice(0, 25).map((i) => ({
      ref: i.sourceRef,
      patientName: i.patientName,
      department: i.department,
      amount: i.amount,
      createdAt: null as string | null,
      sourceType: i.sourceType,
      sourceId: i.sourceId,
    }));
    const outstanding = eligible.items.reduce((s, i) => s + i.amount, 0);

    return {
      from: start.toISOString(),
      to: end.toISOString(),
      kpis: {
        collected,
        refunds,
        receiptCount: receipts.length,
        outstanding,
        discounted: dec(discountedAgg._sum.COMPUTED_AMOUNT ?? 0),
      },
      bySource: [...bySourceMap.entries()].map(([department, amount]) => ({
        department,
        amount,
      })),
      byChannel: ['Cash', 'POS', 'Transfer', 'Online', 'Wallet', 'NHIA', 'HMO'].map(
        (c) => ({ channel: c, amount: byChannelMap.get(c) ?? 0 }),
      ),
      outstandingItems,
      partialErrors:
        eligible.partialErrors.length > 0 ? eligible.partialErrors : undefined,
    };
  }

  /* ---- Verify / reprint ---- */

  async verifyReceipt(receiptNo: string, user?: AuthUser) {
    const no = receiptNo?.trim();
    if (!no) throw new BadRequestException('receiptNo is required');
    const row = await this.prisma.cashierPaymentReceipts.findFirst({
      where: {
        RECEIPT_NO: { equals: no, mode: 'insensitive' },
        ...this.notDeletedReceipt(),
      },
    });
    if (!row) throw new NotFoundException('Receipt not found');
    const mapped = this.mapReceipt(row);
    if (user) {
      await this.audit.log({
        type: 'cashier-receipt:verify',
        entity: 'CashierPaymentReceipts',
        entityId: row.RECEIPT_ID,
        userId: user.id,
        createdBy: actorLabel(user),
        item: row.RECEIPT_NO,
        newValue: { status: row.STATUS },
      });
    }
    return { valid: true, receipt: mapped };
  }

  async reprintReceipt(id: number, user: AuthUser) {
    const row = await this.prisma.cashierPaymentReceipts.findFirst({
      where: { RECEIPT_ID: id, ...this.notDeletedReceipt() },
    });
    if (!row) throw new NotFoundException('Receipt not found');
    const settings = await this.getOrCreateSettings();
    await this.audit.log({
      type: 'cashier-receipt:reprint',
      entity: 'CashierPaymentReceipts',
      entityId: id,
      userId: user.id,
      createdBy: actorLabel(user),
      item: row.RECEIPT_NO,
      newValue: { watermark: settings.reprintWatermark },
    });
    return {
      receiptId: id,
      receiptNo: row.RECEIPT_NO,
      watermark: settings.reprintWatermark,
      reprinted: true,
    };
  }

  /* ---- Audit ---- */

  async listAudit(params?: {
    q?: string;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(1, params?.page ?? 1);
    const limit = Math.min(100, Math.max(1, params?.limit ?? 50));
    const term = params?.q?.trim();
    const base = cashierAuditWhere();
    const where: Prisma.AuditsWhereInput = {
      AND: [
        base,
        ...(term
          ? [
              {
                OR: [
                  {
                    CREATED_BY: {
                      contains: term,
                      mode: 'insensitive' as const,
                    },
                  },
                  {
                    ITEM: { contains: term, mode: 'insensitive' as const },
                  },
                  {
                    AUDIT_TYPE: {
                      contains: term,
                      mode: 'insensitive' as const,
                    },
                  },
                  {
                    ENTITY: { contains: term, mode: 'insensitive' as const },
                  },
                  { ENTITY_ID: { contains: term } },
                ],
              },
            ]
          : []),
      ],
    };
    const [rows, total, stats] = await Promise.all([
      this.prisma.audits.findMany({
        where,
        include: { user: { include: { role: true } } },
        orderBy: { CREATE_DATE: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.audits.count({ where }),
      this.auditStats(),
    ]);
    return {
      items: rows.map((r) => ({
        auditId: r.AUDIT_ID,
        time: r.CREATE_DATE?.toISOString() ?? null,
        actor: r.CREATED_BY ?? 'SYSTEM',
        role: r.user?.role?.ROLE_NAME ?? '—',
        action: r.AUDIT_TYPE ?? r.ITEM ?? 'audit',
        entity: r.ENTITY,
        entityId: r.ENTITY_ID,
        status: r.STATUS ?? 'Success',
      })),
      meta: { page, limit, total },
      stats,
    };
  }

  async auditStats() {
    const { start, end } = dayBounds();
    const today = { CREATE_DATE: { gte: start, lt: end } };
    const base = cashierAuditWhere();
    const [totalToday, payments, refunds, discounts, shifts] =
      await Promise.all([
        this.prisma.audits.count({ where: { AND: [base, today] } }),
        this.prisma.audits.count({
          where: {
            AND: [
              today,
              {
                OR: CASHIER_AUDIT_TYPES.map((t) => ({ AUDIT_TYPE: t })),
              },
            ],
          },
        }),
        this.prisma.audits.count({
          where: {
            AND: [
              today,
              { AUDIT_TYPE: { startsWith: 'cashier-refund' } },
            ],
          },
        }),
        this.prisma.audits.count({
          where: {
            AND: [
              today,
              { AUDIT_TYPE: { startsWith: 'cashier-discount' } },
            ],
          },
        }),
        this.prisma.audits.count({
          where: {
            AND: [
              today,
              { AUDIT_TYPE: { startsWith: 'cashier-shift' } },
            ],
          },
        }),
      ]);
    return { totalToday, payments, refunds, discounts, shifts };
  }

  /* ---- Settings ---- */

  private mapSettings(row: {
    SETTINGS_ID: number;
    CASH_ENABLED: string;
    POS_ENABLED: string;
    BANK_TRANSFER_ENABLED: string;
    ONLINE_CARD_ENABLED: string;
    WALLET_ENABLED: string;
    NHIA_ENABLED: string;
    HMO_ENABLED: string;
    REQUIRE_OPEN_SHIFT: string;
    VARIANCE_TOLERANCE: Prisma.Decimal;
    REPRINT_WATERMARK: string;
    UPDATED_BY: string | null;
    UPDATED_DATE: Date | null;
  }) {
    return {
      settingsId: row.SETTINGS_ID,
      cashEnabled: row.CASH_ENABLED === 'Y',
      posEnabled: row.POS_ENABLED === 'Y',
      bankTransferEnabled: row.BANK_TRANSFER_ENABLED === 'Y',
      onlineCardEnabled: row.ONLINE_CARD_ENABLED === 'Y',
      walletEnabled: row.WALLET_ENABLED === 'Y',
      nhiaEnabled: row.NHIA_ENABLED === 'Y',
      hmoEnabled: row.HMO_ENABLED === 'Y',
      requireOpenShift: row.REQUIRE_OPEN_SHIFT === 'Y',
      varianceTolerance: dec(row.VARIANCE_TOLERANCE),
      reprintWatermark: row.REPRINT_WATERMARK === 'Y',
      updatedBy: row.UPDATED_BY,
      updatedAt: row.UPDATED_DATE?.toISOString() ?? null,
    };
  }

  async getOrCreateSettings() {
    let row = await this.prisma.cashierSettings.findUnique({
      where: { SETTINGS_ID: 1 },
    });
    if (!row) {
      row = await this.prisma.cashierSettings.create({
        data: { SETTINGS_ID: 1, CREATED_DATE: new Date() },
      });
    }
    return this.mapSettings(row);
  }

  async updateSettings(dto: UpdateCashierSettingsDto, user: AuthUser) {
    await this.getOrCreateSettings();
    const before = await this.prisma.cashierSettings.findUniqueOrThrow({
      where: { SETTINGS_ID: 1 },
    });
    const label = actorLabel(user);
    const updated = await this.prisma.cashierSettings.update({
      where: { SETTINGS_ID: 1 },
      data: {
        ...(dto.cashEnabled !== undefined
          ? { CASH_ENABLED: yn(dto.cashEnabled) }
          : {}),
        ...(dto.posEnabled !== undefined
          ? { POS_ENABLED: yn(dto.posEnabled) }
          : {}),
        ...(dto.bankTransferEnabled !== undefined
          ? { BANK_TRANSFER_ENABLED: yn(dto.bankTransferEnabled) }
          : {}),
        ...(dto.onlineCardEnabled !== undefined
          ? { ONLINE_CARD_ENABLED: yn(dto.onlineCardEnabled) }
          : {}),
        ...(dto.walletEnabled !== undefined
          ? { WALLET_ENABLED: yn(dto.walletEnabled) }
          : {}),
        ...(dto.nhiaEnabled !== undefined
          ? { NHIA_ENABLED: yn(dto.nhiaEnabled) }
          : {}),
        ...(dto.hmoEnabled !== undefined
          ? { HMO_ENABLED: yn(dto.hmoEnabled) }
          : {}),
        ...(dto.requireOpenShift !== undefined
          ? { REQUIRE_OPEN_SHIFT: yn(dto.requireOpenShift) }
          : {}),
        ...(dto.varianceTolerance !== undefined
          ? { VARIANCE_TOLERANCE: dto.varianceTolerance }
          : {}),
        ...(dto.reprintWatermark !== undefined
          ? { REPRINT_WATERMARK: yn(dto.reprintWatermark) }
          : {}),
        UPDATED_BY_ID: user.id,
        UPDATED_BY: label,
        UPDATED_DATE: new Date(),
      },
    });
    const response = this.mapSettings(updated);
    await this.audit.log({
      type: 'cashier-settings:update',
      entity: 'CashierSettings',
      entityId: 1,
      userId: user.id,
      createdBy: label,
      oldValue: this.mapSettings(before),
      newValue: response,
    });
    return response;
  }
}
