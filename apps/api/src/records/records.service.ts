import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CardsService } from '../patients/cards.service';
import { PatientsService } from '../patients/patients.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { TriageService } from '../triage/triage.service';
import type { AuthUser } from '../auth/types/auth-user.type';
import type { CreatePersonDto } from '../patients/dto/create-person.dto';
import type { UpdatePersonDto } from '../patients/dto/update-person.dto';

/**
 * Records / front-desk workflows for Patient Entry Engine.
 * Reuses PatientsService + CardsService — no duplicated business logic.
 */
@Injectable()
export class RecordsService {
  constructor(
    private readonly patients: PatientsService,
    private readonly cards: CardsService,
    private readonly prisma: PrismaService,
    private readonly triage: TriageService,
    private readonly audit: AuditService,
  ) {}

  /** Create PERSONS + pending PATIENT_CARDS after Next of Kin (steps 1–3). */
  async createRegistration(dto: CreatePersonDto, actor?: AuthUser) {
    return this.patients.register(dto, actor);
  }

  /**
   * Live summary cards for Patient Entry Engine (/hms/identity).
   * Derived from PERSONS, PATIENT_CARDS, and TRIAGE (no duplicated counters).
   */
  async dashboardStats(params?: { timezoneOffsetMinutes?: number }) {
    const offsetMin = params?.timezoneOffsetMinutes ?? 60; // WAT default
    const now = new Date();
    const localMs = now.getTime() + offsetMin * 60_000;
    const local = new Date(localMs);
    const startLocal = new Date(
      Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()),
    );
    const startOfDay = new Date(startLocal.getTime() - offsetMin * 60_000);
    const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

    const todayPersons = {
      CREATED_DATE: { gte: startOfDay, lt: endOfDay },
    };
    const todayTriage = {
      ARRIVAL_AT: { gte: startOfDay, lt: endOfDay },
    };

    const [
      newToday,
      walkInToday,
      emergencyToday,
      returningToday,
      pendingRegistration,
      awaitingTriage,
      awaitingConsultation,
    ] = await Promise.all([
      this.prisma.persons.count({ where: todayPersons }),
      this.prisma.persons.count({
        where: {
          ...todayPersons,
          OR: [
            { REG_TYPE: { contains: 'Walk', mode: 'insensitive' } },
            { REG_TYPE: { equals: 'Walk-In' } },
            { REG_TYPE: { equals: 'Walk-In Patient' } },
          ],
        },
      }),
      this.prisma.persons.count({
        where: {
          ...todayPersons,
          OR: [
            { PATIENT_TYPE: { contains: 'Emergency', mode: 'insensitive' } },
            { REG_TYPE: { contains: 'Emergency', mode: 'insensitive' } },
          ],
        },
      }),
      this.prisma.triage.count({
        where: {
          ...todayTriage,
          OR: [
            { PATIENT_TYPE: { equals: 'Returning' } },
            { PATIENT_TYPE: { contains: 'Return', mode: 'insensitive' } },
          ],
        },
      }),
      this.prisma.patientCards.count({
        where: { PAYMENT_STATUS: 'Pending' },
      }),
      this.prisma.triage.count({
        where: { STATUS: 'Waiting' },
      }),
      this.prisma.triage.count({
        where: {
          STATUS: { in: ['Triage Completed', 'Sent to Consultation'] },
        },
      }),
    ]);

    const totalToday = newToday + returningToday;

