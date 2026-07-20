import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { TriageService } from '../triage/triage.service';
import { CardsService } from '../patients/cards.service';
import type { AuthUser } from '../auth/types/auth-user.type';
import type {
  RecordQueueVitalsDto,
  SendToDoctorDto,
} from './dto/patient-queue.dto';

type TriageResponse = Awaited<ReturnType<TriageService['findById']>>;

export type PatientQueueItem = TriageResponse & {
  paymentStatus: string | null;
  cardId: number | null;
  cardNo: string | null;
  totalAmount: number | null;
  paymentCleared: boolean;
  hasVitals: boolean;
  reasonForVisit: string;
};

const PERSON_SELECT = {
  PERSON_ID: true,
  HOSPITAL_NO: true,
  FIRST_NAME: true,
  LAST_NAME: true,
  MIDDLE_NAME: true,
  SEX: true,
  DATE_OF_BIRTH: true,
  PATIENT_PHONE_NO: true,
  NAME_OF_NEXT_OF_KIN: true,
  RELATIONSHIP: true,
  TELEPHONE_OF_NEXT_OF_KIN: true,
  BLOOD_GROUP: true,
} as const;

function dayBounds(timezoneOffsetMinutes = 60, dateIso?: string) {
  const offsetMin = timezoneOffsetMinutes;
  let local: Date;
  if (dateIso) {
    const d = new Date(dateIso);
    local = new Date(d.getTime() + offsetMin * 60_000);
  } else {
    const now = new Date();
    local = new Date(now.getTime() + offsetMin * 60_000);
  }
  const startLocal = new Date(
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()),
  );
  const startOfDay = new Date(startLocal.getTime() - offsetMin * 60_000);
  const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);
  return { startOfDay, endOfDay, offsetMin };
}

function hasVitals(row: TriageResponse): boolean {
  return (
    row.bloodPressure != null ||
    row.temperatureC != null ||
    row.pulseBpm != null ||
    row.weightKg != null ||
    row.spo2Pct != null ||
    row.respiratoryRate != null
  );
}

function reasonForVisit(row: TriageResponse): string {
  const parts = [
    row.clinic,
    row.patientType ? `${row.patientType} visit` : null,
    row.priority && row.priority !== 'Routine' ? row.priority : null,
    row.notes?.trim() || null,
  ].filter(Boolean);
  return parts.join(' · ') || 'General OPD';
}

function actorLabelOf(actor?: AuthUser): string {
  return (
    actor?.email ||
    [actor?.firstName, actor?.lastName].filter(Boolean).join(' ') ||
    'SYSTEM'
  );
}

