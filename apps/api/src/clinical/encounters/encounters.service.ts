import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { CardsService } from '../../patients/cards.service';
import { PatientsService } from '../../patients/patients.service';
import { PrescriptionsService } from '../prescriptions/prescriptions.service';
import type { AuthUser } from '../../auth/types/auth-user.type';
import {
  CompleteEncounterDto,
  StartEncounterDto,
  UpdateEncounterDto,
} from './dto/encounter.dto';

const QUEUE_STATUSES = ['Triage Completed', 'Sent to Consultation'] as const;

function actorLabelOf(actor?: AuthUser): string {
  return (
    actor?.email ||
    [actor?.firstName, actor?.lastName].filter(Boolean).join(' ') ||
    'SYSTEM'
  );
}

function ageYears(dob: Date | null | undefined): number | null {
  if (!dob) return null;
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age -= 1;
  return age;
}

function personName(p: {
  FIRST_NAME?: string | null;
  MIDDLE_NAME?: string | null;
  LAST_NAME?: string | null;
}) {
  return (
    [p.FIRST_NAME, p.MIDDLE_NAME, p.LAST_NAME].filter(Boolean).join(' ') ||
    'Unknown'
  );
}

function mapPaymentDisplay(
  person: {
    NHIS_NO?: string | null;
    HMO_ID?: number | null;
  },
  card?: { PAYMENT_STATUS?: string | null } | null,
): string {
  if (card?.PAYMENT_STATUS === 'Pending') return 'Pending';
  if (card?.PAYMENT_STATUS === 'Waived') return 'Waived';
  if (person.NHIS_NO) return 'NHIA';
  if (person.HMO_ID != null) return 'HMO';
  return 'Paid';
}

function mapVisit(patientType?: string | null): string {
  const t = patientType ?? '';
  if (/emergency/i.test(t)) return 'Emergency';
  if (/return/i.test(t) || /follow/i.test(t)) return 'Return';
  if (/new/i.test(t)) return 'New';
  return t || 'New';
}

function vitalsCaptured(t: {
  WEIGHT_KG?: Prisma.Decimal | null;
  BLOOD_PRESSURE?: string | null;
  TEMPERATURE_C?: Prisma.Decimal | null;
  PULSE_BPM?: number | null;
  RESPIRATORY_RATE?: number | null;
  SPO2_PCT?: Prisma.Decimal | null;
}): 'Captured' | 'Pending' {
  if (
    t.WEIGHT_KG != null ||
    t.BLOOD_PRESSURE ||
    t.TEMPERATURE_C != null ||
    t.PULSE_BPM != null ||
    t.RESPIRATORY_RATE != null ||
    t.SPO2_PCT != null
  ) {
    return 'Captured';
  }
  return 'Pending';
}

function dec(v: Prisma.Decimal | null | undefined): number | null {
  if (v == null) return null;
  return Number(v);
}

function mapVitals(t: {
  WEIGHT_KG?: Prisma.Decimal | null;
  HEIGHT_CM?: Prisma.Decimal | null;
  BMI?: Prisma.Decimal | null;
  BLOOD_PRESSURE?: string | null;
  TEMPERATURE_C?: Prisma.Decimal | null;
  PULSE_BPM?: number | null;
  RESPIRATORY_RATE?: number | null;
  SPO2_PCT?: Prisma.Decimal | null;
  NOTES?: string | null;
} | null) {
  if (!t) {
    return {
      status: 'Pending' as const,
      bloodPressure: null,
      temperatureC: null,
      pulseBpm: null,
      respiratoryRate: null,
      spo2Pct: null,
      weightKg: null,
      heightCm: null,
      bmi: null,
      notes: null,
    };
  }
  return {
    status: vitalsCaptured(t),
    bloodPressure: t.BLOOD_PRESSURE ?? null,
    temperatureC: dec(t.TEMPERATURE_C),
    pulseBpm: t.PULSE_BPM ?? null,
    respiratoryRate: t.RESPIRATORY_RATE ?? null,
    spo2Pct: dec(t.SPO2_PCT),
    weightKg: dec(t.WEIGHT_KG),
    heightCm: dec(t.HEIGHT_CM),
    bmi: dec(t.BMI),
    notes: t.NOTES ?? null,
  };
}

