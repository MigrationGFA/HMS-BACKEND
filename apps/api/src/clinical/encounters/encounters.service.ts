import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { CardsService } from '../../patients/cards.service';
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

function mapPaymentDisplay(person: {
  NHIS_NO?: string | null;
  HMO_ID?: number | null;
}, card?: { PAYMENT_STATUS?: string | null } | null): string {
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
}): 'Captured' | 'Pending' {
  if (
    t.WEIGHT_KG != null ||
    t.BLOOD_PRESSURE ||
    t.TEMPERATURE_C != null ||
    t.PULSE_BPM != null
  ) {
    return 'Captured';
  }
  return 'Pending';
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

    const items = rows.map((t) => this.toQueueItem(t));
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
    const [rows, total] = await Promise.all([
      this.prisma.encounters.findMany({
        where,
        orderBy: { STARTED_AT: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          person: {
            include: {
              cards: { orderBy: { CREATED_DATE: 'desc' }, take: 1 },
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
        },
      }),
      this.prisma.encounters.count({ where }),
    ]);

    return {
      items: rows.map((e) => this.toEncounterResponse(e)),
      meta: { page, limit, total },
    };
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
        include: {
          person: {
            include: {
              cards: { orderBy: { CREATED_DATE: 'desc' }, take: 1 },
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
        },
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

    return this.toEncounterResponse(encounter);
  }

  async findOne(id: number) {
    const encounter = await this.prisma.encounters.findUnique({
      where: { ENCOUNTER_ID: id },
      include: {
        person: {
          include: {
            cards: { orderBy: { CREATED_DATE: 'desc' }, take: 1 },
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
      },
    });
    if (!encounter) throw new NotFoundException('Encounter not found');
    return this.toEncounterResponse(encounter);
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
        VERSION: existing.VERSION + 1,
        UPDATED_BY_ID: actor.id,
        UPDATED_BY: actorLabel,
        UPDATED_DATE: new Date(),
      },
      include: {
        person: {
          include: {
            cards: { orderBy: { CREATED_DATE: 'desc' }, take: 1 },
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
      },
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

    return this.toEncounterResponse(updated);
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
        include: {
          person: {
            include: {
              cards: { orderBy: { CREATED_DATE: 'desc' }, take: 1 },
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
        },
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

    return this.toEncounterResponse(encounter);
  }

  private toQueueItem(t: {
    TRIAGE_ID: number;
    PERSON_ID: number;
    QUEUE_NO: string;
    CLINIC: string | null;
    STATUS: string;
    PRIORITY: string;
    PATIENT_TYPE: string | null;
    ARRIVAL_AT: Date;
    WEIGHT_KG: Prisma.Decimal | null;
    BLOOD_PRESSURE: string | null;
    TEMPERATURE_C: Prisma.Decimal | null;
    PULSE_BPM: number | null;
    person: {
      HOSPITAL_NO: string | null;
      FIRST_NAME: string | null;
      MIDDLE_NAME: string | null;
      LAST_NAME: string | null;
      SEX: string | null;
      DATE_OF_BIRTH: Date | null;
      NHIS_NO: string | null;
      HMO_ID: number | null;
      DATE_OF_REGISTRATION: Date | null;
      cards: Array<{ PAYMENT_STATUS: string | null }>;
    };
  }) {
    const card = t.person.cards[0] ?? null;
    const paymentCleared = !card || card.PAYMENT_STATUS !== 'Pending';
    const waitMs = Date.now() - t.ARRIVAL_AT.getTime();
    const waitMinutes = Math.max(0, Math.floor(waitMs / 60_000));
    const sex = (t.person.SEX || '').toUpperCase().startsWith('F')
      ? 'F'
      : (t.person.SEX || '').toUpperCase().startsWith('M')
        ? 'M'
        : t.person.SEX || '';

    return {
      triageId: t.TRIAGE_ID,
      personId: t.PERSON_ID,
      queueNo: t.QUEUE_NO,
      name: personName(t.person),
      mrn: t.person.HOSPITAL_NO || `PERSON_${t.PERSON_ID}`,
      age: ageYears(t.person.DATE_OF_BIRTH),
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
      paymentStatus: mapPaymentDisplay(t.person, card),
      paymentCleared,
      vitalsStatus: vitalsCaptured(t),
      lastVisit: t.person.DATE_OF_REGISTRATION
        ? t.person.DATE_OF_REGISTRATION.toISOString().slice(0, 10)
        : null,
      canStart: paymentCleared,
      triageStatus: t.STATUS,
    };
  }

  private toEncounterResponse(e: {
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
      WEIGHT_KG: Prisma.Decimal | null;
      BLOOD_PRESSURE: string | null;
      TEMPERATURE_C: Prisma.Decimal | null;
      PULSE_BPM: number | null;
    };
    doctor?: {
      USER_ID: number;
      FIRST_NAME: string | null;
      LAST_NAME: string | null;
      EMAIL_ADDRESS: string | null;
    } | null;
  }) {
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
      note: {
        chiefComplaint: e.CHIEF_COMPLAINT ?? '',
        history: e.HISTORY ?? '',
        examination: e.EXAMINATION ?? '',
        assessment: e.ASSESSMENT ?? '',
        plan: e.PLAN ?? '',
      },
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
        vitalsStatus: vitalsCaptured(e.triage),
      },
    };
  }
}