@Injectable()
export class NursingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly triage: TriageService,
    private readonly cards: CardsService,
    private readonly audit: AuditService,
  ) {}

  async listPatientQueues(params?: {
    status?: string;
    clinic?: string;
    priority?: string;
    q?: string;
    paymentStatus?: string;
    date?: string;
    timezoneOffsetMinutes?: number;
    page?: number;
    limit?: number;
  }): Promise<{ items: PatientQueueItem[]; meta: { page: number; limit: number; total: number } }> {
    const page = Math.max(params?.page ?? 1, 1);
    const limit = Math.min(Math.max(params?.limit ?? 50, 1), 100);
    const { startOfDay, endOfDay } = dayBounds(
      params?.timezoneOffsetMinutes,
      params?.date,
    );
    const term = params?.q?.trim();

    const where: Prisma.TriageWhereInput = {
      ARRIVAL_AT: { gte: startOfDay, lt: endOfDay },
      ...(params?.status ? { STATUS: params.status } : {}),
      ...(params?.clinic ? { CLINIC: params.clinic } : {}),
      ...(params?.priority ? { PRIORITY: params.priority } : {}),
      ...(term
        ? {
            OR: [
              { QUEUE_NO: { contains: term, mode: 'insensitive' } },
              {
                person: {
                  HOSPITAL_NO: { contains: term, mode: 'insensitive' },
                },
              },
              {
                person: {
                  FIRST_NAME: { contains: term, mode: 'insensitive' },
                },
              },
              {
                person: {
                  LAST_NAME: { contains: term, mode: 'insensitive' },
                },
              },
              { person: { PATIENT_PHONE_NO: { contains: term } } },
            ],
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.triage.findMany({
        where,
        orderBy: { ARRIVAL_AT: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { person: { select: PERSON_SELECT } },
      }),
      this.prisma.triage.count({ where }),
    ]);

    const personIds = [...new Set(rows.map((r) => r.PERSON_ID))];
    const cardByPerson = new Map<
      number,
      Awaited<ReturnType<CardsService['latestForPerson']>>
    >();
    await Promise.all(
      personIds.map(async (id) => {
        cardByPerson.set(id, await this.cards.latestForPerson(id));
      }),
    );

    let items = rows.map((row) =>
      this.enrichMapped(this.mapTriageRow(row), cardByPerson.get(row.PERSON_ID)),
    );

    if (params?.paymentStatus) {
      const want = params.paymentStatus.toLowerCase();
      items = items.filter(
        (r) => (r.paymentStatus ?? '').toLowerCase() === want,
      );
    }

    return {
      items,
      meta: {
        page,
        limit,
        total: params?.paymentStatus ? items.length : total,
      },
    };
  }

  async patientQueueStats(params?: {
    date?: string;
    timezoneOffsetMinutes?: number;
  }) {
    const { startOfDay, endOfDay, offsetMin } = dayBounds(
      params?.timezoneOffsetMinutes,
      params?.date,
    );
    const todayFilter = { ARRIVAL_AT: { gte: startOfDay, lt: endOfDay } };

    const [waiting, inTriage, triageCompleted, sentToDoctor, allToday] =
      await Promise.all([
        this.prisma.triage.count({
          where: { ...todayFilter, STATUS: 'Waiting' },
        }),
        this.prisma.triage.count({
          where: { ...todayFilter, STATUS: 'In Triage' },
        }),
        this.prisma.triage.count({
          where: { ...todayFilter, STATUS: 'Triage Completed' },
        }),
        this.prisma.triage.count({
          where: { ...todayFilter, STATUS: 'Sent to Consultation' },
        }),
        this.prisma.triage.findMany({
          where: todayFilter,
          select: { PERSON_ID: true, TRIAGE_ID: true, BLOOD_PRESSURE: true, TEMPERATURE_C: true, PULSE_BPM: true, WEIGHT_KG: true, SPO2_PCT: true, RESPIRATORY_RATE: true },
        }),
      ]);

    let unpaid = 0;
    let paid = 0;
    let vitalsDone = 0;

    for (const row of allToday) {
      const has =
        row.BLOOD_PRESSURE != null ||
        row.TEMPERATURE_C != null ||
        row.PULSE_BPM != null ||
        row.WEIGHT_KG != null ||
        row.SPO2_PCT != null ||
        row.RESPIRATORY_RATE != null;
      if (has) vitalsDone += 1;

      const card = await this.cards.latestForPerson(row.PERSON_ID);
      if (!card || card.paymentStatus !== 'Pending') paid += 1;
      else unpaid += 1;
    }

    return {
      asOf: new Date().toISOString(),
      timezoneOffsetMinutes: offsetMin,
      waiting,
      inTriage,
      triageCompleted,
      vitalsDone,
      sentToDoctor,
      unpaid,
      paid,
      total: allToday.length,
    };
  }

  async getPatientQueue(triageId: number): Promise<PatientQueueItem> {
    const base = await this.triage.findById(triageId);
    return this.enrich(base);
  }

  async startQueue(
    triageId: number,
    actor?: AuthUser,
  ): Promise<PatientQueueItem> {
    const updated = await this.triage.update(
      triageId,
      { status: 'In Triage' },
      actor,
    );
    await this.audit.log({
      type: 'nursing:start',
      entity: 'triage',
      entityId: triageId,
      personId: updated.personId,
      userId: actor?.id,
      createdBy: actorLabelOf(actor),
      item: `Nursing started triage ${updated.queueNo}`,
      newValue: { status: 'In Triage' },
    });
    return this.enrich(updated);
  }

  async recordVitals(
    triageId: number,
    dto: RecordQueueVitalsDto,
    actor?: AuthUser,
  ): Promise<PatientQueueItem> {
    const existing = await this.triage.findById(triageId);
    const statusPatch =
      existing.status === 'Waiting'
        ? ({ status: 'In Triage' } as const)
        : {};

    const updated = await this.triage.update(
      triageId,
      {
        ...statusPatch,
        weightKg: dto.weightKg,
        heightCm: dto.heightCm,
        bloodPressure: dto.bloodPressure,
        temperatureC: dto.temperatureC,
        pulseBpm: dto.pulseBpm,
        respiratoryRate: dto.respiratoryRate,
        spo2Pct: dto.spo2Pct,
        notes: dto.notes,
      },
      actor,
    );

    await this.audit.log({
      type: 'nursing:vitals',
      entity: 'triage',
      entityId: triageId,
      personId: updated.personId,
      userId: actor?.id,
      createdBy: actorLabelOf(actor),
      item: `Nursing recorded vitals on ${updated.queueNo}`,
      newValue: dto,
    });

    return this.enrich(updated);
  }

  async sendToDoctor(
    triageId: number,
    dto: SendToDoctorDto,
    actor?: AuthUser,
  ): Promise<PatientQueueItem> {
    const existing = await this.triage.findById(triageId);
    const cleared = await this.cards.isPaymentCleared(existing.personId);
    if (!cleared) {
      const card = await this.cards.latestForPerson(existing.personId);
      throw new ConflictException({
        message:
          'Card payment is pending — cashier must confirm payment before sending to doctor',
        cardId: card?.cardId ?? null,
        cardNo: card?.cardNo ?? null,
        paymentStatus: card?.paymentStatus ?? 'Pending',
      });
    }

    const updated = await this.triage.update(
      triageId,
      {
        status: 'Sent to Consultation',
        ...(dto.clinic !== undefined ? { clinic: dto.clinic } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
      },
      actor,
    );

    await this.audit.log({
      type: 'nursing:send-to-doctor',
      entity: 'triage',
      entityId: triageId,
      personId: updated.personId,
      userId: actor?.id,
      createdBy: actorLabelOf(actor),
      item: `Nursing sent ${updated.queueNo} to consultation`,
      newValue: {
        status: 'Sent to Consultation',
        clinic: updated.clinic,
      },
    });

    return this.enrich(updated);
  }

  private async enrich(base: TriageResponse): Promise<PatientQueueItem> {
    const card = await this.cards.latestForPerson(base.personId);
    return this.enrichMapped(base, card);
  }

  private enrichMapped(
    base: TriageResponse,
    card: Awaited<ReturnType<CardsService['latestForPerson']>> | null | undefined,
  ): PatientQueueItem {
    const paymentStatus = card?.paymentStatus ?? null;
    return {
      ...base,
      paymentStatus,
      cardId: card?.cardId ?? null,
      cardNo: card?.cardNo ?? null,
      totalAmount: card?.totalAmount ?? null,
      paymentCleared: !card || card.paymentStatus !== 'Pending',
      hasVitals: hasVitals(base),
      reasonForVisit: reasonForVisit(base),
    };
  }

  private mapTriageRow(row: {
    TRIAGE_ID: number;
    PERSON_ID: number;
    QUEUE_NO: string;
    CLINIC: string | null;
    STATUS: string;
    PRIORITY: string;
    PRIORITY_REASON: string | null;
    PATIENT_TYPE: string | null;
    ARRIVAL_AT: Date;
    WEIGHT_KG: Prisma.Decimal | null;
    HEIGHT_CM: Prisma.Decimal | null;
    BMI: Prisma.Decimal | null;
    BLOOD_PRESSURE: string | null;
    TEMPERATURE_C: Prisma.Decimal | null;
    PULSE_BPM: number | null;
    RESPIRATORY_RATE: number | null;
    SPO2_PCT: Prisma.Decimal | null;
    NOTES: string | null;
    CREATED_DATE: Date | null;
    person?: {
      PERSON_ID: number;
      HOSPITAL_NO: string | null;
      FIRST_NAME: string | null;
      LAST_NAME: string | null;
      MIDDLE_NAME: string | null;
      SEX: string | null;
      DATE_OF_BIRTH: Date | null;
      PATIENT_PHONE_NO: string | null;
      NAME_OF_NEXT_OF_KIN: string | null;
      RELATIONSHIP: string | null;
      TELEPHONE_OF_NEXT_OF_KIN: string | null;
      BLOOD_GROUP: string | null;
    } | null;
  }): TriageResponse {
    const p = row.person;
    const age = p?.DATE_OF_BIRTH
      ? Math.max(
          0,
          Math.floor(
            (Date.now() - p.DATE_OF_BIRTH.getTime()) /
              (1000 * 60 * 60 * 24 * 365.25),
          ),
        )
      : null;

    return {
      triageId: row.TRIAGE_ID,
      personId: row.PERSON_ID,
      queueNo: row.QUEUE_NO,
      clinic: row.CLINIC,
      status: row.STATUS,
      priority: row.PRIORITY,
      priorityReason: row.PRIORITY_REASON,
      patientType: row.PATIENT_TYPE,
      arrivalAt: row.ARRIVAL_AT.toISOString(),
      weightKg: row.WEIGHT_KG?.toNumber() ?? null,
      heightCm: row.HEIGHT_CM?.toNumber() ?? null,
      bmi: row.BMI?.toNumber() ?? null,
      bloodPressure: row.BLOOD_PRESSURE,
      temperatureC: row.TEMPERATURE_C?.toNumber() ?? null,
      pulseBpm: row.PULSE_BPM,
      respiratoryRate: row.RESPIRATORY_RATE,
      spo2Pct: row.SPO2_PCT?.toNumber() ?? null,
      notes: row.NOTES,
      createdAt: row.CREATED_DATE?.toISOString() ?? null,
      person: p
        ? {
            personId: p.PERSON_ID,
            hospitalNo: p.HOSPITAL_NO,
            firstName: p.FIRST_NAME,
            lastName: p.LAST_NAME,
            middleName: p.MIDDLE_NAME,
            sex: p.SEX,
            dateOfBirth: p.DATE_OF_BIRTH?.toISOString() ?? null,
            age,
            phone: p.PATIENT_PHONE_NO,
            nextOfKinName: p.NAME_OF_NEXT_OF_KIN,
            nextOfKinRelationship: p.RELATIONSHIP,
            nextOfKinPhone: p.TELEPHONE_OF_NEXT_OF_KIN,
            bloodGroup: p.BLOOD_GROUP,
          }
        : null,
    };
  }
}