    return {
      asOf: now.toISOString(),
      timezoneOffsetMinutes: offsetMin,
      totalToday,
      newToday,
      returningToday,
      walkInToday,
      emergencyToday,
      pendingRegistration,
      awaitingTriage,
      awaitingConsultation,
    };
  }

  /**
   * Queue for Patient Entry Engine:
   * - Pending: awaiting Accounts/Cashier payment
   * - Paid: payment done, Records can continue Medical → Complete
   */
  async registrationQueue(params?: {
    paymentStatus?: string;
    q?: string;
    page?: number;
    limit?: number;
  }) {
    return this.cards.list(params);
  }

  /** Check whether a registration card has been paid. */
  async paymentStatusByCardId(cardId: number) {
    const card = await this.cards.findById(cardId);
    return {
      card,
      paymentCleared: card.paymentStatus !== 'Pending',
    };
  }

  /** Check payment status for the latest card on a person. */
  async paymentStatusByPersonId(personId: number) {
    const card = await this.cards.latestForPerson(personId);
    if (!card) {
      throw new NotFoundException('No registration card found for this person');
    }
    return {
      card,
      paymentCleared: card.paymentStatus !== 'Pending',
    };
  }

  /** Load person + card for continuing registration from the queue. */
  async getRegistration(personId: number) {
    const person = await this.patients.findById(personId);
    const card = await this.cards.latestForPerson(personId);
    return {
      person,
      card,
      paymentCleared: !card || card.paymentStatus !== 'Pending',
    };
  }

  /** Complete registration after payment (medical/details + Active status). */
  async completeRegistration(
    personId: number,
    dto: UpdatePersonDto,
    actor?: AuthUser,
  ) {
    const card = await this.cards.latestForPerson(personId);
    if (card?.paymentStatus === 'Pending') {
      throw new ConflictException({
        message:
          'Card payment is pending — Accounts must confirm payment before registration can be completed',
        cardId: card.cardId,
        cardNo: card.cardNo,
        paymentStatus: card.paymentStatus,
      });
    }

    return this.patients.update(
      personId,
      { ...dto, status: dto.status ?? 'Active' },
      actor,
    );
  }

  /**
   * Patient Directory summary cards (/records/directory).
   * Different metrics from dashboard-stats (directory-wide, not today-only ops).
   */
  async directoryStats(params?: { timezoneOffsetMinutes?: number }) {
    const offsetMin = params?.timezoneOffsetMinutes ?? 60;
    const now = new Date();
    const localMs = now.getTime() + offsetMin * 60_000;
    const local = new Date(localMs);
    const startOfMonthLocal = new Date(
      Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1),
    );
    const startOfMonth = new Date(startOfMonthLocal.getTime() - offsetMin * 60_000);
    const base = { DISCONTINUE_FLAG: { not: 'Y' as const } };

    const [
      totalPatients,
      newThisMonth,
      active,
      inpatients,
      outpatients,
      hmoNhia,
      incompleteProfiles,
    ] = await Promise.all([
      this.prisma.persons.count({ where: base }),
      this.prisma.persons.count({
        where: { ...base, CREATED_DATE: { gte: startOfMonth } },
      }),
      this.prisma.persons.count({
        where: { ...base, STATUS: 'Active' },
      }),
      this.prisma.persons.count({
        where: {
          ...base,
          OR: [
            { PATIENT_TYPE: { contains: 'Inpatient', mode: 'insensitive' } },
            { PATIENT_TYPE: { contains: 'IPD', mode: 'insensitive' } },
            { REG_TYPE: { contains: 'Inpatient', mode: 'insensitive' } },
          ],
        },
      }),
      this.prisma.persons.count({
        where: {
          ...base,
          OR: [
            { PATIENT_TYPE: { contains: 'Out', mode: 'insensitive' } },
            { PATIENT_TYPE: { contains: 'OPD', mode: 'insensitive' } },
            { REG_TYPE: { contains: 'Walk', mode: 'insensitive' } },
            { REG_TYPE: { contains: 'Out', mode: 'insensitive' } },
          ],
        },
      }),
      this.prisma.persons.count({
        where: {
          ...base,
          OR: [
            { NHIS_NO: { not: null } },
            { HMO_ID: { not: null } },
          ],
        },
      }),
      this.prisma.persons.count({
        where: {
          ...base,
          STATUS: { in: ['Pending Payment', 'Incomplete'] },
        },
      }),
    ]);

    const phoneGroups = await this.prisma.persons.groupBy({
      by: ['PATIENT_PHONE_NO'],
      where: {
        ...base,
        PATIENT_PHONE_NO: { not: null },
      },
      _count: { _all: true },
    });
    const duplicatesFlagged = phoneGroups.filter((g) => g._count._all > 1).length;

    return {
      asOf: now.toISOString(),
      totalPatients,
      newThisMonth,
      active,
      inpatients,
      outpatients,
      hmoNhia,
      incompleteProfiles,
      duplicatesFlagged,
    };
  }

  /** Patient Directory list with search + gender/insurance filters. */
  async directory(params?: {
    q?: string;
    sex?: string;
    insurance?: string;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(params?.page ?? 1, 1);
    const limit = Math.min(Math.max(params?.limit ?? 50, 1), 100);
    const term = params?.q?.trim();
    const sex = params?.sex?.trim();
    const insurance = params?.insurance?.trim();

    const where: Record<string, unknown> = {
      DISCONTINUE_FLAG: { not: 'Y' },
      ...(sex && sex !== 'all' ? { SEX: sex } : {}),
      ...(insurance === 'NHIS'
        ? { NHIS_NO: { not: null } }
        : insurance === 'HMO'
          ? { HMO_ID: { not: null } }
          : insurance === 'Private'
            ? { NHIS_NO: null, HMO_ID: null }
            : {}),
      ...(term
        ? {
            OR: [
              { HOSPITAL_NO: { contains: term, mode: 'insensitive' } },
              { FIRST_NAME: { contains: term, mode: 'insensitive' } },
              { LAST_NAME: { contains: term, mode: 'insensitive' } },
              { MIDDLE_NAME: { contains: term, mode: 'insensitive' } },
              { PATIENT_PHONE_NO: { contains: term } },
              { IDENTITY_NO: { contains: term } },
              { NHIS_NO: { contains: term } },
              { E_MAIL: { contains: term, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.persons.findMany({
        where,
        orderBy: { CREATED_DATE: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.persons.count({ where }),
    ]);

    return {
      items: rows.map((r) => this.toDirectoryItem(r)),
      meta: { page, limit, total },
    };
  }

  /**
   * Records Audit Trail (/records/audit) with search + type filter.
   * Reuses AUDITS table — no duplicate audit store.
   */
  async auditTrail(params?: {
    q?: string;
    type?: string;
    status?: string;
    page?: number;
    limit?: number;
    timezoneOffsetMinutes?: number;
  }) {
    const page = Math.max(params?.page ?? 1, 1);
    const limit = Math.min(Math.max(params?.limit ?? 50, 1), 200);
    const term = params?.q?.trim();
    const type = params?.type?.trim();
    const status = params?.status?.trim();

    const where: Record<string, unknown> = {
      ...(type && type !== 'all' ? { AUDIT_TYPE: type } : {}),
      ...(status && status !== 'all' ? { STATUS: status } : {}),
      ...(term
        ? {
            OR: [
              { CREATED_BY: { contains: term, mode: 'insensitive' } },
              { ITEM: { contains: term, mode: 'insensitive' } },
              { AUDIT_TYPE: { contains: term, mode: 'insensitive' } },
              { ENTITY: { contains: term, mode: 'insensitive' } },
              { ENTITY_ID: { contains: term } },
              { NEW_VALUE: { contains: term, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.audits.findMany({
        where,
        include: {
          user: {
            include: { role: true },
          },
        },
        orderBy: { CREATE_DATE: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.audits.count({ where }),
    ]);

    // Resolve hospital no / patient name for PERSON_ID references
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
            },
          });
    const personMap = new Map(persons.map((p) => [p.PERSON_ID, p]));

    return {
      items: rows.map((r) => {
        const person = r.PERSON_ID != null ? personMap.get(r.PERSON_ID) : null;
        const officer =
          [r.user?.FIRST_NAME, r.user?.LAST_NAME].filter(Boolean).join(' ') ||
          r.CREATED_BY ||
          'System';
        return {
          auditId: r.AUDIT_ID,
          time: r.CREATE_DATE?.toISOString() ?? null,
          officer,
          role: r.user?.role?.ROLE_NAME ?? 'Staff',
          action: r.AUDIT_TYPE ?? r.ITEM ?? 'Activity',
          item: r.ITEM,
          type: r.AUDIT_TYPE,
          hospitalId: person?.HOSPITAL_NO ?? (r.ENTITY_ID || '-'),
          patient: person
            ? [person.FIRST_NAME, person.LAST_NAME].filter(Boolean).join(' ') ||
              '-'
            : '-',
          personId: r.PERSON_ID,
          module: r.ENTITY ?? this.moduleFromAuditType(r.AUDIT_TYPE),
          status: r.STATUS ?? 'Success',
          newValue: r.NEW_VALUE,
          oldValue: r.OLD_VALUE,
          userId: r.USER_ID,
        };
      }),
      meta: { page, limit, total },
    };
  }

  /** Summary cards for Records Audit Trail page. */
  async auditStats(params?: { timezoneOffsetMinutes?: number }) {
    const offsetMin = params?.timezoneOffsetMinutes ?? 60;
    const now = new Date();
    const localMs = now.getTime() + offsetMin * 60_000;
    const local = new Date(localMs);
    const startLocal = new Date(
      Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()),
    );
    const startOfDay = new Date(startLocal.getTime() - offsetMin * 60_000);
    const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);
    const today = { CREATE_DATE: { gte: startOfDay, lt: endOfDay } };

    const [
      activitiesToday,
      created,
      edited,
      uploaded,
      printed,
      deleted,
      suspicious,
    ] = await Promise.all([
      this.prisma.audits.count({ where: today }),
      this.prisma.audits.count({
        where: { ...today, AUDIT_TYPE: { contains: 'create', mode: 'insensitive' } },
      }),
      this.prisma.audits.count({
        where: {
          ...today,
          OR: [
            { AUDIT_TYPE: { contains: 'update', mode: 'insensitive' } },
            { AUDIT_TYPE: { contains: 'edit', mode: 'insensitive' } },
          ],
        },
      }),
      this.prisma.audits.count({
        where: {
          ...today,
          OR: [
            { AUDIT_TYPE: { contains: 'upload', mode: 'insensitive' } },
            { ENTITY: { contains: 'document', mode: 'insensitive' } },
          ],
        },
      }),
      this.prisma.audits.count({
        where: {
          ...today,
          AUDIT_TYPE: { contains: 'print', mode: 'insensitive' },
        },
      }),
      this.prisma.audits.count({
        where: {
          ...today,
          OR: [
            { AUDIT_TYPE: { contains: 'delete', mode: 'insensitive' } },
            { AUDIT_TYPE: { contains: 'archive', mode: 'insensitive' } },
          ],
        },
      }),
      this.prisma.audits.count({
        where: {
          OR: [
            { STATUS: { equals: 'Flagged' } },
            { STATUS: { equals: 'Suspicious' } },
            { STATUS: { contains: 'fail', mode: 'insensitive' } },
          ],
        },
      }),
    ]);

    return {
      asOf: now.toISOString(),
      activitiesToday,
      created,
      edited,
      uploaded,
      printed,
      deleted,
      suspicious,
    };
  }

  private moduleFromAuditType(type: string | null): string {
    if (!type) return 'Records';
    if (type.startsWith('person')) return 'Patient Entry';
    if (type.startsWith('card')) return 'Cards';
    if (type.startsWith('triage')) return 'Triage';
    if (type.startsWith('auth')) return 'Auth';
    if (type.startsWith('document')) return 'Documents';
    if (type.startsWith('arrival')) return 'Arrivals';
    return 'Records';
  }

  // ---------------------------------------------------------------------------
  // Patient Arrival / Check-In (/records/arrivals)
  // ---------------------------------------------------------------------------

  async arrivals(params?: {
    q?: string;
    type?: string;
    routing?: string;
    page?: number;
    limit?: number;
    timezoneOffsetMinutes?: number;
  }) {
    const offsetMin = params?.timezoneOffsetMinutes ?? 60;
    const { startOfDay, endOfDay } = this.dayBounds(offsetMin);
    const page = Math.max(params?.page ?? 1, 1);
    const limit = Math.min(Math.max(params?.limit ?? 50, 1), 200);
    const q = params?.q?.trim()?.toLowerCase();
    const typeFilter =
      params?.type && params.type !== 'all' ? params.type : undefined;
    const routingFilter =
      params?.routing && params.routing !== 'all'
        ? params.routing
        : undefined;

    const triageRows = await this.prisma.triage.findMany({
      where: {
        ARRIVAL_AT: { gte: startOfDay, lt: endOfDay },
        STATUS: { not: 'Cancelled' },
      },
      include: {
        person: {
          include: {
            cards: { orderBy: { CREATED_DATE: 'desc' }, take: 1 },
          },
        },
      },
      orderBy: { ARRIVAL_AT: 'desc' },
    });

    const triagePersonIds = new Set(triageRows.map((t) => t.PERSON_ID));

    // Paid / Active registrations today that have not been checked into triage yet
    const pendingCheckIn = await this.prisma.persons.findMany({
      where: {
        CREATED_DATE: { gte: startOfDay, lt: endOfDay },
        DISCONTINUE_FLAG: { not: 'Y' },
        PERSON_ID: { notIn: [...triagePersonIds] },
        cards: {
          some: {
            PAYMENT_STATUS: { in: ['Paid', 'Waived'] },
          },
        },
      },
      include: {
        cards: { orderBy: { CREATED_DATE: 'desc' }, take: 1 },
        triage: {
          where: { ARRIVAL_AT: { gte: startOfDay, lt: endOfDay } },
          take: 1,
        },
      },
      orderBy: { CREATED_DATE: 'desc' },
      take: 200,
    });

    const items = [
      ...triageRows.map((t) => this.toArrivalFromTriage(t)),
      ...pendingCheckIn
        .filter((p) => p.triage.length === 0)
        .map((p) => this.toArrivalFromPerson(p)),
    ];

    let filtered = items;
    if (typeFilter) {
      filtered = filtered.filter((r) => r.type === typeFilter);
    }
    const wantCheckedOut =
      routingFilter === 'Checked Out' ||
      routingFilter === 'checkedout' ||
      routingFilter === 'CheckedOut';

    if (routingFilter && !wantCheckedOut) {
      filtered = filtered.filter((r) => r.routing === routingFilter);
    }
    if (q) {
      filtered = filtered.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          r.hospitalId.toLowerCase().includes(q) ||
          r.arrivalNo.toLowerCase().includes(q),
      );
    }

    // Include cancelled (checked out) from today for the checked-out tab
    if (wantCheckedOut || !routingFilter) {
      const checkedOut = await this.prisma.triage.findMany({
        where: {
          ARRIVAL_AT: { gte: startOfDay, lt: endOfDay },
          STATUS: 'Cancelled',
        },
        include: {
          person: {
            include: {
              cards: { orderBy: { CREATED_DATE: 'desc' }, take: 1 },
            },
          },
        },
        orderBy: { UPDATED_DATE: 'desc' },
      });
      const checkoutRows = checkedOut.map((t) => this.toArrivalFromTriage(t));
      if (wantCheckedOut) {
        filtered = checkoutRows.filter(
          (r) =>
            !q ||
            r.name.toLowerCase().includes(q) ||
            r.hospitalId.toLowerCase().includes(q) ||
            r.arrivalNo.toLowerCase().includes(q),
        );
        if (typeFilter) {
          filtered = filtered.filter((r) => r.type === typeFilter);
        }
      } else if (!typeFilter) {
        // merge checked out into all view
        const existing = new Set(filtered.map((r) => r.arrivalNo));
        for (const row of checkoutRows) {
          if (!existing.has(row.arrivalNo)) filtered.push(row);
        }
      }
    }

    const summary = {
      total: items.length + (await this.prisma.triage.count({
        where: {
          ARRIVAL_AT: { gte: startOfDay, lt: endOfDay },
          STATUS: 'Cancelled',
        },
      })),
      walkIn: items.filter((r) => r.type === 'Walk-In').length,
      appointment: items.filter((r) => r.type === 'Appointment').length,
      referral: items.filter((r) => r.type === 'Referral').length,
      emergency: items.filter((r) => r.type === 'Emergency').length,
      awaitingTriage: items.filter((r) => r.routing === 'Awaiting Triage')
        .length,
      awaitingConsultation: items.filter(
        (r) => r.routing === 'Awaiting Consultation',
      ).length,
      checkedOut: await this.prisma.triage.count({
        where: {
          ARRIVAL_AT: { gte: startOfDay, lt: endOfDay },
          STATUS: 'Cancelled',
        },
      }),
    };

    const total = filtered.length;
    return {
      asOf: new Date().toISOString(),
      summary,
      items: filtered.slice((page - 1) * limit, page * limit),
      meta: { page, limit, total },
    };
  }

  async routeArrival(
    dto: {
      personId: number;
      triageId?: number;
      action: 'triage' | 'consult' | 'emergency' | 'checkout';
      clinic?: string;
    },
    actor?: AuthUser,
  ) {
    const person = await this.prisma.persons.findUnique({
      where: { PERSON_ID: dto.personId },
    });
    if (!person || person.DISCONTINUE_FLAG === 'Y') {
      throw new NotFoundException('Person not found');
    }

    let triageId = dto.triageId;
    let triage =
      triageId != null
        ? await this.prisma.triage.findUnique({ where: { TRIAGE_ID: triageId } })
        : await this.prisma.triage.findFirst({
            where: {
              PERSON_ID: dto.personId,
              STATUS: { not: 'Cancelled' },
            },
            orderBy: { ARRIVAL_AT: 'desc' },
          });

    if (triage && triage.PERSON_ID !== dto.personId) {
      throw new BadRequestException('Triage does not belong to this person');
    }

    const label = actor
      ? [actor.firstName, actor.lastName].filter(Boolean).join(' ') ||
        actor.email
      : 'SYSTEM';

    if (dto.action === 'triage' || dto.action === 'emergency') {
      if (!triage) {
        const created = await this.triage.create(
          {
            personId: dto.personId,
            clinic: dto.clinic ?? undefined,
            status: 'Waiting',
            priority: dto.action === 'emergency' ? 'Emergency' : 'Routine',
            patientType:
              dto.action === 'emergency' ? 'Emergency' : undefined,
          },
          actor,
        );
        triageId = created.triageId;
        triage = await this.prisma.triage.findUnique({
          where: { TRIAGE_ID: triageId },
        });
      } else {
        await this.triage.update(
          triage.TRIAGE_ID,
          {
            status: 'Waiting',
            ...(dto.action === 'emergency'
              ? { priority: 'Emergency', patientType: 'Emergency' }
              : {}),
            ...(dto.clinic ? { clinic: dto.clinic } : {}),
          },
          actor,
        );
        triageId = triage.TRIAGE_ID;
      }
    } else if (dto.action === 'consult') {
      // Payment must be cleared before a patient enters the doctor queue
      // (create path already gates via TriageService.create).
      await this.cards.assertPaymentCleared(dto.personId);
      if (!triage) {
        const created = await this.triage.create(
          {
            personId: dto.personId,
            clinic: dto.clinic ?? undefined,
            status: 'Sent to Consultation',
            priority: 'Routine',
          },
          actor,
        );
        triageId = created.triageId;
      } else {
        await this.triage.update(
          triage.TRIAGE_ID,
          {
            status: 'Sent to Consultation',
            ...(dto.clinic ? { clinic: dto.clinic } : {}),
          },
          actor,
        );
        triageId = triage.TRIAGE_ID;
      }
    } else if (dto.action === 'checkout') {
      if (!triage) {
        throw new BadRequestException(
          'Patient is not checked in — nothing to check out',
        );
      }
      await this.triage.update(
        triage.TRIAGE_ID,
        { status: 'Cancelled' },
        actor,
      );
      triageId = triage.TRIAGE_ID;
    } else {
      throw new BadRequestException(
        'action must be triage, consult, emergency, or checkout',
      );
    }

    await this.audit.log({
      type: `arrival:${dto.action}`,
      entity: 'triage',
      entityId: triageId,
      personId: dto.personId,
      userId: actor?.id,
      createdBy: label,
      item: `Arrival routed: ${dto.action} for person ${dto.personId}`,
      newValue: { action: dto.action, triageId, clinic: dto.clinic ?? null },
    });

    const refreshed = await this.prisma.triage.findUnique({
      where: { TRIAGE_ID: triageId! },
      include: {
        person: {
          include: {
            cards: { orderBy: { CREATED_DATE: 'desc' }, take: 1 },
          },
        },
      },
    });
    if (!refreshed) throw new NotFoundException('Triage record not found');
    return this.toArrivalFromTriage(refreshed);
  }

  private dayBounds(offsetMin: number) {
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

  private mapTriageRouting(status: string, priority: string): string {
    if (priority === 'Emergency' && status !== 'Cancelled') return 'Emergency';
    switch (status) {
      case 'Waiting':
        return 'Awaiting Triage';
      case 'In Triage':
        return 'In Triage';
      case 'Triage Completed':
        return 'Awaiting Consultation';
      case 'Sent to Consultation':
        return 'Awaiting Consultation';
      case 'In Consultation':
        return 'In Consultation';
      case 'Cancelled':
        return 'Checked Out';
      default:
        return 'Awaiting Triage';
    }
  }

  private mapArrivalType(person: {
    REG_TYPE?: string | null;
    PATIENT_TYPE?: string | null;
  }, triage?: { PRIORITY?: string | null; PATIENT_TYPE?: string | null }): string {
    if (
      triage?.PRIORITY === 'Emergency' ||
      /emergency/i.test(triage?.PATIENT_TYPE ?? '') ||
      /emergency/i.test(person.PATIENT_TYPE ?? '') ||
      /emergency/i.test(person.REG_TYPE ?? '')
    ) {
      return 'Emergency';
    }
    const reg = person.REG_TYPE ?? '';
    if (/appoint/i.test(reg)) return 'Appointment';
    if (/refer/i.test(reg)) return 'Referral';
    return 'Walk-In';
  }

  private mapVisit(person: {
    PATIENT_TYPE?: string | null;
  }, triage?: { PATIENT_TYPE?: string | null }): string {
    const t = triage?.PATIENT_TYPE || person.PATIENT_TYPE || '';
    if (/emergency/i.test(t)) return 'Emergency';
    if (/return/i.test(t) || /follow/i.test(t)) return 'Follow-up';
    return 'New';
  }

  private mapPayment(person: {
    NHIS_NO?: string | null;
    HMO_ID?: number | null;
  }, card?: { PAYMENT_STATUS?: string | null } | null): string {
    if (person.NHIS_NO) return 'NHIA';
    if (person.HMO_ID != null) return 'HMO';
    if (card?.PAYMENT_STATUS === 'Pending') return 'Pending';
    return 'Paid';
  }

  private personDisplayName(p: {
    FIRST_NAME?: string | null;
    MIDDLE_NAME?: string | null;
    LAST_NAME?: string | null;
  }) {
    return (
      [p.FIRST_NAME, p.MIDDLE_NAME, p.LAST_NAME].filter(Boolean).join(' ') ||
      'Unknown'
    );
  }

  private toArrivalFromTriage(t: {
    TRIAGE_ID: number;
    PERSON_ID: number;
    QUEUE_NO: string;
    CLINIC: string | null;
    STATUS: string;
    PRIORITY: string;
    PATIENT_TYPE: string | null;
    ARRIVAL_AT: Date;
    person: {
      HOSPITAL_NO: string | null;
      FIRST_NAME: string | null;
      MIDDLE_NAME: string | null;
      LAST_NAME: string | null;
      REG_TYPE: string | null;
      PATIENT_TYPE: string | null;
      NHIS_NO: string | null;
      HMO_ID: number | null;
      DATE_OF_REGISTRATION: Date | null;
      CREATED_DATE: Date | null;
      cards: Array<{ PAYMENT_STATUS: string | null }>;
    };
  }) {
    const card = t.person.cards[0] ?? null;
    return {
      triageId: t.TRIAGE_ID,
      personId: t.PERSON_ID,
      arrivalNo: t.QUEUE_NO,
      hospitalId: t.person.HOSPITAL_NO || `PERSON_${t.PERSON_ID}`,
      name: this.personDisplayName(t.person),
      type: this.mapArrivalType(t.person, t),
      clinic: t.CLINIC || 'General OPD',
      arrival: t.ARRIVAL_AT.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      }),
      arrivalAt: t.ARRIVAL_AT.toISOString(),
      visit: this.mapVisit(t.person, t),
      routing: this.mapTriageRouting(t.STATUS, t.PRIORITY),
      payment: this.mapPayment(t.person, card),
      lastVisit: null as string | null,
      status: t.STATUS,
    };
  }

  private toArrivalFromPerson(p: {
    PERSON_ID: number;
    HOSPITAL_NO: string | null;
    FIRST_NAME: string | null;
    MIDDLE_NAME: string | null;
    LAST_NAME: string | null;
    REG_TYPE: string | null;
    PATIENT_TYPE: string | null;
    NHIS_NO: string | null;
    HMO_ID: number | null;
    CREATED_DATE: Date | null;
    cards: Array<{ PAYMENT_STATUS: string | null }>;
  }) {
    const card = p.cards[0] ?? null;
    const at = p.CREATED_DATE ?? new Date();
    return {
      triageId: null as number | null,
      personId: p.PERSON_ID,
      arrivalNo: `PEND-${p.PERSON_ID}`,
      hospitalId: p.HOSPITAL_NO || `PERSON_${p.PERSON_ID}`,
      name: this.personDisplayName(p),
      type: this.mapArrivalType(p),
      clinic: 'General OPD',
      arrival: at.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      }),
      arrivalAt: at.toISOString(),
      visit: this.mapVisit(p),
      routing: 'Awaiting Triage',
      payment: this.mapPayment(p, card),
      lastVisit: null as string | null,
      status: 'Pending Check-In',
    };
  }

  private toDirectoryItem(row: {
    PERSON_ID: number;
    HOSPITAL_NO: string | null;
    FIRST_NAME: string | null;
    LAST_NAME: string | null;
    MIDDLE_NAME: string | null;
    SEX: string | null;
    DATE_OF_BIRTH: Date | null;
    RESIDENTIAL_ADDRESS: string | null;
    PATIENT_PHONE_NO: string | null;
    E_MAIL: string | null;
    IDENTITY_NO: string | null;
    NHIS_NO: string | null;
    HMO_ID: number | null;
    BLOOD_GROUP: string | null;
    PATIENT_TYPE: string | null;
    REG_TYPE: string | null;
    STATUS: string | null;
    DATE_OF_REGISTRATION: Date | null;
    CREATED_DATE: Date | null;
    NAME_OF_NEXT_OF_KIN: string | null;
    TELEPHONE_OF_NEXT_OF_KIN: string | null;
    RELATIONSHIP: string | null;
  }) {
    const name = [row.FIRST_NAME, row.MIDDLE_NAME, row.LAST_NAME]
      .filter(Boolean)
      .join(' ');
    const age = row.DATE_OF_BIRTH
      ? Math.max(
          0,
          Math.floor(
            (Date.now() - row.DATE_OF_BIRTH.getTime()) /
              (365.25 * 24 * 60 * 60 * 1000),
          ),
        )
      : 0;
    let insurance: 'NHIS' | 'HMO' | 'Private' | 'None' = 'None';
    if (row.NHIS_NO) insurance = 'NHIS';
    else if (row.HMO_ID != null) insurance = 'HMO';
    else if (row.STATUS === 'Active') insurance = 'Private';

    const regType = row.REG_TYPE || '';
    const source =
      /online/i.test(regType) || /book/i.test(regType)
        ? 'Online'
        : 'Walk-in';

    return {
      id: String(row.PERSON_ID),
      personId: row.PERSON_ID,
      hospitalId: row.HOSPITAL_NO || `PERSON_${row.PERSON_ID}`,
      name: name || '—',
      phone: row.PATIENT_PHONE_NO || '',
      nin: row.IDENTITY_NO || '',
      age,
      gender: row.SEX || '',
      address: row.RESIDENTIAL_ADDRESS || '',
      registeredOn:
        row.DATE_OF_REGISTRATION?.toISOString().slice(0, 10) ||
        row.CREATED_DATE?.toISOString().slice(0, 10) ||
        '',
      source,
      bloodGroup: row.BLOOD_GROUP || '',
      allergies: '',
      insurance,
      email: row.E_MAIL,
      status: row.STATUS || 'Active',
      patientType: row.PATIENT_TYPE || row.REG_TYPE || source,
      clinic: '',
      lastVisit: row.CREATED_DATE?.toISOString().slice(0, 10) || '',
      nokName: row.NAME_OF_NEXT_OF_KIN || '',
      nokPhone: row.TELEPHONE_OF_NEXT_OF_KIN || '',
      nokRelationship: row.RELATIONSHIP || '',
    };
  }
}
