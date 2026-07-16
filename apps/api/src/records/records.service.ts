import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CardsService } from '../patients/cards.service';
import { PatientsService } from '../patients/patients.service';
import { PrismaService } from '../prisma/prisma.service';
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
    return 'Records';
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
