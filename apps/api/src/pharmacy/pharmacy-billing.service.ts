import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../auth/types/auth-user.type';
import { PrescriptionsService } from '../clinical/prescriptions/prescriptions.service';
import { WalkInSalesService } from './walk-in-sales.service';
import type { ConfirmPrescriptionPaymentDto } from '../clinical/prescriptions/dto/prescription.dto';
import type { ConfirmWalkInPaymentDto } from './dto/walk-in-sale.dto';

export type PharmacyBillType = 'prescription' | 'walk_in';

export type PharmacyBillRow = {
  type: PharmacyBillType;
  id: number;
  refNo: string;
  personId: number;
  patientName: string;
  hospitalNo: string | null;
  total: number;
  paymentStatus: string;
  paymentChannel: string | null;
  status: string;
  createdAt: string | null;
  paidAt: string | null;
};

function personName(p: {
  FIRST_NAME: string | null;
  LAST_NAME: string | null;
  MIDDLE_NAME?: string | null;
}): string {
  return [p.FIRST_NAME, p.MIDDLE_NAME, p.LAST_NAME].filter(Boolean).join(' ') || 'Unknown';
}

@Injectable()
export class PharmacyBillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly prescriptions: PrescriptionsService,
    private readonly walkInSales: WalkInSalesService,
  ) {}

  async summary(params?: { from?: string; to?: string }) {
    const from = params?.from ? new Date(params.from) : startOfDay(daysAgo(30));
    const to = params?.to ? new Date(params.to) : endOfDay(new Date());

    const [rxPaid, rxPending, salesPaid, salesPending, paidRxRows, paidSaleRows] =
      await Promise.all([
        this.prisma.prescriptions.count({
          where: {
            PAYMENT_STATUS: 'Paid',
            PAID_AT: { gte: from, lte: to },
          },
        }),
        this.prisma.prescriptions.count({
          where: {
            PAYMENT_STATUS: { in: ['Unpaid', 'Emergency'] },
            STATUS: { notIn: ['Cancelled', 'Rejected', 'Draft'] },
          },
        }),
        this.prisma.pharmacySales.count({
          where: {
            PAYMENT_STATUS: 'Paid',
            PAID_AT: { gte: from, lte: to },
          },
        }),
        this.prisma.pharmacySales.count({
          where: {
            PAYMENT_STATUS: 'Unpaid',
            STATUS: { not: 'Cancelled' },
          },
        }),
        this.prisma.prescriptions.findMany({
          where: {
            PAYMENT_STATUS: 'Paid',
            PAID_AT: { gte: from, lte: to },
          },
          include: { items: true },
        }),
        this.prisma.pharmacySales.findMany({
          where: {
            PAYMENT_STATUS: 'Paid',
            PAID_AT: { gte: from, lte: to },
          },
        }),
      ]);

    const channelTotals: Record<string, number> = {
      Cash: 0,
      'POS Card': 0,
      'Bank Transfer': 0,
      Wallet: 0,
      Other: 0,
    };

    for (const rx of paidRxRows) {
      const total = rx.items.reduce(
        (s, i) => s + i.QUANTITY * Number(i.UNIT_PRICE),
        0,
      );
      bumpChannel(channelTotals, rx.PAYMENT_CHANNEL, total);
    }
    for (const sale of paidSaleRows) {
      bumpChannel(channelTotals, sale.PAYMENT_CHANNEL, Number(sale.TOTAL));
    }

    return {
      paidCount: rxPaid + salesPaid,
      pendingCount: rxPending + salesPending,
      paidRxCount: rxPaid,
      paidWalkInCount: salesPaid,
      pendingRxCount: rxPending,
      pendingWalkInCount: salesPending,
      channelTotals,
      revenueTotal: Object.values(channelTotals).reduce((a, b) => a + b, 0),
      from: from.toISOString(),
      to: to.toISOString(),
    };
  }

  async listBills(params?: {
    q?: string;
    paymentStatus?: string;
    type?: string;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(params?.page ?? 1, 1);
    const limit = Math.min(Math.max(params?.limit ?? 50, 1), 100);
    const paymentFilter =
      params?.paymentStatus && params.paymentStatus !== 'all'
        ? params.paymentStatus.includes(',')
          ? params.paymentStatus.split(',').map((s) => s.trim())
          : [params.paymentStatus]
        : undefined;
    const type = params?.type && params.type !== 'all' ? params.type : undefined;
    const q = params?.q?.trim();

    const personOr: Prisma.PersonsWhereInput[] | undefined = q
      ? [
          { HOSPITAL_NO: { contains: q, mode: 'insensitive' } },
          { FIRST_NAME: { contains: q, mode: 'insensitive' } },
          { LAST_NAME: { contains: q, mode: 'insensitive' } },
        ]
      : undefined;

    const bills: PharmacyBillRow[] = [];

    if (!type || type === 'prescription') {
      const rxWhere: Prisma.PrescriptionsWhereInput = {
        STATUS: { notIn: ['Draft'] },
        ...(paymentFilter ? { PAYMENT_STATUS: { in: paymentFilter } } : {}),
        ...(q
          ? {
              OR: [
                { RX_NO: { contains: q, mode: 'insensitive' } },
                { person: { OR: personOr } },
              ],
            }
          : {}),
      };
      const rows = await this.prisma.prescriptions.findMany({
        where: rxWhere,
        include: {
          items: true,
          person: {
            select: {
              FIRST_NAME: true,
              LAST_NAME: true,
              MIDDLE_NAME: true,
              HOSPITAL_NO: true,
            },
          },
        },
        orderBy: { CREATED_DATE: 'desc' },
        take: 200,
      });
      for (const r of rows) {
        bills.push({
          type: 'prescription',
          id: r.PRESCRIPTION_ID,
          refNo: r.RX_NO,
          personId: r.PERSON_ID,
          patientName: personName(r.person),
          hospitalNo: r.person.HOSPITAL_NO,
          total: r.items.reduce(
            (s, i) => s + i.QUANTITY * Number(i.UNIT_PRICE),
            0,
          ),
          paymentStatus: r.PAYMENT_STATUS,
          paymentChannel: r.PAYMENT_CHANNEL,
          status: r.STATUS,
          createdAt: r.CREATED_DATE?.toISOString() ?? null,
          paidAt: r.PAID_AT?.toISOString() ?? null,
        });
      }
    }

    if (!type || type === 'walk_in') {
      const saleWhere: Prisma.PharmacySalesWhereInput = {
        ...(paymentFilter ? { PAYMENT_STATUS: { in: paymentFilter } } : {}),
        ...(q
          ? {
              OR: [
                { SALE_NO: { contains: q, mode: 'insensitive' } },
                { person: { OR: personOr } },
              ],
            }
          : {}),
      };
      const rows = await this.prisma.pharmacySales.findMany({
        where: saleWhere,
        include: {
          person: {
            select: {
              FIRST_NAME: true,
              LAST_NAME: true,
              MIDDLE_NAME: true,
              HOSPITAL_NO: true,
            },
          },
        },
        orderBy: { CREATED_DATE: 'desc' },
        take: 200,
      });
      for (const r of rows) {
        bills.push({
          type: 'walk_in',
          id: r.SALE_ID,
          refNo: r.SALE_NO,
          personId: r.PERSON_ID,
          patientName: personName(r.person),
          hospitalNo: r.person.HOSPITAL_NO,
          total: Number(r.TOTAL),
          paymentStatus: r.PAYMENT_STATUS,
          paymentChannel: r.PAYMENT_CHANNEL,
          status: r.STATUS,
          createdAt: r.CREATED_DATE?.toISOString() ?? null,
          paidAt: r.PAID_AT?.toISOString() ?? null,
        });
      }
    }

    bills.sort((a, b) => {
      const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return tb - ta;
    });

    const total = bills.length;
    const items = bills.slice((page - 1) * limit, page * limit);
    return { items, meta: { page, limit, total } };
  }

  async confirmBill(
    type: string,
    id: number,
    dto: ConfirmPrescriptionPaymentDto | ConfirmWalkInPaymentDto,
    actor?: AuthUser,
  ) {
    if (type === 'prescription' || type === 'rx') {
      return {
        type: 'prescription' as const,
        bill: await this.prescriptions.confirmPayment(
          id,
          dto as ConfirmPrescriptionPaymentDto,
          actor,
        ),
      };
    }
    if (type === 'walk_in' || type === 'walk-in' || type === 'sale') {
      return {
        type: 'walk_in' as const,
        bill: await this.walkInSales.confirmPayment(
          id,
          dto as ConfirmWalkInPaymentDto,
          actor,
        ),
      };
    }
    throw new BadRequestException(`Unknown bill type: ${type}`);
  }
}

function bumpChannel(
  map: Record<string, number>,
  channel: string | null,
  amount: number,
) {
  const key =
    channel === 'Cash' ||
    channel === 'POS Card' ||
    channel === 'Bank Transfer' ||
    channel === 'Wallet'
      ? channel
      : channel === 'POS'
        ? 'POS Card'
        : channel === 'Transfer'
          ? 'Bank Transfer'
          : 'Other';
  map[key] = (map[key] ?? 0) + amount;
}

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}
