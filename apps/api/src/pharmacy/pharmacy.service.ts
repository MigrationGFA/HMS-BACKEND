import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DrugsService } from './drugs.service';
import { ProcurementService } from './procurement.service';
import { PharmacyBillingService } from './pharmacy-billing.service';
import { PharmacyReturnsService } from './pharmacy-returns.service';
import { PharmacySettingsService } from './pharmacy-settings.service';

const PHARMACY_AUDIT_PREFIXES = [
  'pharmacy:',
  'drug:',
  'stock:',
  'procurement:',
  'supplier:',
  'prescription:pay',
  'prescription:send',
  'prescription:update',
] as const;

const REPORT_TYPES = [
  'daily-prescriptions',
  'monthly-prescriptions',
  'drug-utilization',
  'controlled-drugs',
  'revenue',
  'inventory',
  'expiry',
  'returns',
] as const;

export type PharmacyReportType = (typeof REPORT_TYPES)[number];

type AdmissionRow = {
  admissionId: number;
  personId: number | null;
  wardId: number | null;
  bedNo: string | null;
  status: string | null;
  admissionDate: Date | null;
  wardName: string | null;
  firstName: string | null;
  lastName: string | null;
  middleName: string | null;
  hospitalNo: string | null;
};

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

function dayKey(d: Date, offsetMin: number): string {
  const local = new Date(d.getTime() + offsetMin * 60_000);
  return local.toISOString().slice(0, 10);
}

function weekdayLabel(d: Date, offsetMin: number): string {
  const local = new Date(d.getTime() + offsetMin * 60_000);
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][local.getUTCDay()];
}

function monthLabel(d: Date): string {
  return ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][
    d.getMonth()
  ];
}

function personName(p: {
  FIRST_NAME?: string | null;
  LAST_NAME?: string | null;
  MIDDLE_NAME?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  middleName?: string | null;
}): string {
  return (
    [
      p.FIRST_NAME ?? p.firstName,
      p.MIDDLE_NAME ?? p.middleName,
      p.LAST_NAME ?? p.lastName,
    ]
      .filter(Boolean)
      .join(' ') || 'Unknown'
  );
}

function pharmacyAuditWhere(): Prisma.AuditsWhereInput {
  return {
    OR: PHARMACY_AUDIT_PREFIXES.map((prefix) => ({
      AUDIT_TYPE: { startsWith: prefix, mode: 'insensitive' as const },
    })),
  };
}

