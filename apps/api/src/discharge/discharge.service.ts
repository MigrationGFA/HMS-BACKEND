import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AdmissionsService } from '../admissions/admissions.service';
import { NotificationsService } from '../notifications/notifications.service';
import type { AuthUser } from '../auth/types/auth-user.type';
import type {
  CancelDischargeDraftDto,
  CreateDischargeDraftDto,
  NoteDto,
  ReasonDto,
  UpdateDischargeDraftDto,
} from './dto/discharge-draft.dto';

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

const TERMINAL = new Set(['Discharged', 'Cancelled']);

function actorLabelOf(actor?: AuthUser): string {
  return (
    actor?.email ||
    [actor?.firstName, actor?.lastName].filter(Boolean).join(' ') ||
    'SYSTEM'
  );
}

function mapPerson(
  p: {
    PERSON_ID: number;
    HOSPITAL_NO: string | null;
    FIRST_NAME: string | null;
    LAST_NAME: string | null;
    MIDDLE_NAME: string | null;
    SEX: string | null;
    DATE_OF_BIRTH: Date | null;
    PATIENT_PHONE_NO: string | null;
  } | null | undefined,
) {
  if (!p) return null;
  return {
    personId: p.PERSON_ID,
    hospitalNo: p.HOSPITAL_NO,
    firstName: p.FIRST_NAME,
    lastName: p.LAST_NAME,
    middleName: p.MIDDLE_NAME,
    sex: p.SEX,
    dateOfBirth: p.DATE_OF_BIRTH?.toISOString() ?? null,
    phone: p.PATIENT_PHONE_NO,
  };
}

const INCLUDE = {
  person: { select: PERSON_SELECT },
  admission: {
    include: {
      ward: true,
      bed: true,
    },
  },
  events: { orderBy: { CREATED_DATE: 'asc' as const } },
} satisfies Prisma.DischargeDraftsInclude;

type Row = Prisma.DischargeDraftsGetPayload<{ include: typeof INCLUDE }>;

export type PaymentSnapshot = {
  cleared: boolean;
  unpaidCount: number;
  items: Array<{
    source: string;
    id: number;
    reference: string;
    amount: number | null;
    paymentStatus: string;
  }>;
};