function mapNote(e: {
  CHIEF_COMPLAINT: string | null;
  HISTORY: string | null;
  EXAMINATION: string | null;
  ASSESSMENT: string | null;
  PLAN: string | null;
  PAST_MEDICAL_HISTORY?: string | null;
  DRUG_HISTORY?: string | null;
  ALLERGY_HISTORY?: string | null;
  FAMILY_HISTORY?: string | null;
  SOCIAL_HISTORY?: string | null;
  FOLLOW_UP_PLAN?: string | null;
}) {
  return {
    chiefComplaint: e.CHIEF_COMPLAINT ?? '',
    history: e.HISTORY ?? '',
    examination: e.EXAMINATION ?? '',
    assessment: e.ASSESSMENT ?? '',
    plan: e.PLAN ?? '',
    pastMedicalHistory: e.PAST_MEDICAL_HISTORY ?? '',
    drugHistory: e.DRUG_HISTORY ?? '',
    allergyHistory: e.ALLERGY_HISTORY ?? '',
    familyHistory: e.FAMILY_HISTORY ?? '',
    socialHistory: e.SOCIAL_HISTORY ?? '',
    followUpPlan: e.FOLLOW_UP_PLAN ?? '',
  };
}

function noteSummary(note: ReturnType<typeof mapNote>): string {
  const parts = [
    note.chiefComplaint && `CC: ${note.chiefComplaint}`,
    note.assessment && `Assessment: ${note.assessment}`,
    note.plan && `Plan: ${note.plan}`,
  ].filter(Boolean);
  return parts.join(' · ') || 'Clinical note';
}

function dayBounds(offsetMin: number) {
  const now = new Date();
  const localMs = now.getTime() + offsetMin * 60_000;
  const local = new Date(localMs);
  const startLocal = new Date(
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()),
  );
  const startOfDay = new Date(startLocal.getTime() - offsetMin * 60_000);
  const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);
  return { startOfDay, endOfDay };
}

type TriageVitalsFields = {
  WEIGHT_KG: Prisma.Decimal | null;
  HEIGHT_CM: Prisma.Decimal | null;
  BMI: Prisma.Decimal | null;
  BLOOD_PRESSURE: string | null;
  TEMPERATURE_C: Prisma.Decimal | null;
  PULSE_BPM: number | null;
  RESPIRATORY_RATE: number | null;
  SPO2_PCT: Prisma.Decimal | null;
  NOTES: string | null;
};