@Injectable()
export class PharmacyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly drugs: DrugsService,
    private readonly procurement: ProcurementService,
    private readonly billing: PharmacyBillingService,
    private readonly returns: PharmacyReturnsService,
    private readonly settings: PharmacySettingsService,
  ) {}

  // ---------------------------------------------------------------------------
  // Dashboard
  // ---------------------------------------------------------------------------

  async dashboard(params?: { timezoneOffsetMinutes?: number }) {
    const offsetMin = params?.timezoneOffsetMinutes ?? 60;
    const now = new Date();
    const localMs = now.getTime() + offsetMin * 60_000;
    const local = new Date(localMs);
    const startLocal = new Date(
      Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()),
    );
    const todayStart = new Date(startLocal.getTime() - offsetMin * 60_000);
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
    const weekStart = daysAgo(6);
    weekStart.setHours(0, 0, 0, 0);
    const sixMonthsAgo = new Date(now);
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
    sixMonthsAgo.setDate(1);
    sixMonthsAgo.setHours(0, 0, 0, 0);
    const thirtyDaysAgo = startOfDay(daysAgo(30));

    const [
      inventory,
      procurementStats,
      billingSummary,
      returnsSummary,
      settingsRow,
      prescriptionsToday,
      pendingRx,
      dispensedToday,
      emergencyToday,
      inpatientOpen,
      auditAlerts,
    ] = await Promise.all([
      this.drugs.inventoryStats(),
      this.procurement.stats(),
      this.billing.summary({
        from: todayStart.toISOString(),
        to: todayEnd.toISOString(),
      }),
      this.returns.summary(),
      this.settings.getOrCreate(),
      this.prisma.prescriptions.count({
        where: {
          STATUS: { notIn: ['Draft', 'Cancelled'] },
          OR: [
            { SENT_AT: { gte: todayStart, lt: todayEnd } },
            { CREATED_DATE: { gte: todayStart, lt: todayEnd } },
          ],
        },
      }),
      this.prisma.prescriptions.count({
        where: {
          STATUS: { in: ['Sent', 'Partially Dispensed'] },
        },
      }),
      this.prisma.prescriptions.count({
        where: {
          STATUS: { in: ['Dispensed', 'Partially Dispensed'] },
          UPDATED_DATE: { gte: todayStart, lt: todayEnd },
        },
      }),
      this.prisma.prescriptions.count({
        where: {
          PAYMENT_STATUS: 'Emergency',
          EMERGENCY_DISPENSED_AT: { gte: todayStart, lt: todayEnd },
        },
      }),
      this.countActiveAdmissions(),
      this.prisma.audits.count({
        where: {
          AND: [
            pharmacyAuditWhere(),
            { CREATE_DATE: { gte: todayStart, lt: todayEnd } },
            {
              OR: [
                { STATUS: { equals: 'Flagged' } },
                { STATUS: { equals: 'Suspicious' } },
                { STATUS: { contains: 'fail', mode: 'insensitive' } },
                {
                  AUDIT_TYPE: {
                    contains: 'emergency',
                    mode: 'insensitive',
                  },
                },
              ],
            },
          ],
        },
      }),
    ]);

    const [
      controlledDrugs,
      weekRx,
      paidRxWeek,
      paidSalesWeek,
      dispensedItems30d,
      saleItems30d,
      activeDrugs,
      paidRxMonthly,
      paidSalesMonthly,
    ] = await Promise.all([
      this.prisma.drugs.findMany({
        where: { STATUS: 'Active', CONTROLLED_FLAG: 'Y' },
        include: { batches: true },
      }),
      this.prisma.prescriptions.findMany({
        where: {
          OR: [
            { SENT_AT: { gte: weekStart } },
            { CREATED_DATE: { gte: weekStart } },
          ],
          STATUS: { notIn: ['Draft', 'Cancelled'] },
        },
        select: { SENT_AT: true, CREATED_DATE: true },
      }),
      this.prisma.prescriptions.findMany({
        where: {
          PAYMENT_STATUS: 'Paid',
          PAID_AT: { gte: weekStart },
        },
        include: { items: true },
      }),
      this.prisma.pharmacySales.findMany({
        where: {
          PAYMENT_STATUS: 'Paid',
          PAID_AT: { gte: weekStart },
        },
      }),
      this.prisma.prescriptionItems.findMany({
        where: {
          QTY_DISPENSED: { gt: 0 },
          prescription: {
            STATUS: { in: ['Dispensed', 'Partially Dispensed'] },
            UPDATED_DATE: { gte: thirtyDaysAgo },
          },
        },
        select: { DRUG_ID: true, DRUG_NAME: true, QTY_DISPENSED: true },
      }),
      this.prisma.pharmacySaleItems.findMany({
        where: {
          QTY_DISPENSED: { gt: 0 },
          sale: {
            STATUS: { not: 'Cancelled' },
            DISPENSED_AT: { gte: thirtyDaysAgo },
          },
        },
        select: { DRUG_ID: true, DRUG_NAME: true, QTY_DISPENSED: true },
      }),
      this.prisma.drugs.findMany({
        where: { STATUS: 'Active' },
        include: { batches: true },
      }),
      this.prisma.prescriptions.findMany({
        where: {
          PAYMENT_STATUS: 'Paid',
          PAID_AT: { gte: sixMonthsAgo },
        },
        include: { items: true },
      }),
      this.prisma.pharmacySales.findMany({
        where: {
          PAYMENT_STATUS: 'Paid',
          PAID_AT: { gte: sixMonthsAgo },
        },
      }),
    ]);

    const controlledBalance = controlledDrugs.reduce(
      (sum, d) =>
        sum +
        d.batches
          .filter((b) => b.STATUS === 'Available')
          .reduce((s, b) => s + b.QTY_AVAILABLE, 0),
      0,
    );

    const rxTrend = this.buildDaySeries(7, offsetMin, (key) => {
      return weekRx.filter((r) => {
        const at = r.SENT_AT ?? r.CREATED_DATE;
        return at ? dayKey(at, offsetMin) === key : false;
      }).length;
    });

    const salesByDay = new Map<string, number>();
    for (const rx of paidRxWeek) {
      if (!rx.PAID_AT) continue;
      const key = dayKey(rx.PAID_AT, offsetMin);
      const total = rx.items.reduce(
        (s, i) => s + i.QUANTITY * Number(i.UNIT_PRICE),
        0,
      );
      salesByDay.set(key, (salesByDay.get(key) ?? 0) + total);
    }
    for (const sale of paidSalesWeek) {
      if (!sale.PAID_AT) continue;
      const key = dayKey(sale.PAID_AT, offsetMin);
      salesByDay.set(
        key,
        (salesByDay.get(key) ?? 0) + Number(sale.TOTAL),
      );
    }
    const salesTrend = this.buildDaySeries(7, offsetMin, (key) =>
      Math.round(salesByDay.get(key) ?? 0),
    );

    const qtyByDrug = new Map<string, { name: string; qty: number }>();
    for (const item of [...dispensedItems30d, ...saleItems30d]) {
      const key = String(item.DRUG_ID);
      const prev = qtyByDrug.get(key) ?? { name: item.DRUG_NAME, qty: 0 };
      prev.qty += item.QTY_DISPENSED;
      qtyByDrug.set(key, prev);
    }
    const ranked = [...qtyByDrug.values()].sort((a, b) => b.qty - a.qty);
    const fastMoving = ranked.slice(0, 5);
    const slowMoving = [...ranked].sort((a, b) => a.qty - b.qty).slice(0, 5);

    const stockValue = this.stockValueByCategory(activeDrugs);

    const monthlyMap = new Map<string, number>();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      monthlyMap.set(`${d.getFullYear()}-${d.getMonth()}`, 0);
    }
    for (const rx of paidRxMonthly) {
      if (!rx.PAID_AT) continue;
      const key = `${rx.PAID_AT.getFullYear()}-${rx.PAID_AT.getMonth()}`;
      if (!monthlyMap.has(key)) continue;
      const total = rx.items.reduce(
        (s, i) => s + i.QUANTITY * Number(i.UNIT_PRICE),
        0,
      );
      monthlyMap.set(key, (monthlyMap.get(key) ?? 0) + total);
    }
    for (const sale of paidSalesMonthly) {
      if (!sale.PAID_AT) continue;
      const key = `${sale.PAID_AT.getFullYear()}-${sale.PAID_AT.getMonth()}`;
      if (!monthlyMap.has(key)) continue;
      monthlyMap.set(key, (monthlyMap.get(key) ?? 0) + Number(sale.TOTAL));
    }
    const monthlyRevenue = [...monthlyMap.entries()].map(([key, v]) => {
      const [y, m] = key.split('-').map(Number);
      return {
        m: monthLabel(new Date(y, m, 1)),
        v: Number((v / 1_000_000).toFixed(2)),
        amount: Math.round(v),
      };
    });

    const expiryRisk = this.expiryRiskDistribution(
      activeDrugs,
      settingsRow.expiryCriticalDays,
      settingsRow.expiryWarningDays,
      settingsRow.expiringSoonDays,
    );

    const alerts: Array<{
      tone: string;
      title: string;
      count: number;
      to: string;
    }> = [];
    if (inventory.outOfStock > 0) {
      alerts.push({
        tone: 'rose',
        title: 'Out of stock',
        count: inventory.outOfStock,
        to: '/pharmacy/inventory?filter=oos',
      });
    }
    if (inventory.expired > 0) {
      alerts.push({
        tone: 'rose',
        title: 'Expired drugs',
        count: inventory.expired,
        to: '/dashboard/pharmacy/expiry',
      });
    }
    if (inventory.expiringSoon > 0) {
      alerts.push({
        tone: 'amber',
        title: 'Expiring soon',
        count: inventory.expiringSoon,
        to: '/dashboard/pharmacy/expiry',
      });
    }
    if (inventory.lowStock > 0) {
      alerts.push({
        tone: 'amber',
        title: 'Low stock',
        count: inventory.lowStock,
        to: '/pharmacy/inventory?filter=low',
      });
    }
    if (procurementStats.posAwaitingApproval > 0) {
      alerts.push({
        tone: 'blue',
        title: 'POs awaiting approval',
        count: procurementStats.posAwaitingApproval,
        to: '/pharmacy/procurement',
      });
    }
    if (returnsSummary.todayCount > 0) {
      alerts.push({
        tone: 'amber',
        title: 'Returns today',
        count: returnsSummary.todayCount,
        to: '/pharmacy/returns',
      });
    }
    if (emergencyToday > 0) {
      alerts.push({
        tone: 'rose',
        title: 'Emergency dispenses today',
        count: emergencyToday,
        to: '/pharmacy/audit',
      });
    }

    return {
      asOf: now.toISOString(),
      timezoneOffsetMinutes: offsetMin,
      kpis: {
        prescriptionsToday,
        pendingPrescriptions: pendingRx,
        dispensedToday,
        revenueToday: billingSummary.revenueTotal,
        lowStock: inventory.lowStock,
        outOfStock: inventory.outOfStock,
        expiringSoon: inventory.expiringSoon,
        expired: inventory.expired,
        pendingPurchaseOrders: procurementStats.posAwaitingApproval,
        inpatientWardRequests: inpatientOpen,
        drugReturns: returnsSummary.todayCount,
        emergencyDispenses: emergencyToday,
        auditAlerts,
        controlledDrugBalance: controlledBalance,
      },
      charts: {
        rxTrend: rxTrend.map(({ d, value }) => ({ d, rx: value })),
        salesTrend: salesTrend.map(({ d, value }) => ({ d, v: value })),
        fastMoving,
        slowMoving,
        stockValue,
        monthlyRevenue,
        expiryRisk,
      },
      alerts,
      inventory,
      procurement: procurementStats,
      billingToday: billingSummary,
      returns: returnsSummary,
    };
  }

  // ---------------------------------------------------------------------------
  // Inpatient pharmacy queue
  // ---------------------------------------------------------------------------

  async inpatient(params?: {
    q?: string;
    wardId?: number;
    status?: string;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(params?.page ?? 1, 1);
    const limit = Math.min(Math.max(params?.limit ?? 50, 1), 100);
    const q = params?.q?.trim()?.toLowerCase();
    const statusFilter =
      params?.status && params.status !== 'all' ? params.status : undefined;

    const admissions = await this.listActiveAdmissions(params?.wardId);
    const personIds = [
      ...new Set(
        admissions
          .map((a) => a.personId)
          .filter((id): id is number => id != null),
      ),
    ];

    const prescriptions =
      personIds.length === 0
        ? []
        : await this.prisma.prescriptions.findMany({
            where: {
              PERSON_ID: { in: personIds },
              STATUS: { notIn: ['Draft', 'Cancelled', 'Rejected'] },
            },
            include: {
              items: true,
              person: true,
            },
            orderBy: [{ SENT_AT: 'desc' }, { CREATED_DATE: 'desc' }],
          });

    const byPerson = new Map<number, typeof prescriptions>();
    for (const rx of prescriptions) {
      const list = byPerson.get(rx.PERSON_ID) ?? [];
      list.push(rx);
      byPerson.set(rx.PERSON_ID, list);
    }

    type Row = {
      admissionId: number;
      personId: number | null;
      patientName: string;
      hospitalNo: string | null;
      wardId: number | null;
      wardName: string | null;
      bedNo: string | null;
      admissionStatus: string | null;
      admissionDate: string | null;
      prescriptionId: number | null;
      rxNo: string | null;
      rxStatus: string | null;
      paymentStatus: string | null;
      urgency: string | null;
      drugSummary: string;
      itemCount: number;
      pendingItems: number;
      prescribedBy: string | null;
      sentAt: string | null;
      queueStatus: 'Awaiting Pharmacy' | 'Awaiting Payment' | 'Dispensed' | 'No Prescription';
    };

    const rows: Row[] = [];
    for (const adm of admissions) {
      const rxList = adm.personId ? byPerson.get(adm.personId) ?? [] : [];
      const openRx = rxList.filter((r) =>
        ['Sent', 'Partially Dispensed'].includes(r.STATUS),
      );
      const latest =
        openRx[0] ??
        rxList.find((r) => r.STATUS === 'Dispensed') ??
        rxList[0] ??
        null;

      let queueStatus: Row['queueStatus'] = 'No Prescription';
      if (latest) {
        if (['Sent', 'Partially Dispensed'].includes(latest.STATUS)) {
          queueStatus =
            latest.PAYMENT_STATUS === 'Unpaid'
              ? 'Awaiting Payment'
              : 'Awaiting Pharmacy';
        } else if (latest.STATUS === 'Dispensed') {
          queueStatus = 'Dispensed';
        }
      }

      rows.push({
        admissionId: adm.admissionId,
        personId: adm.personId,
        patientName: personName(adm),
        hospitalNo: adm.hospitalNo,
        wardId: adm.wardId,
        wardName: adm.wardName,
        bedNo: adm.bedNo,
        admissionStatus: adm.status,
        admissionDate: adm.admissionDate?.toISOString() ?? null,
        prescriptionId: latest?.PRESCRIPTION_ID ?? null,
        rxNo: latest?.RX_NO ?? null,
        rxStatus: latest?.STATUS ?? null,
        paymentStatus: latest?.PAYMENT_STATUS ?? null,
        urgency: latest?.URGENCY ?? null,
        drugSummary: latest
          ? latest.items.map((i) => i.DRUG_NAME).join(', ')
          : '',
        itemCount: latest?.items.length ?? 0,
        pendingItems: latest
          ? latest.items.filter((i) => i.QTY_DISPENSED < i.QUANTITY).length
          : 0,
        prescribedBy: latest?.PRESCRIBED_BY ?? null,
        sentAt: latest?.SENT_AT?.toISOString() ?? null,
        queueStatus,
      });
    }

    let filtered = rows;
    if (q) {
      filtered = filtered.filter(
        (r) =>
          r.patientName.toLowerCase().includes(q) ||
          (r.hospitalNo?.toLowerCase().includes(q) ?? false) ||
          (r.rxNo?.toLowerCase().includes(q) ?? false) ||
          (r.wardName?.toLowerCase().includes(q) ?? false) ||
          (r.bedNo?.toLowerCase().includes(q) ?? false) ||
          r.drugSummary.toLowerCase().includes(q),
      );
    }
    if (statusFilter) {
      filtered = filtered.filter((r) => {
        if (statusFilter === 'awaiting') {
          return (
            r.queueStatus === 'Awaiting Pharmacy' ||
            r.queueStatus === 'Awaiting Payment'
          );
        }
        if (statusFilter === 'awaiting-pharmacy') {
          return r.queueStatus === 'Awaiting Pharmacy';
        }
        if (statusFilter === 'awaiting-payment') {
          return r.queueStatus === 'Awaiting Payment';
        }
        if (statusFilter === 'dispensed') {
          return r.queueStatus === 'Dispensed';
        }
        if (statusFilter === 'no-rx') {
          return r.queueStatus === 'No Prescription';
        }
        return true;
      });
    }

    const total = filtered.length;
    const items = filtered.slice((page - 1) * limit, page * limit);

    const wards = await this.listWards();

    return {
      asOf: new Date().toISOString(),
      summary: {
        admitted: admissions.length,
        awaitingPharmacy: rows.filter((r) => r.queueStatus === 'Awaiting Pharmacy')
          .length,
        awaitingPayment: rows.filter((r) => r.queueStatus === 'Awaiting Payment')
          .length,
        dispensed: rows.filter((r) => r.queueStatus === 'Dispensed').length,
        noPrescription: rows.filter((r) => r.queueStatus === 'No Prescription')
          .length,
      },
      wards,
      items,
      meta: { page, limit, total },
    };
  }

  // ---------------------------------------------------------------------------
  // Reports
  // ---------------------------------------------------------------------------

  reportCatalog() {
    return {
      items: [
        {
          type: 'daily-prescriptions',
          label: 'Daily Prescriptions',
          description: 'Prescriptions sent/dispensed for a date range',
        },
        {
          type: 'monthly-prescriptions',
          label: 'Monthly Prescriptions',
          description: 'Monthly prescription volume and status breakdown',
        },
        {
          type: 'drug-utilization',
          label: 'Drug Utilization',
          description: 'Quantities dispensed by drug',
        },
        {
          type: 'controlled-drugs',
          label: 'Controlled Drugs',
          description: 'Controlled substance stock and recent dispenses',
        },
        {
          type: 'revenue',
          label: 'Revenue Report',
          description: 'Paid Rx + walk-in revenue by channel',
        },
        {
          type: 'inventory',
          label: 'Inventory Report',
          description: 'Catalog stock levels and reorder status',
        },
        {
          type: 'expiry',
          label: 'Expiry Report',
          description: 'Batches by expiry risk window',
        },
        {
          type: 'returns',
          label: 'Returns Report',
          description: 'Drug returns in the selected period',
        },
      ],
    };
  }

  async generateReport(
    type: string,
    params?: { from?: string; to?: string; page?: number; limit?: number },
  ) {
    if (!REPORT_TYPES.includes(type as PharmacyReportType)) {
      throw new BadRequestException(
        `Unknown report type. Supported: ${REPORT_TYPES.join(', ')}`,
      );
    }
    const page = Math.max(params?.page ?? 1, 1);
    const limit = Math.min(Math.max(params?.limit ?? 100, 1), 500);
    const from = params?.from ? new Date(params.from) : startOfDay(daysAgo(30));
    const to = params?.to ? new Date(params.to) : endOfDay(new Date());

    switch (type as PharmacyReportType) {
      case 'daily-prescriptions':
      case 'monthly-prescriptions':
        return this.prescriptionReport(type, from, to, page, limit);
      case 'drug-utilization':
        return this.utilizationReport(from, to, page, limit);
      case 'controlled-drugs':
        return this.controlledReport(from, to, page, limit);
      case 'revenue':
        return this.revenueReport(from, to, page, limit);
      case 'inventory':
        return this.inventoryReport(page, limit);
      case 'expiry':
        return this.expiryReport(page, limit);
      case 'returns':
        return this.returnsReport(from, to, page, limit);
      default:
        throw new BadRequestException('Unknown report type');
    }
  }

  // ---------------------------------------------------------------------------
  // Audit
  // ---------------------------------------------------------------------------

  async auditTrail(params?: {
    q?: string;
    category?: string;
    status?: string;
    from?: string;
    to?: string;
    page?: number;
    limit?: number;
    timezoneOffsetMinutes?: number;
  }) {
    const page = Math.max(params?.page ?? 1, 1);
    const limit = Math.min(Math.max(params?.limit ?? 50, 1), 200);
    const term = params?.q?.trim();
    const category =
      params?.category && params.category !== 'all'
        ? params.category
        : undefined;
    const status =
      params?.status && params.status !== 'all' ? params.status : undefined;
    const from = params?.from ? new Date(params.from) : undefined;
    const to = params?.to ? new Date(params.to) : undefined;

    const categoryWhere = this.categoryToAuditWhere(category);

    const where: Prisma.AuditsWhereInput = {
      AND: [
        pharmacyAuditWhere(),
        ...(categoryWhere ? [categoryWhere] : []),
        ...(status ? [{ STATUS: status }] : []),
        ...(from || to
          ? [
              {
                CREATE_DATE: {
                  ...(from ? { gte: from } : {}),
                  ...(to ? { lte: to } : {}),
                },
              },
            ]
          : []),
        ...(term
          ? [
              {
                OR: [
                  { CREATED_BY: { contains: term, mode: 'insensitive' as const } },
                  { ITEM: { contains: term, mode: 'insensitive' as const } },
                  {
                    AUDIT_TYPE: { contains: term, mode: 'insensitive' as const },
                  },
                  { ENTITY: { contains: term, mode: 'insensitive' as const } },
                  { ENTITY_ID: { contains: term } },
                  {
                    NEW_VALUE: { contains: term, mode: 'insensitive' as const },
                  },
                ],
              },
            ]
          : []),
      ],
    };

    const [rows, total, stats] = await Promise.all([
      this.prisma.audits.findMany({
        where,
        include: {
          user: { include: { role: true } },
        },
        orderBy: { CREATE_DATE: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.audits.count({ where }),
      this.auditStats({
        timezoneOffsetMinutes: params?.timezoneOffsetMinutes,
      }),
    ]);

    const personIds = [
      ...new Set(
        rows
          .map((r) => r.PERSON_ID)
          .filter((id): id is number => id != null),
      ),
    ];
    const persons =
      personIds.length === 0
        ? []
        : await this.prisma.persons.findMany({
            where: { PERSON_ID: { in: personIds } },
            select: {
              PERSON_ID: true,
              HOSPITAL_NO: true,
              FIRST_NAME: true,
              LAST_NAME: true,
              MIDDLE_NAME: true,
            },
          });
    const personMap = new Map(persons.map((p) => [p.PERSON_ID, p]));

    return {
      items: rows.map((r) => {
        const person = r.PERSON_ID != null ? personMap.get(r.PERSON_ID) : null;
        return {
          auditId: r.AUDIT_ID,
          time: r.CREATE_DATE?.toISOString() ?? null,
          officer: r.CREATED_BY ?? 'SYSTEM',
          role: r.user?.role?.ROLE_NAME ?? '—',
          action: r.AUDIT_TYPE ?? r.ITEM ?? 'audit',
          item: r.ITEM,
          type: r.AUDIT_TYPE,
          entity: r.ENTITY,
          entityId: r.ENTITY_ID,
          hospitalId: person?.HOSPITAL_NO ?? '—',
          patient: person ? personName(person) : '—',
          personId: r.PERSON_ID,
          module: this.moduleFromType(r.AUDIT_TYPE),
          status: r.STATUS ?? 'Success',
          newValue: r.NEW_VALUE,
          oldValue: r.OLD_VALUE,
          category: this.categoryFromType(r.AUDIT_TYPE),
        };
      }),
      meta: { page, limit, total },
      stats,
    };
  }

  async auditStats(params?: { timezoneOffsetMinutes?: number }) {
    const offsetMin = params?.timezoneOffsetMinutes ?? 60;
    const now = new Date();
    const localMs = now.getTime() + offsetMin * 60_000;
    const local = new Date(localMs);
    const startLocal = new Date(
      Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()),
    );
    const startOfToday = new Date(startLocal.getTime() - offsetMin * 60_000);
    const endOfToday = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);
    const today = { CREATE_DATE: { gte: startOfToday, lt: endOfToday } };
    const base = pharmacyAuditWhere();

    const [totalToday, dispenses, emergencies, stockEvents, returns, overrides] =
      await Promise.all([
        this.prisma.audits.count({ where: { AND: [base, today] } }),
        this.prisma.audits.count({
          where: {
            AND: [
              base,
              today,
              {
                OR: [
                  { AUDIT_TYPE: { contains: 'dispense', mode: 'insensitive' } },
                ],
              },
            ],
          },
        }),
        this.prisma.audits.count({
          where: {
            AND: [
              base,
              {
                AUDIT_TYPE: {
                  contains: 'emergency',
                  mode: 'insensitive',
                },
              },
            ],
          },
        }),
        this.prisma.audits.count({
          where: {
            AND: [
              base,
              today,
              {
                OR: [
                  { AUDIT_TYPE: { startsWith: 'stock:', mode: 'insensitive' } },
                  { AUDIT_TYPE: { contains: 'stock', mode: 'insensitive' } },
                ],
              },
            ],
          },
        }),
        this.prisma.audits.count({
          where: {
            AND: [
              base,
              today,
              { AUDIT_TYPE: { contains: 'return', mode: 'insensitive' } },
            ],
          },
        }),
        this.prisma.audits.count({
          where: {
            AND: [
              base,
              {
                OR: [
                  {
                    AUDIT_TYPE: {
                      contains: 'emergency',
                      mode: 'insensitive',
                    },
                  },
                  { STATUS: { equals: 'Flagged' } },
                  { STATUS: { equals: 'Suspicious' } },
                ],
              },
            ],
          },
        }),
      ]);

    return {
      asOf: now.toISOString(),
      totalToday,
      dispenses,
      emergencies,
      stockEvents,
      returns,
      overrides,
    };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private buildDaySeries(
    days: number,
    offsetMin: number,
    valueFn: (key: string) => number,
  ) {
    const out: Array<{ d: string; value: number; key: string }> = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = daysAgo(i);
      const key = dayKey(d, offsetMin);
      out.push({ d: weekdayLabel(d, offsetMin), key, value: valueFn(key) });
    }
    return out;
  }

  private stockValueByCategory(
    drugs: Array<{
      CATEGORY: string | null;
      UNIT_PRICE: Prisma.Decimal | number;
      batches: Array<{ QTY_AVAILABLE: number; STATUS: string }>;
    }>,
  ) {
    const map = new Map<string, number>();
    for (const d of drugs) {
      const cat = d.CATEGORY?.trim() || 'Uncategorized';
      const stock = d.batches
        .filter((b) => b.STATUS === 'Available')
        .reduce((s, b) => s + b.QTY_AVAILABLE, 0);
      const value = stock * Number(d.UNIT_PRICE);
      map.set(cat, (map.get(cat) ?? 0) + value);
    }
    return [...map.entries()]
      .map(([name, v]) => ({ name, v: Math.round(v) }))
      .sort((a, b) => b.v - a.v)
      .slice(0, 10);
  }

  private expiryRiskDistribution(
    drugs: Array<{
      batches: Array<{
        EXPIRY_DATE: Date | null;
        QTY_AVAILABLE: number;
        STATUS: string;
      }>;
    }>,
    criticalDays: number,
    warningDays: number,
    soonDays: number,
  ) {
    const now = Date.now();
    const buckets = [
      { name: `< ${criticalDays} days`, value: 0, color: '#ef4444', maxDays: criticalDays },
      {
        name: `${criticalDays}–${warningDays} days`,
        value: 0,
        color: '#f59e0b',
        maxDays: warningDays,
      },
      {
        name: `${warningDays}–${soonDays} days`,
        value: 0,
        color: '#facc15',
        maxDays: soonDays,
      },
      { name: `> ${soonDays} days`, value: 0, color: '#22c55e', maxDays: Infinity },
    ];

    for (const d of drugs) {
      for (const b of d.batches) {
        if (b.STATUS !== 'Available' || b.QTY_AVAILABLE <= 0 || !b.EXPIRY_DATE) {
          continue;
        }
        const daysLeft =
          (b.EXPIRY_DATE.getTime() - now) / (24 * 60 * 60 * 1000);
        if (daysLeft < 0) continue;
        if (daysLeft < criticalDays) buckets[0].value += 1;
        else if (daysLeft < warningDays) buckets[1].value += 1;
        else if (daysLeft < soonDays) buckets[2].value += 1;
        else buckets[3].value += 1;
      }
    }

    return buckets.map(({ name, value, color }) => ({ name, value, color }));
  }

  private async countActiveAdmissions(): Promise<number> {
    try {
      const rows = await this.prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*)::bigint AS count
        FROM "ADMISSION" a
        WHERE (a."IS_DISCHARGED" IS NULL OR UPPER(COALESCE(a."IS_DISCHARGED", '')) NOT IN ('Y', 'YES', 'TRUE', '1'))
          AND a."DISCHARGE_DATE" IS NULL
          AND (a."STATUS" IS NULL OR a."STATUS" NOT ILIKE '%discharge%')
          AND a."PERSON_ID" IS NOT NULL
      `;
      return Number(rows[0]?.count ?? 0);
    } catch {
      return 0;
    }
  }

  private async listActiveAdmissions(wardId?: number): Promise<AdmissionRow[]> {
    try {
      if (wardId != null) {
        return await this.prisma.$queryRaw<AdmissionRow[]>`
          SELECT
            a."ADMISSION_ID" AS "admissionId",
            a."PERSON_ID" AS "personId",
            a."WARD_ID" AS "wardId",
            a."BED_NO" AS "bedNo",
            a."STATUS" AS "status",
            a."ADMISSION_DATE" AS "admissionDate",
            w."WARD_NAME" AS "wardName",
            p."FIRST_NAME" AS "firstName",
            p."LAST_NAME" AS "lastName",
            p."MIDDLE_NAME" AS "middleName",
            p."HOSPITAL_NO" AS "hospitalNo"
          FROM "ADMISSION" a
          LEFT JOIN "WARDS" w ON w."WARD_ID" = a."WARD_ID"
          LEFT JOIN "PERSONS" p ON p."PERSON_ID" = a."PERSON_ID"
          WHERE (a."IS_DISCHARGED" IS NULL OR UPPER(COALESCE(a."IS_DISCHARGED", '')) NOT IN ('Y', 'YES', 'TRUE', '1'))
            AND a."DISCHARGE_DATE" IS NULL
            AND (a."STATUS" IS NULL OR a."STATUS" NOT ILIKE '%discharge%')
            AND a."PERSON_ID" IS NOT NULL
            AND a."WARD_ID" = ${wardId}
          ORDER BY a."ADMISSION_DATE" DESC NULLS LAST
          LIMIT 500
        `;
      }
      return await this.prisma.$queryRaw<AdmissionRow[]>`
        SELECT
          a."ADMISSION_ID" AS "admissionId",
          a."PERSON_ID" AS "personId",
          a."WARD_ID" AS "wardId",
          a."BED_NO" AS "bedNo",
          a."STATUS" AS "status",
          a."ADMISSION_DATE" AS "admissionDate",
          w."WARD_NAME" AS "wardName",
          p."FIRST_NAME" AS "firstName",
          p."LAST_NAME" AS "lastName",
          p."MIDDLE_NAME" AS "middleName",
          p."HOSPITAL_NO" AS "hospitalNo"
        FROM "ADMISSION" a
        LEFT JOIN "WARDS" w ON w."WARD_ID" = a."WARD_ID"
        LEFT JOIN "PERSONS" p ON p."PERSON_ID" = a."PERSON_ID"
        WHERE (a."IS_DISCHARGED" IS NULL OR UPPER(COALESCE(a."IS_DISCHARGED", '')) NOT IN ('Y', 'YES', 'TRUE', '1'))
          AND a."DISCHARGE_DATE" IS NULL
          AND (a."STATUS" IS NULL OR a."STATUS" NOT ILIKE '%discharge%')
          AND a."PERSON_ID" IS NOT NULL
        ORDER BY a."ADMISSION_DATE" DESC NULLS LAST
        LIMIT 500
      `;
    } catch {
      return [];
    }
  }

  private async listWards(): Promise<Array<{ wardId: number; wardName: string }>> {
    try {
      return await this.prisma.$queryRaw<
        Array<{ wardId: number; wardName: string }>
      >`
        SELECT "WARD_ID" AS "wardId", COALESCE("WARD_NAME", 'Ward ' || "WARD_ID") AS "wardName"
        FROM "WARDS"
        ORDER BY "WARD_NAME" ASC NULLS LAST
      `;
    } catch {
      return [];
    }
  }

  private categoryToAuditWhere(
    category?: string,
  ): Prisma.AuditsWhereInput | null {
    if (!category) return null;
    switch (category) {
      case 'dispense':
        return {
          OR: [
            { AUDIT_TYPE: { contains: 'dispense', mode: 'insensitive' } },
          ],
        };
      case 'payment':
        return {
          OR: [
            { AUDIT_TYPE: { contains: 'pay', mode: 'insensitive' } },
            { AUDIT_TYPE: { contains: 'sale-pay', mode: 'insensitive' } },
          ],
        };
      case 'stock':
        return {
          OR: [
            { AUDIT_TYPE: { startsWith: 'stock:', mode: 'insensitive' } },
            { AUDIT_TYPE: { startsWith: 'drug:', mode: 'insensitive' } },
          ],
        };
      case 'procurement':
        return {
          AUDIT_TYPE: { startsWith: 'procurement:', mode: 'insensitive' },
        };
      case 'return':
        return { AUDIT_TYPE: { contains: 'return', mode: 'insensitive' } };
      case 'emergency':
      case 'override':
        return {
          OR: [
            { AUDIT_TYPE: { contains: 'emergency', mode: 'insensitive' } },
            { STATUS: { in: ['Flagged', 'Suspicious'] } },
          ],
        };
      case 'settings':
        return {
          AUDIT_TYPE: { contains: 'settings', mode: 'insensitive' },
        };
      default:
        return {
          AUDIT_TYPE: { contains: category, mode: 'insensitive' },
        };
    }
  }

  private categoryFromType(type: string | null): string {
    if (!type) return 'other';
    const t = type.toLowerCase();
    if (t.includes('emergency')) return 'emergency';
    if (t.includes('dispense')) return 'dispense';
    if (t.includes('pay') || t.includes('sale-pay')) return 'payment';
    if (t.includes('return')) return 'return';
    if (t.startsWith('stock:') || t.startsWith('drug:')) return 'stock';
    if (t.startsWith('procurement:') || t.startsWith('supplier:')) {
      return 'procurement';
    }
    if (t.includes('settings')) return 'settings';
    return 'other';
  }

  private moduleFromType(type: string | null): string {
    const cat = this.categoryFromType(type);
    const map: Record<string, string> = {
      dispense: 'Dispensing',
      payment: 'Billing',
      stock: 'Inventory',
      procurement: 'Procurement',
      return: 'Returns',
      emergency: 'Emergency',
      settings: 'Settings',
      other: 'Pharmacy',
    };
    return map[cat] ?? 'Pharmacy';
  }

  private async prescriptionReport(
    type: string,
    from: Date,
    to: Date,
    page: number,
    limit: number,
  ) {
    const where: Prisma.PrescriptionsWhereInput = {
      STATUS: { notIn: ['Draft'] },
      OR: [
        { SENT_AT: { gte: from, lte: to } },
        { CREATED_DATE: { gte: from, lte: to } },
      ],
    };
    const [rows, total, dispensed, pending] = await Promise.all([
      this.prisma.prescriptions.findMany({
        where,
        include: { items: true, person: true },
        orderBy: [{ SENT_AT: 'desc' }, { CREATED_DATE: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.prescriptions.count({ where }),
      this.prisma.prescriptions.count({
        where: { ...where, STATUS: { in: ['Dispensed', 'Partially Dispensed'] } },
      }),
      this.prisma.prescriptions.count({
        where: { ...where, STATUS: { in: ['Sent', 'Partially Dispensed'] } },
      }),
    ]);

    return {
      type,
      from: from.toISOString(),
      to: to.toISOString(),
      summary: { total, dispensed, pending },
      columns: [
        'rxNo',
        'patient',
        'hospitalNo',
        'status',
        'paymentStatus',
        'itemCount',
        'prescribedBy',
        'sentAt',
      ],
      items: rows.map((r) => ({
        rxNo: r.RX_NO,
        patient: personName(r.person),
        hospitalNo: r.person.HOSPITAL_NO,
        status: r.STATUS,
        paymentStatus: r.PAYMENT_STATUS,
        itemCount: r.items.length,
        prescribedBy: r.PRESCRIBED_BY,
        sentAt: r.SENT_AT?.toISOString() ?? r.CREATED_DATE?.toISOString() ?? null,
      })),
      meta: { page, limit, total },
    };
  }

  private async utilizationReport(
    from: Date,
    to: Date,
    page: number,
    limit: number,
  ) {
    const [rxItems, saleItems] = await Promise.all([
      this.prisma.prescriptionItems.findMany({
        where: {
          QTY_DISPENSED: { gt: 0 },
          prescription: {
            STATUS: { in: ['Dispensed', 'Partially Dispensed'] },
            UPDATED_DATE: { gte: from, lte: to },
          },
        },
        select: {
          DRUG_ID: true,
          DRUG_NAME: true,
          QTY_DISPENSED: true,
          UNIT_PRICE: true,
        },
      }),
      this.prisma.pharmacySaleItems.findMany({
        where: {
          QTY_DISPENSED: { gt: 0 },
          sale: {
            STATUS: { not: 'Cancelled' },
            DISPENSED_AT: { gte: from, lte: to },
          },
        },
        select: {
          DRUG_ID: true,
          DRUG_NAME: true,
          QTY_DISPENSED: true,
          UNIT_PRICE: true,
        },
      }),
    ]);

    const map = new Map<
      number,
      { drugId: number; drugName: string; qty: number; value: number }
    >();
    for (const item of [...rxItems, ...saleItems]) {
      const prev = map.get(item.DRUG_ID) ?? {
        drugId: item.DRUG_ID,
        drugName: item.DRUG_NAME,
        qty: 0,
        value: 0,
      };
      prev.qty += item.QTY_DISPENSED;
      prev.value += item.QTY_DISPENSED * Number(item.UNIT_PRICE);
      map.set(item.DRUG_ID, prev);
    }
    const all = [...map.values()].sort((a, b) => b.qty - a.qty);
    const total = all.length;
    const items = all.slice((page - 1) * limit, page * limit).map((r) => ({
      ...r,
      value: Math.round(r.value),
    }));

    return {
      type: 'drug-utilization',
      from: from.toISOString(),
      to: to.toISOString(),
      summary: {
        drugs: total,
        totalQty: all.reduce((s, r) => s + r.qty, 0),
        totalValue: Math.round(all.reduce((s, r) => s + r.value, 0)),
      },
      columns: ['drugName', 'qty', 'value'],
      items,
      meta: { page, limit, total },
    };
  }

  private async controlledReport(
    from: Date,
    to: Date,
    page: number,
    limit: number,
  ) {
    const drugs = await this.prisma.drugs.findMany({
      where: { STATUS: 'Active', CONTROLLED_FLAG: 'Y' },
      include: { batches: true },
    });
    const drugIds = drugs.map((d) => d.DRUG_ID);
    const dispensed =
      drugIds.length === 0
        ? []
        : await this.prisma.prescriptionItems.findMany({
            where: {
              DRUG_ID: { in: drugIds },
              QTY_DISPENSED: { gt: 0 },
              prescription: {
                UPDATED_DATE: { gte: from, lte: to },
              },
            },
            select: { DRUG_ID: true, QTY_DISPENSED: true },
          });
    const qtyMap = new Map<number, number>();
    for (const i of dispensed) {
      qtyMap.set(i.DRUG_ID, (qtyMap.get(i.DRUG_ID) ?? 0) + i.QTY_DISPENSED);
    }

    const all = drugs.map((d) => ({
      drugId: d.DRUG_ID,
      drugName: d.NAME,
      strength: d.STRENGTH,
      stock: d.batches
        .filter((b) => b.STATUS === 'Available')
        .reduce((s, b) => s + b.QTY_AVAILABLE, 0),
      dispensedQty: qtyMap.get(d.DRUG_ID) ?? 0,
    }));
    const total = all.length;
    const items = all.slice((page - 1) * limit, page * limit);

    return {
      type: 'controlled-drugs',
      from: from.toISOString(),
      to: to.toISOString(),
      summary: {
        controlledDrugs: total,
        totalStock: all.reduce((s, r) => s + r.stock, 0),
        dispensedQty: all.reduce((s, r) => s + r.dispensedQty, 0),
      },
      columns: ['drugName', 'strength', 'stock', 'dispensedQty'],
      items,
      meta: { page, limit, total },
    };
  }

  private async revenueReport(
    from: Date,
    to: Date,
    page: number,
    limit: number,
  ) {
    const summary = await this.billing.summary({
      from: from.toISOString(),
      to: to.toISOString(),
    });
    const bills = await this.billing.listBills({
      paymentStatus: 'Paid',
      page,
      limit,
    });
    const paidInRange = bills.items.filter((b) => {
      if (!b.paidAt) return false;
      const t = new Date(b.paidAt).getTime();
      return t >= from.getTime() && t <= to.getTime();
    });

    return {
      type: 'revenue',
      from: from.toISOString(),
      to: to.toISOString(),
      summary: {
        revenueTotal: summary.revenueTotal,
        paidCount: summary.paidCount,
        channelTotals: summary.channelTotals,
      },
      columns: [
        'type',
        'refNo',
        'patientName',
        'total',
        'paymentChannel',
        'paidAt',
      ],
      items: paidInRange.map((b) => ({
        type: b.type,
        refNo: b.refNo,
        patientName: b.patientName,
        total: b.total,
        paymentChannel: b.paymentChannel,
        paidAt: b.paidAt,
      })),
      meta: { page, limit, total: paidInRange.length },
    };
  }

  private async inventoryReport(page: number, limit: number) {
    const list = await this.drugs.list({ page, limit, status: 'Active' });
    const stats = await this.drugs.inventoryStats();
    return {
      type: 'inventory',
      from: null,
      to: null,
      summary: stats,
      columns: [
        'name',
        'category',
        'stock',
        'reorderLevel',
        'stockStatus',
        'earliestExpiry',
        'unitPrice',
      ],
      items: list.items.map((d) => ({
        name: d.name,
        category: d.category,
        stock: d.stock,
        reorderLevel: d.reorderLevel,
        stockStatus: d.stockStatus,
        earliestExpiry: d.earliestExpiry,
        unitPrice: d.unitPrice,
      })),
      meta: list.meta,
    };
  }

  private async expiryReport(page: number, limit: number) {
    const settings = await this.settings.getOrCreate();
    const soonCutoff = Date.now() + settings.expiringSoonDays * 86400000;
    const batches = await this.prisma.drugBatches.findMany({
      where: {
        STATUS: { in: ['Available', 'Expired', 'Quarantined'] },
        QTY_AVAILABLE: { gt: 0 },
        EXPIRY_DATE: { not: null },
      },
      include: { drug: true },
      orderBy: { EXPIRY_DATE: 'asc' },
    });
    const now = Date.now();
    const all = batches
      .filter((b) => {
        const t = b.EXPIRY_DATE!.getTime();
        return t <= soonCutoff || t < now;
      })
      .map((b) => {
        const t = b.EXPIRY_DATE!.getTime();
        const daysLeft = Math.ceil((t - now) / 86400000);
        return {
          drugName: b.drug.NAME,
          batchNo: b.BATCH_NO,
          qtyAvailable: b.QTY_AVAILABLE,
          expiryDate: b.EXPIRY_DATE!.toISOString(),
          daysLeft,
          status: daysLeft < 0 ? 'Expired' : 'Expiring Soon',
        };
      });
    const total = all.length;
    return {
      type: 'expiry',
      from: null,
      to: null,
      summary: {
        total,
        expired: all.filter((r) => r.status === 'Expired').length,
        expiringSoon: all.filter((r) => r.status === 'Expiring Soon').length,
        expiringSoonDays: settings.expiringSoonDays,
      },
      columns: [
        'drugName',
        'batchNo',
        'qtyAvailable',
        'expiryDate',
        'daysLeft',
        'status',
      ],
      items: all.slice((page - 1) * limit, page * limit),
      meta: { page, limit, total },
    };
  }

  private async returnsReport(
    from: Date,
    to: Date,
    page: number,
    limit: number,
  ) {
    const where: Prisma.PharmacyReturnsWhereInput = {
      CREATED_DATE: { gte: from, lte: to },
    };
    const [rows, total] = await Promise.all([
      this.prisma.pharmacyReturns.findMany({
        where,
        include: { items: true, person: true },
        orderBy: { CREATED_DATE: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.pharmacyReturns.count({ where }),
    ]);
    const value = rows.reduce((s, r) => s + Number(r.TOTAL_VALUE), 0);
    return {
      type: 'returns',
      from: from.toISOString(),
      to: to.toISOString(),
      summary: {
        total,
        totalValue: Math.round(value),
        units: rows.reduce(
          (s, r) => s + r.items.reduce((a, i) => a + i.QUANTITY, 0),
          0,
        ),
      },
      columns: [
        'returnNo',
        'patient',
        'reason',
        'totalValue',
        'returnedBy',
        'createdAt',
      ],
      items: rows.map((r) => ({
        returnNo: r.RETURN_NO,
        patient: personName(r.person),
        reason: r.REASON,
        totalValue: Number(r.TOTAL_VALUE),
        returnedBy: r.RETURNED_BY_NAME,
        createdAt: r.CREATED_DATE?.toISOString() ?? null,
      })),
      meta: { page, limit, total },
    };
  }
}