@Injectable()
export class DischargeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly admissions: AdmissionsService,
    private readonly notifications: NotificationsService,
  ) {}

  private toResponse(row: Row, payment?: PaymentSnapshot | null) {
    return {
      draftId: row.DRAFT_ID,
      draftNo: row.DRAFT_NO,
      personId: row.PERSON_ID,
      admissionId: row.ADMISSION_ID,
      status: row.STATUS,
      admissionDiagnosis: row.ADMISSION_DIAGNOSIS,
      finalDiagnosis: row.FINAL_DIAGNOSIS,
      reasonForAdmission: row.REASON_FOR_ADMISSION,
      clinicalSummary: row.CLINICAL_SUMMARY,
      investigations: row.INVESTIGATIONS,
      treatmentGiven: row.TREATMENT_GIVEN,
      dischargeMedications: row.DISCHARGE_MEDICATIONS,
      medicationsChanged: row.MEDICATIONS_CHANGED,
      followUpPlan: row.FOLLOW_UP_PLAN,
      nextAppointment: row.NEXT_APPOINTMENT,
      patientEducation: row.PATIENT_EDUCATION,
      riskSafetyNotes: row.RISK_SAFETY_NOTES,
      dischargeType: row.DISCHARGE_TYPE,
      returnReason: row.RETURN_REASON,
      requestedByUserId: row.REQUESTED_BY_USER_ID,
      submittedAt: row.SUBMITTED_AT?.toISOString() ?? null,
      paymentClearedAt: row.PAYMENT_CLEARED_AT?.toISOString() ?? null,
      finalizedAt: row.FINALIZED_AT?.toISOString() ?? null,
      createdBy: row.CREATED_BY,
      createdAt: row.CREATED_DATE?.toISOString() ?? null,
      updatedAt: row.UPDATED_DATE?.toISOString() ?? null,
      person: mapPerson(row.person),
      admission: row.admission
        ? {
            admissionId: row.admission.ADMISSION_ID,
            status: row.admission.STATUS,
            diagnosis: row.admission.DIAGNOSIS,
            admittedAt: row.admission.ADMITTED_AT?.toISOString() ?? null,
            ward: row.admission.ward
              ? {
                  wardId: row.admission.ward.WARD_ID,
                  code: row.admission.ward.CODE,
                  name: row.admission.ward.NAME,
                }
              : null,
            bed: row.admission.bed
              ? {
                  bedId: row.admission.bed.BED_ID,
                  label: row.admission.bed.LABEL,
                  status: row.admission.bed.STATUS,
                }
              : null,
          }
        : null,
      payment,
      events: (row.events ?? []).map((e) => ({
        eventId: e.EVENT_ID,
        eventType: e.EVENT_TYPE,
        actorUserId: e.ACTOR_USER_ID,
        actorLabel: e.ACTOR_LABEL,
        note: e.NOTE,
        oldStatus: e.OLD_STATUS,
        newStatus: e.NEW_STATUS,
        createdAt: e.CREATED_DATE.toISOString(),
      })),
    };
  }

  private async load(id: number): Promise<Row> {
    const row = await this.prisma.dischargeDrafts.findUnique({
      where: { DRAFT_ID: id },
      include: INCLUDE,
    });
    if (!row) throw new NotFoundException('Discharge draft not found');
    return row;
  }

  private async nextNo(): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `DSD-${year}-`;
    const latest = await this.prisma.dischargeDrafts.findFirst({
      where: { DRAFT_NO: { startsWith: prefix } },
      orderBy: { DRAFT_NO: 'desc' },
      select: { DRAFT_NO: true },
    });
    let seq = 1;
    if (latest?.DRAFT_NO) {
      const n = Number(latest.DRAFT_NO.slice(prefix.length));
      if (Number.isFinite(n)) seq = n + 1;
    }
    return `${prefix}${String(seq).padStart(4, '0')}`;
  }

  private async appendEvent(
    tx: Prisma.TransactionClient,
    input: {
      draftId: number;
      eventType: string;
      actor?: AuthUser;
      note?: string | null;
      oldStatus?: string | null;
      newStatus?: string | null;
    },
  ) {
    await tx.dischargeDraftEvents.create({
      data: {
        DRAFT_ID: input.draftId,
        EVENT_TYPE: input.eventType,
        ACTOR_USER_ID: input.actor?.id ?? null,
        ACTOR_LABEL: actorLabelOf(input.actor),
        NOTE: input.note ?? null,
        OLD_STATUS: input.oldStatus ?? null,
        NEW_STATUS: input.newStatus ?? null,
        CREATED_DATE: new Date(),
      },
    });
  }

  private async notifyRoles(
    roles: string[],
    payload: {
      type: string;
      title: string;
      body?: string;
      linkPath?: string;
      entityId?: number;
      personId?: number | null;
    },
  ) {
    try {
      const users = await this.prisma.users.findMany({
        where: { role: { ROLE_NAME: { in: roles } } },
        select: { USER_ID: true, role: { select: { ROLE_NAME: true } } },
        take: 100,
      });
      for (const u of users) {
        await this.notifications.createForUser({
          userId: u.USER_ID,
          roleHint: u.role?.ROLE_NAME ?? null,
          type: payload.type,
          title: payload.title,
          body: payload.body,
          linkPath: payload.linkPath,
          entity: 'discharge_draft',
          entityId: payload.entityId,
          personId: payload.personId ?? null,
        });
      }
    } catch {
      /* non-fatal */
    }
  }

  private async notifyUser(
    userId: number | null | undefined,
    payload: {
      type: string;
      title: string;
      body?: string;
      linkPath?: string;
      entityId?: number;
      personId?: number | null;
      roleHint?: string;
    },
  ) {
    if (!userId) return;
    try {
      await this.notifications.createForUser({
        userId,
        roleHint: payload.roleHint ?? null,
        type: payload.type,
        title: payload.title,
        body: payload.body,
        linkPath: payload.linkPath,
        entity: 'discharge_draft',
        entityId: payload.entityId,
        personId: payload.personId ?? null,
      });
    } catch {
      /* non-fatal */
    }
  }

  async getPaymentSnapshot(personId: number): Promise<PaymentSnapshot> {
    const items: PaymentSnapshot['items'] = [];

    const [admissionBills, labRequests, imagingRequests, prescriptions, pharmacySales] =
      await Promise.all([
        this.prisma.admissionBills.findMany({
          where: { PERSON_ID: personId, PAYMENT_STATUS: 'Unpaid' },
          select: {
            ADMISSION_BILL_ID: true,
            BILL_NO: true,
            TOTAL_AMOUNT: true,
            PAYMENT_STATUS: true,
          },
          take: 50,
        }),
        this.prisma.labRequests.findMany({
          where: { PERSON_ID: personId, PAYMENT_STATUS: 'Unpaid' },
          select: {
            LAB_REQUEST_ID: true,
            REQUEST_NO: true,
            TOTAL_AMOUNT: true,
            PAYMENT_STATUS: true,
          },
          take: 50,
        }),
        this.prisma.imagingRequests.findMany({
          where: { PERSON_ID: personId, PAYMENT_STATUS: 'Unpaid' },
          select: {
            IMAGING_REQUEST_ID: true,
            REQUEST_NO: true,
            TOTAL_AMOUNT: true,
            PAYMENT_STATUS: true,
          },
          take: 50,
        }),
        this.prisma.prescriptions.findMany({
          where: {
            PERSON_ID: personId,
            PAYMENT_STATUS: { in: ['Unpaid', 'Pending', 'Emergency'] },
          },
          select: {
            PRESCRIPTION_ID: true,
            RX_NO: true,
            PAYMENT_STATUS: true,
          },
          take: 50,
        }),
        this.prisma.pharmacySales.findMany({
          where: {
            PERSON_ID: personId,
            PAYMENT_STATUS: 'Unpaid',
          },
          select: {
            SALE_ID: true,
            SALE_NO: true,
            TOTAL: true,
            PAYMENT_STATUS: true,
          },
          take: 50,
        }),
      ]);

    for (const b of admissionBills) {
      items.push({
        source: 'admission_bill',
        id: b.ADMISSION_BILL_ID,
        reference: b.BILL_NO,
        amount: b.TOTAL_AMOUNT != null ? Number(b.TOTAL_AMOUNT) : null,
        paymentStatus: b.PAYMENT_STATUS,
      });
    }
    for (const b of labRequests) {
      items.push({
        source: 'lab_request',
        id: b.LAB_REQUEST_ID,
        reference: b.REQUEST_NO,
        amount: b.TOTAL_AMOUNT != null ? Number(b.TOTAL_AMOUNT) : null,
        paymentStatus: b.PAYMENT_STATUS,
      });
    }
    for (const b of imagingRequests) {
      items.push({
        source: 'imaging_request',
        id: b.IMAGING_REQUEST_ID,
        reference: b.REQUEST_NO,
        amount: b.TOTAL_AMOUNT != null ? Number(b.TOTAL_AMOUNT) : null,
        paymentStatus: b.PAYMENT_STATUS,
      });
    }
    for (const b of prescriptions) {
      items.push({
        source: 'prescription',
        id: b.PRESCRIPTION_ID,
        reference: b.RX_NO,
        amount: null,
        paymentStatus: b.PAYMENT_STATUS,
      });
    }
    for (const b of pharmacySales) {
      items.push({
        source: 'pharmacy_sale',
        id: b.SALE_ID,
        reference: b.SALE_NO,
        amount: b.TOTAL != null ? Number(b.TOTAL) : null,
        paymentStatus: b.PAYMENT_STATUS,
      });
    }

    return {
      cleared: items.length === 0,
      unpaidCount: items.length,
      items,
    };
  }

  async create(dto: CreateDischargeDraftDto, actor?: AuthUser) {
    const admission = await this.prisma.admissions.findUnique({
      where: { ADMISSION_ID: dto.admissionId },
      include: { person: { select: PERSON_SELECT } },
    });
    if (!admission) throw new NotFoundException('Admission not found');
    if (
      !['ADMITTED', 'ON_LEAVE', 'BED_ALLOCATED', 'DISCHARGE_ORDERED'].includes(
        admission.STATUS,
      )
    ) {
      throw new ConflictException(
        `Cannot create discharge draft for admission status ${admission.STATUS}`,
      );
    }

    const open = await this.prisma.dischargeDrafts.findFirst({
      where: {
        ADMISSION_ID: dto.admissionId,
        STATUS: {
          in: [
            'Draft',
            'Submitted',
            'AwaitingPayment',
            'PaymentCleared',
            'Returned',
          ],
        },
      },
    });
    if (open) {
      throw new ConflictException(
        `Open discharge draft already exists (${open.DRAFT_NO})`,
      );
    }

    const actorLabel = actorLabelOf(actor);
    const now = new Date();
    const draftNo = await this.nextNo();

    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.dischargeDrafts.create({
        data: {
          DRAFT_NO: draftNo,
          PERSON_ID: admission.PERSON_ID,
          ADMISSION_ID: dto.admissionId,
          STATUS: 'Draft',
          DISCHARGE_TYPE: dto.dischargeType?.trim() || 'Routine',
          ADMISSION_DIAGNOSIS:
            dto.admissionDiagnosis?.trim() || admission.DIAGNOSIS,
          FINAL_DIAGNOSIS: dto.finalDiagnosis?.trim() || null,
          REASON_FOR_ADMISSION: dto.reasonForAdmission?.trim() || null,
          CLINICAL_SUMMARY: dto.clinicalSummary?.trim() || null,
          INVESTIGATIONS: dto.investigations?.trim() || null,
          TREATMENT_GIVEN: dto.treatmentGiven?.trim() || null,
          DISCHARGE_MEDICATIONS: dto.dischargeMedications?.trim() || null,
          MEDICATIONS_CHANGED: dto.medicationsChanged?.trim() || null,
          FOLLOW_UP_PLAN: dto.followUpPlan?.trim() || null,
          NEXT_APPOINTMENT: dto.nextAppointment?.trim() || null,
          PATIENT_EDUCATION: dto.patientEducation?.trim() || null,
          RISK_SAFETY_NOTES: dto.riskSafetyNotes?.trim() || null,
          REQUESTED_BY_USER_ID: actor?.id ?? null,
          CREATED_BY_ID: actor?.id ?? null,
          CREATED_BY: actorLabel,
          CREATED_DATE: now,
          UPDATED_BY_ID: actor?.id ?? null,
          UPDATED_BY: actorLabel,
          UPDATED_DATE: now,
        },
      });
      await this.appendEvent(tx, {
        draftId: created.DRAFT_ID,
        eventType: 'discharge:create',
        actor,
        newStatus: 'Draft',
      });
      return created;
    });

    await this.audit.log({
      type: 'discharge:create',
      entity: 'discharge_draft',
      entityId: row.DRAFT_ID,
      personId: admission.PERSON_ID,
      userId: actor?.id,
      createdBy: actorLabel,
      item: `Discharge draft ${draftNo} created`,
    });

    return this.toResponse(await this.load(row.DRAFT_ID));
  }

  async list(
    params: {
      scope?: string;
      status?: string;
      personId?: number;
      admissionId?: number;
      q?: string;
      page?: number;
      limit?: number;
    },
    actor?: AuthUser,
  ) {
    const page = Math.max(params.page ?? 1, 1);
    const limit = Math.min(Math.max(params.limit ?? 50, 1), 200);
    const where: Prisma.DischargeDraftsWhereInput = {};

    if (params.status) {
      const statuses = params.status
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      where.STATUS = statuses.length === 1 ? statuses[0] : { in: statuses };
    }
    if (params.personId) where.PERSON_ID = params.personId;
    if (params.admissionId) where.ADMISSION_ID = params.admissionId;

    if (params.scope === 'mine' && actor?.id) {
      where.REQUESTED_BY_USER_ID = actor.id;
    } else if (params.scope === 'queue') {
      where.STATUS = {
        in: ['AwaitingPayment', 'PaymentCleared', 'Submitted'],
      };
    }

    if (params.q?.trim()) {
      const q = params.q.trim();
      where.AND = [
        {
          OR: [
            { DRAFT_NO: { contains: q, mode: 'insensitive' } },
            { FINAL_DIAGNOSIS: { contains: q, mode: 'insensitive' } },
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
        },
      ];
    }

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.dischargeDrafts.count({ where }),
      this.prisma.dischargeDrafts.findMany({
        where,
        include: INCLUDE,
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

  async findOne(id: number) {
    const row = await this.load(id);
    const payment = await this.getPaymentSnapshot(row.PERSON_ID);
    return this.toResponse(row, payment);
  }

  async update(id: number, dto: UpdateDischargeDraftDto, actor?: AuthUser) {
    const existing = await this.load(id);
    if (!['Draft', 'Returned'].includes(existing.STATUS)) {
      throw new ConflictException(
        `Cannot update draft in status ${existing.STATUS}`,
      );
    }
    const actorLabel = actorLabelOf(actor);
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.dischargeDrafts.update({
        where: { DRAFT_ID: id },
        data: {
          DISCHARGE_TYPE: dto.dischargeType?.trim() ?? existing.DISCHARGE_TYPE,
          ADMISSION_DIAGNOSIS:
            dto.admissionDiagnosis?.trim() ?? existing.ADMISSION_DIAGNOSIS,
          FINAL_DIAGNOSIS: dto.finalDiagnosis?.trim() ?? existing.FINAL_DIAGNOSIS,
          REASON_FOR_ADMISSION:
            dto.reasonForAdmission?.trim() ?? existing.REASON_FOR_ADMISSION,
          CLINICAL_SUMMARY:
            dto.clinicalSummary?.trim() ?? existing.CLINICAL_SUMMARY,
          INVESTIGATIONS: dto.investigations?.trim() ?? existing.INVESTIGATIONS,
          TREATMENT_GIVEN:
            dto.treatmentGiven?.trim() ?? existing.TREATMENT_GIVEN,
          DISCHARGE_MEDICATIONS:
            dto.dischargeMedications?.trim() ?? existing.DISCHARGE_MEDICATIONS,
          MEDICATIONS_CHANGED:
            dto.medicationsChanged?.trim() ?? existing.MEDICATIONS_CHANGED,
          FOLLOW_UP_PLAN: dto.followUpPlan?.trim() ?? existing.FOLLOW_UP_PLAN,
          NEXT_APPOINTMENT:
            dto.nextAppointment?.trim() ?? existing.NEXT_APPOINTMENT,
          PATIENT_EDUCATION:
            dto.patientEducation?.trim() ?? existing.PATIENT_EDUCATION,
          RISK_SAFETY_NOTES:
            dto.riskSafetyNotes?.trim() ?? existing.RISK_SAFETY_NOTES,
          STATUS: existing.STATUS === 'Returned' ? 'Draft' : existing.STATUS,
          RETURN_REASON:
            existing.STATUS === 'Returned' ? null : existing.RETURN_REASON,
          UPDATED_BY_ID: actor?.id ?? null,
          UPDATED_BY: actorLabel,
          UPDATED_DATE: now,
        },
      });
      await this.appendEvent(tx, {
        draftId: id,
        eventType: 'discharge:update',
        actor,
        oldStatus: existing.STATUS,
        newStatus: existing.STATUS === 'Returned' ? 'Draft' : existing.STATUS,
      });
    });
    await this.audit.log({
      type: 'discharge:update',
      entity: 'discharge_draft',
      entityId: id,
      personId: existing.PERSON_ID,
      userId: actor?.id,
      createdBy: actorLabel,
      item: `Discharge draft ${existing.DRAFT_NO} updated`,
    });
    return this.toResponse(await this.load(id));
  }

  async submit(id: number, dto: NoteDto, actor?: AuthUser) {
    const existing = await this.load(id);
    if (!['Draft', 'Returned'].includes(existing.STATUS)) {
      throw new ConflictException(
        `Cannot submit draft in status ${existing.STATUS}`,
      );
    }
    if (!existing.FINAL_DIAGNOSIS?.trim() && !existing.CLINICAL_SUMMARY?.trim()) {
      throw new BadRequestException(
        'Final diagnosis or clinical summary is required before submit',
      );
    }

    await this.admissions.orderDischarge(
      existing.ADMISSION_ID,
      { reason: dto.note?.trim() || existing.FINAL_DIAGNOSIS || 'Discharge submitted' },
      actor,
    );

    const actorLabel = actorLabelOf(actor);
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.dischargeDrafts.update({
        where: { DRAFT_ID: id },
        data: {
          STATUS: 'AwaitingPayment',
          SUBMITTED_AT: now,
          UPDATED_BY_ID: actor?.id ?? null,
          UPDATED_BY: actorLabel,
          UPDATED_DATE: now,
        },
      });
      await this.appendEvent(tx, {
        draftId: id,
        eventType: 'discharge:submit',
        actor,
        note: dto.note,
        oldStatus: existing.STATUS,
        newStatus: 'AwaitingPayment',
      });
    });

    await this.audit.log({
      type: 'discharge:submit',
      entity: 'discharge_draft',
      entityId: id,
      personId: existing.PERSON_ID,
      userId: actor?.id,
      createdBy: actorLabel,
      item: `Discharge draft ${existing.DRAFT_NO} submitted`,
    });

    await this.notifyRoles(['CASHIER', 'RECORDS'], {
      type: 'DischargeSubmitted',
      title: `Discharge pending payment: ${existing.DRAFT_NO}`,
      body: 'Clear unpaid bills before Records can finalize',
      linkPath: '/billing?tab=discharge',
      entityId: id,
      personId: existing.PERSON_ID,
    });

    const payment = await this.getPaymentSnapshot(existing.PERSON_ID);
    return this.toResponse(await this.load(id), payment);
  }

  async paymentStatus(id: number) {
    const existing = await this.load(id);
    return this.getPaymentSnapshot(existing.PERSON_ID);
  }

  async clearPayment(id: number, dto: NoteDto, actor?: AuthUser) {
    const existing = await this.load(id);
    if (!['AwaitingPayment', 'Submitted'].includes(existing.STATUS)) {
      throw new ConflictException(
        `Cannot clear payment in status ${existing.STATUS}`,
      );
    }
    const payment = await this.getPaymentSnapshot(existing.PERSON_ID);
    if (!payment.cleared) {
      throw new ConflictException({
        message: `Patient still has ${payment.unpaidCount} unpaid bill(s)`,
        unpaidCount: payment.unpaidCount,
        items: payment.items,
      });
    }

    const actorLabel = actorLabelOf(actor);
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.dischargeDrafts.update({
        where: { DRAFT_ID: id },
        data: {
          STATUS: 'PaymentCleared',
          PAYMENT_CLEARED_BY_USER_ID: actor?.id ?? null,
          PAYMENT_CLEARED_AT: now,
          UPDATED_BY_ID: actor?.id ?? null,
          UPDATED_BY: actorLabel,
          UPDATED_DATE: now,
        },
      });
      await this.appendEvent(tx, {
        draftId: id,
        eventType: 'discharge:clear-payment',
        actor,
        note: dto.note,
        oldStatus: existing.STATUS,
        newStatus: 'PaymentCleared',
      });
    });

    await this.audit.log({
      type: 'discharge:clear-payment',
      entity: 'discharge_draft',
      entityId: id,
      personId: existing.PERSON_ID,
      userId: actor?.id,
      createdBy: actorLabel,
      item: `Payment cleared for ${existing.DRAFT_NO}`,
    });

    await this.notifyRoles(['RECORDS'], {
      type: 'PaymentCleared',
      title: `Ready for final discharge: ${existing.DRAFT_NO}`,
      linkPath: '/records/discharge',
      entityId: id,
      personId: existing.PERSON_ID,
    });

    return this.toResponse(await this.load(id), payment);
  }

  async returnForInfo(id: number, dto: ReasonDto, actor?: AuthUser) {
    const existing = await this.load(id);
    if (
      !['AwaitingPayment', 'Submitted', 'PaymentCleared'].includes(
        existing.STATUS,
      )
    ) {
      throw new ConflictException(
        `Cannot return draft in status ${existing.STATUS}`,
      );
    }
    const actorLabel = actorLabelOf(actor);
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.dischargeDrafts.update({
        where: { DRAFT_ID: id },
        data: {
          STATUS: 'Returned',
          RETURN_REASON: dto.reason.trim(),
          UPDATED_BY_ID: actor?.id ?? null,
          UPDATED_BY: actorLabel,
          UPDATED_DATE: now,
        },
      });
      await this.appendEvent(tx, {
        draftId: id,
        eventType: 'discharge:return',
        actor,
        note: dto.reason.trim(),
        oldStatus: existing.STATUS,
        newStatus: 'Returned',
      });
    });
    await this.audit.log({
      type: 'discharge:return',
      entity: 'discharge_draft',
      entityId: id,
      personId: existing.PERSON_ID,
      userId: actor?.id,
      createdBy: actorLabel,
      item: `Discharge draft ${existing.DRAFT_NO} returned`,
    });
    await this.notifyUser(existing.REQUESTED_BY_USER_ID, {
      type: 'DischargeReturned',
      title: `Discharge returned: ${existing.DRAFT_NO}`,
      body: dto.reason.trim(),
      linkPath: '/dashboard/doctor/clinical/discharge',
      entityId: id,
      personId: existing.PERSON_ID,
      roleHint: 'DOCTOR',
    });
    return this.toResponse(await this.load(id));
  }

  async finalize(id: number, dto: NoteDto, actor?: AuthUser) {
    const existing = await this.load(id);
    if (existing.STATUS !== 'PaymentCleared') {
      throw new ConflictException(
        `Can only finalize when PaymentCleared (now ${existing.STATUS})`,
      );
    }
    const payment = await this.getPaymentSnapshot(existing.PERSON_ID);
    if (!payment.cleared) {
      throw new ConflictException({
        message: `Patient still has ${payment.unpaidCount} unpaid bill(s)`,
        unpaidCount: payment.unpaidCount,
        items: payment.items,
      });
    }

    await this.admissions.completeDischarge(
      existing.ADMISSION_ID,
      { reason: dto.note?.trim() || existing.FINAL_DIAGNOSIS || undefined },
      actor,
    );

    const actorLabel = actorLabelOf(actor);
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.dischargeDrafts.update({
        where: { DRAFT_ID: id },
        data: {
          STATUS: 'Discharged',
          FINALIZED_BY_USER_ID: actor?.id ?? null,
          FINALIZED_AT: now,
          UPDATED_BY_ID: actor?.id ?? null,
          UPDATED_BY: actorLabel,
          UPDATED_DATE: now,
        },
      });
      await this.appendEvent(tx, {
        draftId: id,
        eventType: 'discharge:finalize',
        actor,
        note: dto.note,
        oldStatus: existing.STATUS,
        newStatus: 'Discharged',
      });
    });

    await this.audit.log({
      type: 'discharge:finalize',
      entity: 'discharge_draft',
      entityId: id,
      personId: existing.PERSON_ID,
      userId: actor?.id,
      createdBy: actorLabel,
      item: `Discharge finalized ${existing.DRAFT_NO}`,
    });

    await this.notifyUser(existing.REQUESTED_BY_USER_ID, {
      type: 'Discharged',
      title: `Patient discharged: ${existing.DRAFT_NO}`,
      linkPath: '/dashboard/doctor/clinical/discharge',
      entityId: id,
      personId: existing.PERSON_ID,
      roleHint: 'DOCTOR',
    });

    return this.toResponse(await this.load(id), payment);
  }

  async cancel(id: number, dto: CancelDischargeDraftDto, actor?: AuthUser) {
    const existing = await this.load(id);
    if (TERMINAL.has(existing.STATUS) || existing.STATUS === 'PaymentCleared') {
      throw new ConflictException(
        `Cannot cancel draft in status ${existing.STATUS}`,
      );
    }
    const actorLabel = actorLabelOf(actor);
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.dischargeDrafts.update({
        where: { DRAFT_ID: id },
        data: {
          STATUS: 'Cancelled',
          RETURN_REASON: dto.reason?.trim() || existing.RETURN_REASON,
          UPDATED_BY_ID: actor?.id ?? null,
          UPDATED_BY: actorLabel,
          UPDATED_DATE: now,
        },
      });
      await this.appendEvent(tx, {
        draftId: id,
        eventType: 'discharge:cancel',
        actor,
        note: dto.reason,
        oldStatus: existing.STATUS,
        newStatus: 'Cancelled',
      });
    });
    await this.audit.log({
      type: 'discharge:cancel',
      entity: 'discharge_draft',
      entityId: id,
      personId: existing.PERSON_ID,
      userId: actor?.id,
      createdBy: actorLabel,
      item: `Discharge draft ${existing.DRAFT_NO} cancelled`,
    });
    return this.toResponse(await this.load(id));
  }
}
