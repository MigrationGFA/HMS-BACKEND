import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../auth/types/auth-user.type';
import type { ConfirmAdmissionBillPaymentDto } from './dto/admission-bill.dto';

const PERSON_SELECT = {
  PERSON_ID: true,
  HOSPITAL_NO: true,
  FIRST_NAME: true,
  LAST_NAME: true,
  MIDDLE_NAME: true,
  SEX: true,
  DATE_OF_BIRTH: true,
  PATIENT_PHONE_NO: true,
} as const;

function actorLabelOf(actor?: AuthUser): string {
  return (
    actor?.email ||
    [actor?.firstName, actor?.lastName].filter(Boolean).join(' ') ||
    'SYSTEM'
  );
}

function money(v: Prisma.Decimal | number | null | undefined): number {
  if (v == null) return 0;
  return typeof v === 'number' ? v : Number(v);
}

type BillWithRels = Prisma.AdmissionBillsGetPayload<{
  include: {
    person: { select: typeof PERSON_SELECT };
    lines: true;
    admission: { select: { ADMISSION_ID: true; WARD_ID: true; BED_ID: true; STATUS: true } };
  };
}>;

@Injectable()
export class AdmissionBillsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  toResponse(row: BillWithRels) {
    const person = row.person;
    return {
      admissionBillId: row.ADMISSION_BILL_ID,
      billNo: row.BILL_NO,
      personId: row.PERSON_ID,
      admissionId: row.ADMISSION_ID,
      admissionRequestId: row.ADMISSION_REQUEST_ID,
      totalAmount: money(row.TOTAL_AMOUNT),
      paymentStatus: row.PAYMENT_STATUS,
      paymentChannel: row.PAYMENT_CHANNEL,
      paymentRef: row.PAYMENT_REF,
      paidAt: row.PAID_AT?.toISOString() ?? null,
      paidBy: row.PAID_BY,
      createdAt: row.CREATED_DATE?.toISOString() ?? null,
      updatedAt: row.UPDATED_DATE?.toISOString() ?? null,
      person: person
        ? {
            personId: person.PERSON_ID,
            hospitalNo: person.HOSPITAL_NO,
            firstName: person.FIRST_NAME,
            lastName: person.LAST_NAME,
            middleName: person.MIDDLE_NAME,
            sex: person.SEX,
            dateOfBirth: person.DATE_OF_BIRTH?.toISOString() ?? null,
            phone: person.PATIENT_PHONE_NO,
          }
        : null,
      admission: row.admission
        ? {
            admissionId: row.admission.ADMISSION_ID,
            wardId: row.admission.WARD_ID,
            bedId: row.admission.BED_ID,
            status: row.admission.STATUS,
          }
        : null,
      lines: row.lines.map((l) => ({
        lineId: l.LINE_ID,
        itemCode: l.ITEM_CODE,
        description: l.DESCRIPTION,
        qty: l.QTY,
        unitPrice: money(l.UNIT_PRICE),
        lineTotal: money(l.LINE_TOTAL),
      })),
    };
  }

  private include() {
    return {
      person: { select: PERSON_SELECT },
      lines: true,
      admission: {
        select: {
          ADMISSION_ID: true,
          WARD_ID: true,
          BED_ID: true,
          STATUS: true,
        },
      },
    } as const;
  }

  /**
   * Build snapshotted package lines + Day-1 bed + deposit from ward config.
   * Called inside admit transaction after admission row exists.
   */
  async createPackageBillInTx(
    tx: Prisma.TransactionClient,
    params: {
      personId: number;
      admissionId: number;
      admissionRequestId?: number | null;
      wardId: number;
      actorLabel: string;
      actorId?: number | null;
      now: Date;
    },
  ) {
    const ward = await tx.wards.findUnique({
      where: { WARD_ID: params.wardId },
    });
    if (!ward) throw new NotFoundException('Ward not found for billing');

    const catalogue = await tx.admissionBillingItems.findMany({
      where: { STATUS: 'Active' },
      orderBy: { ITEM_ID: 'asc' },
    });

    const lines: Array<{
      ITEM_CODE: string;
      DESCRIPTION: string;
      QTY: number;
      UNIT_PRICE: Prisma.Decimal;
      LINE_TOTAL: Prisma.Decimal;
    }> = [];

    for (const item of catalogue) {
      if (item.CATEGORY === 'Deposit') continue; // deposit from ward default below
      const price = item.UNIT_PRICE;
      lines.push({
        ITEM_CODE: item.ITEM_CODE,
        DESCRIPTION: item.NAME,
        QTY: 1,
        UNIT_PRICE: price,
        LINE_TOTAL: price,
      });
    }

    const dayRate = ward.DAILY_BED_RATE;
    if (money(dayRate) > 0) {
      lines.push({
        ITEM_CODE: 'BED-DAY1',
        DESCRIPTION: `Day-1 bed charge · ${ward.NAME}`,
        QTY: 1,
        UNIT_PRICE: dayRate,
        LINE_TOTAL: dayRate,
      });
    }

    const deposit = ward.ADMISSION_DEPOSIT_DEFAULT;
    if (money(deposit) > 0) {
      const depItem = catalogue.find((c) => c.CATEGORY === 'Deposit');
      lines.push({
        ITEM_CODE: depItem?.ITEM_CODE ?? 'ADM-DEP',
        DESCRIPTION: depItem?.NAME ?? 'Emergency Deposit',
        QTY: 1,
        UNIT_PRICE: deposit,
        LINE_TOTAL: deposit,
      });
    }

    const total = lines.reduce((s, l) => s + money(l.LINE_TOTAL), 0);
    const year = params.now.getFullYear();

    const created = await tx.admissionBills.create({
      data: {
        BILL_NO: `AB-${year}-PENDING`,
        PERSON_ID: params.personId,
        ADMISSION_ID: params.admissionId,
        ADMISSION_REQUEST_ID: params.admissionRequestId ?? null,
        TOTAL_AMOUNT: new Prisma.Decimal(total),
        PAYMENT_STATUS: 'Unpaid',
        CREATED_BY_ID: params.actorId ?? null,
        CREATED_BY: params.actorLabel,
        CREATED_DATE: params.now,
        UPDATED_BY_ID: params.actorId ?? null,
        UPDATED_BY: params.actorLabel,
        UPDATED_DATE: params.now,
        lines: {
          create: lines,
        },
      },
    });

    const pad = (n: number) => String(n).padStart(4, '0');
    return tx.admissionBills.update({
      where: { ADMISSION_BILL_ID: created.ADMISSION_BILL_ID },
      data: { BILL_NO: `AB-${year}-${pad(created.ADMISSION_BILL_ID)}` },
      include: this.include(),
    });
  }

  async list(params: {
    paymentStatus?: string;
    personId?: number;
    admissionId?: number;
    q?: string;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(100, Math.max(1, params.limit ?? 50));
    const where: Prisma.AdmissionBillsWhereInput = {};

    if (params.paymentStatus) {
      const statuses = params.paymentStatus
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      where.PAYMENT_STATUS =
        statuses.length === 1 ? statuses[0] : { in: statuses };
    }
    if (params.personId) where.PERSON_ID = params.personId;
    if (params.admissionId) where.ADMISSION_ID = params.admissionId;

    if (params.q?.trim()) {
      const q = params.q.trim();
      where.OR = [
        { BILL_NO: { contains: q, mode: 'insensitive' } },
        {
          person: {
            OR: [
              { HOSPITAL_NO: { contains: q, mode: 'insensitive' } },
              { FIRST_NAME: { contains: q, mode: 'insensitive' } },
              { LAST_NAME: { contains: q, mode: 'insensitive' } },
            ],
          },
        },
      ];
    }

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.admissionBills.count({ where }),
      this.prisma.admissionBills.findMany({
        where,
        include: this.include(),
        orderBy: { CREATED_DATE: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      items: rows.map((r) => this.toResponse(r)),
      meta: { page, limit, total },
    };
  }

  async findById(id: number) {
    const row = await this.prisma.admissionBills.findUnique({
      where: { ADMISSION_BILL_ID: id },
      include: this.include(),
    });
    if (!row) throw new NotFoundException('Admission bill not found');
    return this.toResponse(row);
  }

  async listBillingItems() {
    const items = await this.prisma.admissionBillingItems.findMany({
      where: { STATUS: 'Active' },
      orderBy: { ITEM_ID: 'asc' },
    });
    return {
      items: items.map((i) => ({
        itemId: i.ITEM_ID,
        itemCode: i.ITEM_CODE,
        name: i.NAME,
        category: i.CATEGORY,
        unitPrice: money(i.UNIT_PRICE),
        status: i.STATUS,
      })),
    };
  }

  async confirmPayment(
    id: number,
    dto: ConfirmAdmissionBillPaymentDto,
    actor?: AuthUser,
  ) {
    const existing = await this.prisma.admissionBills.findUnique({
      where: { ADMISSION_BILL_ID: id },
      include: this.include(),
    });
    if (!existing) throw new NotFoundException('Admission bill not found');
    if (existing.PAYMENT_STATUS === 'Paid') {
      throw new BadRequestException('Admission bill already paid');
    }
    if (existing.PAYMENT_STATUS === 'Waived') {
      throw new BadRequestException('Admission bill payment was waived');
    }

    const label = actorLabelOf(actor);
    const now = new Date();
    const row = await this.prisma.admissionBills.update({
      where: { ADMISSION_BILL_ID: id },
      data: {
        PAYMENT_STATUS: 'Paid',
        PAYMENT_CHANNEL: dto.paymentChannel,
        PAYMENT_REF: dto.paymentRef?.trim() ?? null,
        PAID_AT: now,
        PAID_BY: label,
        UPDATED_BY_ID: actor?.id ?? null,
        UPDATED_BY: label,
        UPDATED_DATE: now,
      },
      include: this.include(),
    });

    const response = this.toResponse(row);
    await this.audit.log({
      type: 'admission-bill:pay',
      entity: 'admission-bill',
      entityId: id,
      personId: existing.PERSON_ID,
      userId: actor?.id,
      createdBy: label,
      item: `Admission bill paid: ${response.billNo}`,
      oldValue: { paymentStatus: existing.PAYMENT_STATUS },
      newValue: response,
    });
    return response;
  }
}
