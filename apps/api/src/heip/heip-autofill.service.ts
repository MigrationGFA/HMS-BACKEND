import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type HeipAutoFillContext = {
  userId: number;
  employeeId: number;
  departmentId: number | null;
  reportDate: Date;
};

/** UTC date-only range [start, end) for hospital day. */
export function hospitalDayRangeUtc(reportDate: Date): { start: Date; end: Date } {
  const y = reportDate.getUTCFullYear();
  const m = reportDate.getUTCMonth();
  const d = reportDate.getUTCDate();
  const start = new Date(Date.UTC(y, m, d, 0, 0, 0, 0));
  const end = new Date(Date.UTC(y, m, d + 1, 0, 0, 0, 0));
  return { start, end };
}

export function parseDateOnlyUtc(iso: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) {
    const d = new Date(iso);
    return new Date(
      Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
    );
  }
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

export function toDateOnlyIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

type ProviderFn = (
  prisma: PrismaService,
  ctx: HeipAutoFillContext,
  range: { start: Date; end: Date },
) => Promise<number | null>;

/**
 * Best-effort auto-fill providers. Return `null` when the source cannot be
 * resolved safely (form leaves blank). Return `0` when the query ran and found
 * no rows.
 */
const PROVIDERS: Record<string, ProviderFn> = {
  'encounters.completed_today': async (prisma, ctx, range) => {
    const completed = await prisma.encounters.count({
      where: {
        DOCTOR_ID: ctx.userId,
        STATUS: { in: ['Completed', 'Closed'] },
        OR: [
          { COMPLETED_AT: { gte: range.start, lt: range.end } },
          {
            COMPLETED_AT: null,
            STARTED_AT: { gte: range.start, lt: range.end },
          },
        ],
      },
    });
    if (completed > 0) return completed;
    return prisma.encounters.count({
      where: {
        DOCTOR_ID: ctx.userId,
        STARTED_AT: { gte: range.start, lt: range.end },
      },
    });
  },

  'admissions.today': async (prisma, _ctx, range) => {
    return prisma.admissions.count({
      where: {
        OR: [
          { ADMITTED_AT: { gte: range.start, lt: range.end } },
          { CREATED_DATE: { gte: range.start, lt: range.end } },
        ],
        STATUS: { notIn: ['CANCELLED'] },
      },
    });
  },

  'admissions.discharges_today': async (prisma, _ctx, range) => {
    return prisma.admissions.count({
      where: {
        DISCHARGED_AT: { gte: range.start, lt: range.end },
      },
    });
  },

  'pharmacy.rx_dispensed_today': async (prisma, _ctx, range) => {
    return prisma.prescriptions.count({
      where: {
        STATUS: { in: ['Dispensed', 'Partially Dispensed'] },
        OR: [
          { UPDATED_DATE: { gte: range.start, lt: range.end } },
          {
            UPDATED_DATE: null,
            CREATED_DATE: { gte: range.start, lt: range.end },
          },
        ],
      },
    });
  },

  'pharmacy.walkin_sales_today': async (prisma, _ctx, range) => {
    return prisma.pharmacySales.count({
      where: {
        STATUS: { in: ['Dispensed', 'Partially Dispensed', 'Paid'] },
        OR: [
          { DISPENSED_AT: { gte: range.start, lt: range.end } },
          {
            DISPENSED_AT: null,
            PAID_AT: { gte: range.start, lt: range.end },
          },
        ],
      },
    });
  },

  'pharmacy.stock_outs': async (prisma) => {
    const drugs = await prisma.drugs.findMany({
      where: { STATUS: 'Active', REORDER_LEVEL: { gt: 0 } },
      select: {
        DRUG_ID: true,
        REORDER_LEVEL: true,
        batches: { select: { QTY_AVAILABLE: true } },
      },
    });
    let count = 0;
    for (const drug of drugs) {
      const qty = drug.batches.reduce((s, b) => s + (b.QTY_AVAILABLE ?? 0), 0);
      if (qty <= drug.REORDER_LEVEL) count += 1;
    }
    return count;
  },

  'lab.requests_today': async (prisma, _ctx, range) => {
    return prisma.labRequests.count({
      where: {
        STATUS: { not: 'Cancelled' },
        CREATED_DATE: { gte: range.start, lt: range.end },
      },
    });
  },

  'lab.completed_today': async (prisma, _ctx, range) => {
    return prisma.labRequests.count({
      where: {
        LAB_STATUS: { in: ['Validated', 'PendingRevalidation'] },
        UPDATED_DATE: { gte: range.start, lt: range.end },
      },
    });
  },

  'cashier.receipts_count_today': async (prisma, _ctx, range) => {
    return prisma.cashierPaymentReceipts.count({
      where: {
        DELETED_FLAG: { not: 'Y' },
        PAID_AT: { gte: range.start, lt: range.end },
      },
    });
  },

  'cashier.receipts_total_today': async (prisma, _ctx, range) => {
    const agg = await prisma.cashierPaymentReceipts.aggregate({
      where: {
        DELETED_FLAG: { not: 'Y' },
        PAID_AT: { gte: range.start, lt: range.end },
      },
      _sum: { AMOUNT: true },
    });
    const sum = agg._sum.AMOUNT;
    return sum == null ? 0 : Number(sum);
  },

  'records.registrations_today': async (prisma, _ctx, range) => {
    const cards = await prisma.patientCards.count({
      where: { CREATED_DATE: { gte: range.start, lt: range.end } },
    });
    if (cards > 0) return cards;
    return prisma.persons.count({
      where: { CREATED_DATE: { gte: range.start, lt: range.end } },
    });
  },

  'records.checkins_today': async (prisma, _ctx, range) => {
    return prisma.serviceBookings.count({
      where: { CHECKED_IN_AT: { gte: range.start, lt: range.end } },
    });
  },

  'nursing.incidents_today': async (prisma, _ctx, range) => {
    return prisma.nursingIncidents.count({
      where: { CREATED_DATE: { gte: range.start, lt: range.end } },
    });
  },
};

@Injectable()
export class HeipAutofillService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveOne(
    source: string,
    ctx: HeipAutoFillContext,
  ): Promise<number | null> {
    const provider = PROVIDERS[source];
    if (!provider) return null;
    const range = hospitalDayRangeUtc(ctx.reportDate);
    try {
      return await provider(this.prisma, ctx, range);
    } catch {
      return null;
    }
  }

  async resolveMany(
    sources: string[],
    ctx: HeipAutoFillContext,
  ): Promise<Record<string, number | null>> {
    const unique = [...new Set(sources.filter(Boolean))];
    const out: Record<string, number | null> = {};
    await Promise.all(
      unique.map(async (src) => {
        out[src] = await this.resolveOne(src, ctx);
      }),
    );
    return out;
  }

  /** Stamp system values onto field schema for "today" response. */
  async stampFields(
    fields: Array<{ key: string; autoFillSource?: string | null }>,
    ctx: HeipAutoFillContext,
  ): Promise<
    Array<{
      fieldKey: string;
      autoFillSource: string | null;
      systemValue: number | null;
    }>
  > {
    const sources = fields
      .map((f) => f.autoFillSource)
      .filter((s): s is string => !!s);
    const resolved = await this.resolveMany(sources, ctx);
    return fields.map((f) => ({
      fieldKey: f.key,
      autoFillSource: f.autoFillSource ?? null,
      systemValue: f.autoFillSource
        ? (resolved[f.autoFillSource] ?? null)
        : null,
    }));
  }
}

export function decimalOrNull(
  v: Prisma.Decimal | number | null | undefined,
): number | null {
  if (v == null) return null;
  return Number(v);
}