@Injectable()
export class EncountersService {
  /** In-memory idempotency for draft PATCH retries within process lifetime. */
  private readonly idempotency = new Map<
    string,
    { encounterId: number; version: number; at: number }
  >();

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly cards: CardsService,
    private readonly patients: PatientsService,
    private readonly prescriptions: PrescriptionsService,
  ) {}

  async consultationQueue(params?: {
    q?: string;
    clinic?: string;
    priority?: string;
    page?: number;
    limit?: number;
    timezoneOffsetMinutes?: number;
  }) {
    const offsetMin = params?.timezoneOffsetMinutes ?? 60;
    const { startOfDay, endOfDay } = dayBounds(offsetMin);
    const page = Math.max(params?.page ?? 1, 1);
    const limit = Math.min(Math.max(params?.limit ?? 50, 1), 100);
    const term = params?.q?.trim();

    const where: Prisma.TriageWhereInput = {
      ARRIVAL_AT: { gte: startOfDay, lt: endOfDay },
      STATUS: { in: [...QUEUE_STATUSES] },
      ...(params?.clinic && params.clinic !== 'all'
        ? { CLINIC: params.clinic }
        : {}),
      ...(params?.priority && params.priority !== 'all'
        ? { PRIORITY: params.priority }
        : {}),
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
            ],
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.triage.findMany({
        where,
        orderBy: [{ PRIORITY: 'asc' }, { ARRIVAL_AT: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
        include: {
          person: {
            include: {
              cards: { orderBy: { CREATED_DATE: 'desc' }, take: 1 },
            },
          },
        },
      }),
      this.prisma.triage.count({ where }),
    ]);

    const personIds = [...new Set(rows.map((r) => r.PERSON_ID))];
    const lastVisitMap = await this.lastCompletedVisitByPerson(personIds);

    const items = rows.map((t) =>
      this.toQueueItem(t, lastVisitMap.get(t.PERSON_ID) ?? null),
    );
    const summary = {
      waiting: total,
      paymentBlocked: items.filter((i) => !i.paymentCleared).length,
      canStart: items.filter((i) => i.canStart).length,
    };

    return {
      asOf: new Date().toISOString(),
      summary,
      items,
      meta: { page, limit, total },
    };
  }

  async listActive(actor: AuthUser, params?: { page?: number; limit?: number }) {
    const page = Math.max(params?.page ?? 1, 1);
    const limit = Math.min(Math.max(params?.limit ?? 50, 1), 100);
    const where: Prisma.EncountersWhereInput = {
      DOCTOR_ID: actor.id,
      STATUS: 'In Consultation',
    };
    try {
      const [rows, total] = await Promise.all([
        this.prisma.encounters.findMany({
          where,
          orderBy: { STARTED_AT: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
          include: this.encounterInclude(),
        }),
        this.prisma.encounters.count({ where }),
      ]);

      const personIds = [...new Set(rows.map((r) => r.PERSON_ID))];
      const lastVisitMap = await this.lastCompletedVisitByPerson(personIds);

      return {
        items: rows.map((e) =>
          this.toEncounterResponse(e, lastVisitMap.get(e.PERSON_ID) ?? null),
        ),
        meta: { page, limit, total },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (
        /ENCOUNTERS/i.test(message) &&
        /(does not exist|Unknown column|column .* does not exist)/i.test(message)
      ) {
        throw new ServiceUnavailableException(
          'Encounters schema is not applied on this database. Run: npx prisma migrate deploy',
        );
      }
      throw err;
    }
  }

  async start(dto: StartEncounterDto, actor: AuthUser) {
    const triage = await this.prisma.triage.findUnique({
      where: { TRIAGE_ID: dto.triageId },
      include: {
        person: true,
        encounters: true,
      },
    });
    if (!triage) throw new NotFoundException('Triage record not found');
    if (triage.person.DISCONTINUE_FLAG === 'Y') {
      throw new NotFoundException('Person not found');
    }
    if (!QUEUE_STATUSES.includes(triage.STATUS as (typeof QUEUE_STATUSES)[number])) {
      throw new BadRequestException(
        `Patient is not awaiting consultation (status: ${triage.STATUS})`,
      );
    }
    if (triage.encounters) {
      throw new ConflictException({
        message: 'Consultation already started for this triage visit',
        encounterId: triage.encounters.ENCOUNTER_ID,
      });
    }

    await this.cards.assertPaymentCleared(triage.PERSON_ID);

    const actorLabel = actorLabelOf(actor);
    const now = new Date();

    const encounter = await this.prisma.$transaction(async (tx) => {
      await tx.triage.update({
        where: { TRIAGE_ID: triage.TRIAGE_ID },
        data: {
          STATUS: 'In Consultation',
          ...(dto.clinic ? { CLINIC: dto.clinic } : {}),
          UPDATED_BY_ID: actor.id,
          UPDATED_BY: actorLabel,
          UPDATED_DATE: now,
        },
      });

      return tx.encounters.create({
        data: {
          PERSON_ID: triage.PERSON_ID,
          TRIAGE_ID: triage.TRIAGE_ID,
          DOCTOR_ID: actor.id,
          STATUS: 'In Consultation',
          VERSION: 1,
          STARTED_AT: now,
          CREATED_BY_ID: actor.id,
          CREATED_BY: actorLabel,
          CREATED_DATE: now,
        },
        include: this.encounterInclude(),
      });
    });

    await this.audit.log({
      type: 'encounter:start',
      entity: 'encounter',
      entityId: encounter.ENCOUNTER_ID,
      personId: triage.PERSON_ID,
      userId: actor.id,
      createdBy: actorLabel,
      item: `Consultation started for triage ${triage.QUEUE_NO}`,
      newValue: {
        encounterId: encounter.ENCOUNTER_ID,
        triageId: triage.TRIAGE_ID,
        doctorId: actor.id,
      },
    });

    const lastVisit = await this.lastCompletedVisitByPerson([triage.PERSON_ID]);
    return this.toEncounterResponse(
      encounter,
      lastVisit.get(triage.PERSON_ID) ?? null,
    );
  }

  async findOne(id: number) {
    const encounter = await this.prisma.encounters.findUnique({
      where: { ENCOUNTER_ID: id },
      include: this.encounterInclude(),
    });
    if (!encounter) throw new NotFoundException('Encounter not found');
    const lastVisit = await this.lastCompletedVisitByPerson([
      encounter.PERSON_ID,
    ]);
    return this.toEncounterResponse(
      encounter,
      lastVisit.get(encounter.PERSON_ID) ?? null,
    );
  }

  async updateDraft(id: number, dto: UpdateEncounterDto, actor: AuthUser) {
    const existing = await this.prisma.encounters.findUnique({
      where: { ENCOUNTER_ID: id },
    });
    if (!existing) throw new NotFoundException('Encounter not found');
    if (existing.STATUS !== 'In Consultation') {
      throw new BadRequestException('Only in-progress consultations can be edited');
    }

    if (dto.idempotencyKey) {
      const cached = this.idempotency.get(dto.idempotencyKey);
      if (cached && cached.encounterId === id) {
        return this.findOne(id);
      }
    }

    if (dto.version != null && dto.version !== existing.VERSION) {
      throw new ConflictException({
        message: 'Encounter was updated elsewhere — refresh and retry',
        currentVersion: existing.VERSION,
        providedVersion: dto.version,
      });
    }

    const actorLabel = actorLabelOf(actor);
    const updated = await this.prisma.encounters.update({
      where: { ENCOUNTER_ID: id },
      data: {
        ...(dto.chiefComplaint !== undefined
          ? { CHIEF_COMPLAINT: dto.chiefComplaint }
          : {}),
        ...(dto.history !== undefined ? { HISTORY: dto.history } : {}),
        ...(dto.examination !== undefined
          ? { EXAMINATION: dto.examination }
          : {}),
        ...(dto.assessment !== undefined ? { ASSESSMENT: dto.assessment } : {}),
        ...(dto.plan !== undefined ? { PLAN: dto.plan } : {}),
        ...(dto.pastMedicalHistory !== undefined
          ? { PAST_MEDICAL_HISTORY: dto.pastMedicalHistory }
          : {}),
        ...(dto.drugHistory !== undefined
          ? { DRUG_HISTORY: dto.drugHistory }
          : {}),
        ...(dto.allergyHistory !== undefined
          ? { ALLERGY_HISTORY: dto.allergyHistory }
          : {}),
        ...(dto.familyHistory !== undefined
          ? { FAMILY_HISTORY: dto.familyHistory }
          : {}),
        ...(dto.socialHistory !== undefined
          ? { SOCIAL_HISTORY: dto.socialHistory }
          : {}),
        ...(dto.followUpPlan !== undefined
          ? { FOLLOW_UP_PLAN: dto.followUpPlan }
          : {}),
        VERSION: existing.VERSION + 1,
        UPDATED_BY_ID: actor.id,
        UPDATED_BY: actorLabel,
        UPDATED_DATE: new Date(),
      },
      include: this.encounterInclude(),
    });

    if (dto.idempotencyKey) {
      this.idempotency.set(dto.idempotencyKey, {
        encounterId: id,
        version: updated.VERSION,
        at: Date.now(),
      });
    }

    await this.audit.log({
      type: 'encounter:update',
      entity: 'encounter',
      entityId: id,
      personId: existing.PERSON_ID,
      userId: actor.id,
      createdBy: actorLabel,
      item: `Encounter draft autosaved (v${updated.VERSION})`,
      newValue: { version: updated.VERSION },
    });

    const lastVisit = await this.lastCompletedVisitByPerson([
      existing.PERSON_ID,
    ]);
    return this.toEncounterResponse(
      updated,
      lastVisit.get(existing.PERSON_ID) ?? null,
    );
  }

  async complete(
    id: number,
    dto: CompleteEncounterDto,
    actor: AuthUser,
  ) {
    const existing = await this.prisma.encounters.findUnique({
      where: { ENCOUNTER_ID: id },
      include: { triage: true },
    });
    if (!existing) throw new NotFoundException('Encounter not found');
    if (existing.STATUS !== 'In Consultation') {
      throw new BadRequestException('Encounter is not in consultation');
    }

    const actorLabel = actorLabelOf(actor);
    const now = new Date();
    const outcome = dto.outcome?.trim() || 'Completed';

    const encounter = await this.prisma.$transaction(async (tx) => {
      await tx.triage.update({
        where: { TRIAGE_ID: existing.TRIAGE_ID },
        data: {
          UPDATED_BY_ID: actor.id,
          UPDATED_BY: actorLabel,
          UPDATED_DATE: now,
        },
      });

      return tx.encounters.update({
        where: { ENCOUNTER_ID: id },
        data: {
          STATUS: 'Completed',
          OUTCOME: outcome,
          COMPLETED_AT: now,
          UPDATED_BY_ID: actor.id,
          UPDATED_BY: actorLabel,
          UPDATED_DATE: now,
        },
        include: this.encounterInclude(),
      });
    });

    await this.audit.log({
      type: 'encounter:complete',
      entity: 'encounter',
      entityId: id,
      personId: existing.PERSON_ID,
      userId: actor.id,
      createdBy: actorLabel,
      item: `Consultation completed — ${outcome}`,
      newValue: { outcome, completedAt: now.toISOString() },
    });

    const lastVisit = await this.lastCompletedVisitByPerson([
      existing.PERSON_ID,
    ]);
    return this.toEncounterResponse(
      encounter,
      lastVisit.get(existing.PERSON_ID) ?? null,
    );
  }

  /**
   * Aggregated clinical context for queue eye-view and active consultation panels.
   */
  async clinicalSummary(personId: number, triageId?: number) {
    const person = await this.patients.findById(personId);

    let triage = triageId
      ? await this.prisma.triage.findFirst({
          where: { TRIAGE_ID: triageId, PERSON_ID: personId },
        })
      : null;
    if (!triage) {
      triage = await this.prisma.triage.findFirst({
        where: {
          PERSON_ID: personId,
          STATUS: {
            in: [
              'Waiting',
              'In Triage',
              'Triage Completed',
              'Sent to Consultation',
              'In Consultation',
            ],
          },
        },
        orderBy: { ARRIVAL_AT: 'desc' },
      });
    }

    const card = await this.prisma.patientCards.findFirst({
      where: { PERSON_ID: personId },
      orderBy: { CREATED_DATE: 'desc' },
    });

    const [completedEncounters, rxResult, inProgress] = await Promise.all([
      this.prisma.encounters.findMany({
        where: { PERSON_ID: personId, STATUS: 'Completed' },
        orderBy: { COMPLETED_AT: 'desc' },
        take: 10,
        include: {
          doctor: {
            select: {
              USER_ID: true,
              FIRST_NAME: true,
              LAST_NAME: true,
              EMAIL_ADDRESS: true,
            },
          },
          triage: { select: { CLINIC: true, PRIORITY: true } },
        },
      }),
      this.prescriptions.list({ personId, page: 1, limit: 20 }),
      this.prisma.encounters.findFirst({
        where: { PERSON_ID: personId, STATUS: 'In Consultation' },
        orderBy: { STARTED_AT: 'desc' },
      }),
    ]);

    const allergies: string[] = [];
    if (inProgress?.ALLERGY_HISTORY?.trim()) {
      allergies.push(inProgress.ALLERGY_HISTORY.trim());
    }
    for (const rx of rxResult.items) {
      if (rx.allergiesNote?.trim() && !allergies.includes(rx.allergiesNote.trim())) {
        allergies.push(rx.allergiesNote.trim());
      }
    }

    const activeMedStatuses = new Set([
      'Pending',
      'Sent',
      'Ready',
      'Partially Dispensed',
      'Dispensed',
    ]);
    const activeMeds: Array<{
      drugName: string;
      dose: string | null;
      frequency: string | null;
      status: string;
      rxNo: string;
    }> = [];
    for (const rx of rxResult.items) {
      if (!activeMedStatuses.has(rx.status)) continue;
      for (const item of rx.items) {
        activeMeds.push({
          drugName: item.drugName,
          dose: item.dose,
          frequency: item.frequency,
          status: rx.status,
          rxNo: rx.rxNo,
        });
      }
    }

    const previousDiagnoses: Array<{
      label: string;
      source: string;
      date: string | null;
    }> = [];
    for (const enc of completedEncounters) {
      if (enc.ASSESSMENT?.trim()) {
        previousDiagnoses.push({
          label: enc.ASSESSMENT.trim(),
          source: 'Encounter assessment',
          date: enc.COMPLETED_AT?.toISOString() ?? enc.STARTED_AT.toISOString(),
        });
      } else if (enc.OUTCOME?.trim()) {
        previousDiagnoses.push({
          label: enc.OUTCOME.trim(),
          source: 'Encounter outcome',
          date: enc.COMPLETED_AT?.toISOString() ?? enc.STARTED_AT.toISOString(),
        });
      }
    }
    for (const rx of rxResult.items) {
      if (rx.diagnosis?.trim()) {
        previousDiagnoses.push({
          label: rx.diagnosis.trim(),
          source: `Prescription ${rx.rxNo}`,
          date: rx.createdAt,
        });
      }
    }

    const latestCompleted = completedEncounters[0] ?? null;
    const historySnippets = latestCompleted
      ? {
          pastMedicalHistory: latestCompleted.PAST_MEDICAL_HISTORY ?? '',
          drugHistory: latestCompleted.DRUG_HISTORY ?? '',
          allergyHistory: latestCompleted.ALLERGY_HISTORY ?? '',
          familyHistory: latestCompleted.FAMILY_HISTORY ?? '',
          socialHistory: latestCompleted.SOCIAL_HISTORY ?? '',
        }
      : {
          pastMedicalHistory: '',
          drugHistory: '',
          allergyHistory: '',
          familyHistory: '',
          socialHistory: '',
        };

    const recentNotes = completedEncounters.slice(0, 5).map((enc) => {
      const note = mapNote(enc);
      const doctorName = enc.doctor
        ? [enc.doctor.FIRST_NAME, enc.doctor.LAST_NAME]
            .filter(Boolean)
            .join(' ') ||
          enc.doctor.EMAIL_ADDRESS ||
          `User ${enc.DOCTOR_ID}`
        : `User ${enc.DOCTOR_ID}`;
      return {
        encounterId: enc.ENCOUNTER_ID,
        status: enc.STATUS,
        doctorName,
        clinic: enc.triage?.CLINIC ?? null,
        startedAt: enc.STARTED_AT.toISOString(),
        completedAt: enc.COMPLETED_AT?.toISOString() ?? null,
        outcome: enc.OUTCOME,
        summary: noteSummary(note),
        note,
      };
    });

    const lastVisit =
      latestCompleted?.COMPLETED_AT?.toISOString().slice(0, 10) ??
      latestCompleted?.STARTED_AT.toISOString().slice(0, 10) ??
      null;

    return {
      personId,
      demographics: {
        name:
          [person.firstName, person.middleName, person.lastName]
            .filter(Boolean)
            .join(' ') || 'Unknown',
        mrn: person.hospitalNo || `PERSON_${personId}`,
        age: ageYears(person.dateOfBirth ? new Date(person.dateOfBirth) : null),
        sex: person.sex,
        dateOfBirth: person.dateOfBirth,
        phone: person.patientPhoneNo,
        email: person.email,
        bloodGroup: person.bloodGroup,
        nhisNo: person.nhisNo,
        address: person.residentialAddress,
        nextOfKin: {
          name: person.nameOfNextOfKin,
          relationship: person.relationship,
          phone: person.telephoneOfNextOfKin,
        },
      },
      payment: {
        status: card?.PAYMENT_STATUS ?? null,
        cardNo: card?.CARD_NO ?? null,
        display: mapPaymentDisplay(
          { NHIS_NO: person.nhisNo, HMO_ID: null },
          card,
        ),
        cleared: !card || card.PAYMENT_STATUS !== 'Pending',
      },
      currentVisit: triage
        ? {
            triageId: triage.TRIAGE_ID,
            queueNo: triage.QUEUE_NO,
            clinic: triage.CLINIC,
            status: triage.STATUS,
            priority: triage.PRIORITY,
            patientType: triage.PATIENT_TYPE,
            arrivalAt: triage.ARRIVAL_AT.toISOString(),
            notes: triage.NOTES,
          }
        : null,
      vitals: mapVitals(triage),
      allergies,
      activeMeds,
      previousDiagnoses,
      historySnippets,
      recentNotes,
      lastVisit,
    };
  }

  async listPatientNotes(
    personId: number,
    params?: { page?: number; limit?: number },
  ) {
    await this.patients.findById(personId);
    const page = Math.max(params?.page ?? 1, 1);
    const limit = Math.min(Math.max(params?.limit ?? 20, 1), 100);
    const where: Prisma.EncountersWhereInput = { PERSON_ID: personId };

    const [rows, total] = await Promise.all([
      this.prisma.encounters.findMany({
        where,
        orderBy: [{ STARTED_AT: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        include: {
          doctor: {
            select: {
              USER_ID: true,
              FIRST_NAME: true,
              LAST_NAME: true,
              EMAIL_ADDRESS: true,
            },
          },
          triage: {
            select: {
              QUEUE_NO: true,
              CLINIC: true,
              PRIORITY: true,
              PATIENT_TYPE: true,
            },
          },
        },
      }),
      this.prisma.encounters.count({ where }),
    ]);

    const items = rows.map((enc) => {
      const note = mapNote(enc);
      const doctorName = enc.doctor
        ? [enc.doctor.FIRST_NAME, enc.doctor.LAST_NAME]
            .filter(Boolean)
            .join(' ') ||
          enc.doctor.EMAIL_ADDRESS ||
          `User ${enc.DOCTOR_ID}`
        : `User ${enc.DOCTOR_ID}`;
      return {
        encounterId: enc.ENCOUNTER_ID,
        personId: enc.PERSON_ID,
        triageId: enc.TRIAGE_ID,
        status: enc.STATUS,
        doctorId: enc.DOCTOR_ID,
        doctorName,
        clinic: enc.triage?.CLINIC ?? null,
        priority: enc.triage?.PRIORITY ?? null,
        visit: mapVisit(enc.triage?.PATIENT_TYPE),
        queueNo: enc.triage?.QUEUE_NO ?? null,
        startedAt: enc.STARTED_AT.toISOString(),
        completedAt: enc.COMPLETED_AT?.toISOString() ?? null,
        outcome: enc.OUTCOME,
        version: enc.VERSION,
        summary: noteSummary(note),
        note,
      };
    });

    return { items, meta: { page, limit, total } };
  }

  private encounterInclude() {
    return {
      person: {
        include: {
          cards: { orderBy: { CREATED_DATE: 'desc' as const }, take: 1 },
        },
      },
      triage: true,
      doctor: {
        select: {
          USER_ID: true,
          FIRST_NAME: true,
          LAST_NAME: true,
          EMAIL_ADDRESS: true,
        },
      },
    };
  }

  private async lastCompletedVisitByPerson(
    personIds: number[],
  ): Promise<Map<number, string>> {
    const map = new Map<number, string>();
    if (personIds.length === 0) return map;
    const rows = await this.prisma.encounters.findMany({
      where: {
        PERSON_ID: { in: personIds },
        STATUS: 'Completed',
      },
      orderBy: { COMPLETED_AT: 'desc' },
      select: {
        PERSON_ID: true,
        COMPLETED_AT: true,
        STARTED_AT: true,
      },
    });
    for (const row of rows) {
      if (map.has(row.PERSON_ID)) continue;
      const d = row.COMPLETED_AT ?? row.STARTED_AT;
      map.set(row.PERSON_ID, d.toISOString().slice(0, 10));
    }
    return map;
  }

  private toQueueItem(
    t: {
      TRIAGE_ID: number;
      PERSON_ID: number;
      QUEUE_NO: string;
      CLINIC: string | null;
      STATUS: string;
      PRIORITY: string;
      PATIENT_TYPE: string | null;
      ARRIVAL_AT: Date;
    } & TriageVitalsFields,
    lastVisit: string | null,
  ) {
    const person = (
      t as unknown as {
        person: {
          HOSPITAL_NO: string | null;
          FIRST_NAME: string | null;
          MIDDLE_NAME: string | null;
          LAST_NAME: string | null;
          SEX: string | null;
          DATE_OF_BIRTH: Date | null;
          NHIS_NO: string | null;
          HMO_ID: number | null;
          cards: Array<{ PAYMENT_STATUS: string | null }>;
        };
      }
    ).person;
    const card = person.cards[0] ?? null;
    const paymentCleared = !card || card.PAYMENT_STATUS !== 'Pending';
    const waitMs = Date.now() - t.ARRIVAL_AT.getTime();
    const waitMinutes = Math.max(0, Math.floor(waitMs / 60_000));
    const sex = (person.SEX || '').toUpperCase().startsWith('F')
      ? 'F'
      : (person.SEX || '').toUpperCase().startsWith('M')
        ? 'M'
        : person.SEX || '';
    const vitals = mapVitals(t);

    return {
      triageId: t.TRIAGE_ID,
      personId: t.PERSON_ID,
      queueNo: t.QUEUE_NO,
      name: personName(person),
      mrn: person.HOSPITAL_NO || `PERSON_${t.PERSON_ID}`,
      age: ageYears(person.DATE_OF_BIRTH),
      sex,
      clinic: t.CLINIC || 'General OPD',
      visit: mapVisit(t.PATIENT_TYPE),
      arrival: t.ARRIVAL_AT.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      }),
      arrivalAt: t.ARRIVAL_AT.toISOString(),
      waitMinutes,
      wait: `${waitMinutes} mins`,
      priority: t.PRIORITY,
      paymentStatus: mapPaymentDisplay(person, card),
      paymentCleared,
      vitalsStatus: vitals.status,
      vitals,
      lastVisit,
      canStart: paymentCleared,
      triageStatus: t.STATUS,
    };
  }

  private toEncounterResponse(
    e: {
      ENCOUNTER_ID: number;
      PERSON_ID: number;
      TRIAGE_ID: number;
      DOCTOR_ID: number;
      STATUS: string;
      CHIEF_COMPLAINT: string | null;
      HISTORY: string | null;
      EXAMINATION: string | null;
      ASSESSMENT: string | null;
      PLAN: string | null;
      PAST_MEDICAL_HISTORY?: string | null;
      DRUG_HISTORY?: string | null;
      ALLERGY_HISTORY?: string | null;
      FAMILY_HISTORY?: string | null;
      SOCIAL_HISTORY?: string | null;
      FOLLOW_UP_PLAN?: string | null;
      VERSION: number;
      STARTED_AT: Date;
      COMPLETED_AT: Date | null;
      OUTCOME: string | null;
      person: {
        HOSPITAL_NO: string | null;
        FIRST_NAME: string | null;
        MIDDLE_NAME: string | null;
        LAST_NAME: string | null;
        SEX: string | null;
        DATE_OF_BIRTH: Date | null;
        NHIS_NO: string | null;
        HMO_ID: number | null;
        cards: Array<{ PAYMENT_STATUS: string | null }>;
      };
      triage: {
        QUEUE_NO: string;
        CLINIC: string | null;
        PRIORITY: string;
        PATIENT_TYPE: string | null;
        ARRIVAL_AT: Date;
        STATUS: string;
      } & TriageVitalsFields;
      doctor?: {
        USER_ID: number;
        FIRST_NAME: string | null;
        LAST_NAME: string | null;
        EMAIL_ADDRESS: string | null;
      } | null;
    },
    lastVisit: string | null,
  ) {
    const card = e.person.cards[0] ?? null;
    const sex = (e.person.SEX || '').toUpperCase().startsWith('F')
      ? 'F'
      : (e.person.SEX || '').toUpperCase().startsWith('M')
        ? 'M'
        : e.person.SEX || '';
    const doctorName = e.doctor
      ? [e.doctor.FIRST_NAME, e.doctor.LAST_NAME].filter(Boolean).join(' ') ||
        e.doctor.EMAIL_ADDRESS ||
        `User ${e.DOCTOR_ID}`
      : `User ${e.DOCTOR_ID}`;
    const vitals = mapVitals(e.triage);

    return {
      encounterId: e.ENCOUNTER_ID,
      personId: e.PERSON_ID,
      triageId: e.TRIAGE_ID,
      doctorId: e.DOCTOR_ID,
      doctorName,
      status: e.STATUS,
      version: e.VERSION,
      startedAt: e.STARTED_AT.toISOString(),
      completedAt: e.COMPLETED_AT?.toISOString() ?? null,
      outcome: e.OUTCOME,
      note: mapNote(e),
      patient: {
        name: personName(e.person),
        mrn: e.person.HOSPITAL_NO || `PERSON_${e.PERSON_ID}`,
        age: ageYears(e.person.DATE_OF_BIRTH),
        sex,
        clinic: e.triage.CLINIC || 'General OPD',
        visit: mapVisit(e.triage.PATIENT_TYPE),
        priority: e.triage.PRIORITY,
        queueNo: e.triage.QUEUE_NO,
        arrival: e.triage.ARRIVAL_AT.toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        }),
        paymentStatus: mapPaymentDisplay(e.person, card),
        vitalsStatus: vitals.status,
        vitals,
        lastVisit,
      },
    };
  }
}
