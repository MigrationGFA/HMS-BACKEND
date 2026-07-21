import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { AdmissionsService } from '../../admissions/admissions.service';
import { NotificationsService } from '../../notifications/notifications.service';
import type { AuthUser } from '../../auth/types/auth-user.type';
import type {
  AllocateReferralDto,
  CancelReferralDto,
  CompleteReferralDto,
  CreateReferralDto,
  NoteDto,
  ReasonDto,
  RouteReferralDto,
} from './dto/referral.dto';

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

const TERMINAL = new Set([
  'Completed',
  'ClearedExternal',
  'Rejected',
  'Cancelled',
  'Admitted',
]);

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
  const age = p.DATE_OF_BIRTH
    ? Math.max(
        0,
        Math.floor(
          (Date.now() - p.DATE_OF_BIRTH.getTime()) /
            (1000 * 60 * 60 * 24 * 365.25),
        ),
      )
    : null;
  return {
    personId: p.PERSON_ID,
    hospitalNo: p.HOSPITAL_NO,
    firstName: p.FIRST_NAME,
    lastName: p.LAST_NAME,
    middleName: p.MIDDLE_NAME,
    sex: p.SEX,
    dateOfBirth: p.DATE_OF_BIRTH?.toISOString() ?? null,
    age,
    phone: p.PATIENT_PHONE_NO,
  };
}

const INCLUDE = {
  person: { select: PERSON_SELECT },
  allocatedWard: true,
  allocatedBed: true,
  events: { orderBy: { CREATED_DATE: 'asc' as const } },
} satisfies Prisma.ClinicalReferralsInclude;

type Row = Prisma.ClinicalReferralsGetPayload<{ include: typeof INCLUDE }>;

@Injectable()
export class ReferralsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly admissions: AdmissionsService,
    private readonly notifications: NotificationsService,
  ) {}

  private toResponse(row: Row) {
    return {
      referralId: row.REFERRAL_ID,
      referralNo: row.REFERRAL_NO,
      personId: row.PERSON_ID,
      encounterId: row.ENCOUNTER_ID,
      admissionId: row.ADMISSION_ID,
      referralKind: row.REFERRAL_KIND,
      careSetting: row.CARE_SETTING,
      priority: row.PRIORITY,
      fromDepartment: row.FROM_DEPARTMENT,
      toDepartment: row.TO_DEPARTMENT,
      toDoctorUserId: row.TO_DOCTOR_USER_ID,
      toDoctorLabel: row.TO_DOCTOR_LABEL,
      externalFacility: row.EXTERNAL_FACILITY,
      externalContact: row.EXTERNAL_CONTACT,
      externalAddress: row.EXTERNAL_ADDRESS,
      reason: row.REASON,
      provisionalDiagnosis: row.PROVISIONAL_DIAGNOSIS,
      clinicalSummary: row.CLINICAL_SUMMARY,
      specificQuestion: row.SPECIFIC_QUESTION,
      outcomeNote: row.OUTCOME_NOTE,
      status: row.STATUS,
      requestedByUserId: row.REQUESTED_BY_USER_ID,
      ackedAt: row.ACKED_AT?.toISOString() ?? null,
      routedAt: row.ROUTED_AT?.toISOString() ?? null,
      allocatedAt: row.ALLOCATED_AT?.toISOString() ?? null,
      allocatedWardId: row.ALLOCATED_WARD_ID,
      allocatedBedId: row.ALLOCATED_BED_ID,
      acceptedAt: row.ACCEPTED_AT?.toISOString() ?? null,
      completedAt: row.COMPLETED_AT?.toISOString() ?? null,
      rejectionReason: row.REJECTION_REASON,
      returnReason: row.RETURN_REASON,
      createdBy: row.CREATED_BY,
      createdAt: row.CREATED_DATE?.toISOString() ?? null,
      updatedAt: row.UPDATED_DATE?.toISOString() ?? null,
      person: mapPerson(row.person),
      allocatedWard: row.allocatedWard
        ? {
            wardId: row.allocatedWard.WARD_ID,
            code: row.allocatedWard.CODE,
            name: row.allocatedWard.NAME,
          }
        : null,
      allocatedBed: row.allocatedBed
        ? {
            bedId: row.allocatedBed.BED_ID,
            label: row.allocatedBed.LABEL,
            status: row.allocatedBed.STATUS,
            wardId: row.allocatedBed.WARD_ID,
          }
        : null,
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
    const row = await this.prisma.clinicalReferrals.findUnique({
      where: { REFERRAL_ID: id },
      include: INCLUDE,
    });
    if (!row) throw new NotFoundException('Referral not found');
    return row;
  }

  private async nextNo(): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `REF-${year}-`;
    const latest = await this.prisma.clinicalReferrals.findFirst({
      where: { REFERRAL_NO: { startsWith: prefix } },
      orderBy: { REFERRAL_NO: 'desc' },
      select: { REFERRAL_NO: true },
    });
    let seq = 1;
    if (latest?.REFERRAL_NO) {
      const n = Number(latest.REFERRAL_NO.slice(prefix.length));
      if (Number.isFinite(n)) seq = n + 1;
    }
    return `${prefix}${String(seq).padStart(4, '0')}`;
  }

  private async appendEvent(
    tx: Prisma.TransactionClient,
    input: {
      referralId: number;
      eventType: string;
      actor?: AuthUser;
      note?: string | null;
      oldStatus?: string | null;
      newStatus?: string | null;
    },
  ) {
    await tx.clinicalReferralEvents.create({
      data: {
        REFERRAL_ID: input.referralId,
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
        entity: 'clinical_referral',
        entityId: payload.entityId,
        personId: payload.personId ?? null,
      });
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
    await this.notifications.createForUser({
      userId,
      roleHint: payload.roleHint ?? null,
      type: payload.type,
      title: payload.title,
      body: payload.body,
      linkPath: payload.linkPath,
      entity: 'clinical_referral',
      entityId: payload.entityId,
      personId: payload.personId ?? null,
    });
  }

  async create(dto: CreateReferralDto, actor?: AuthUser) {
    const person = await this.prisma.persons.findUnique({
      where: { PERSON_ID: dto.personId },
    });
    if (!person) throw new NotFoundException('Patient not found');

    if (dto.referralKind === 'Internal' && !dto.toDepartment?.trim()) {
      throw new BadRequestException('Destination department is required for internal referrals');
    }
    if (dto.referralKind === 'External' && !dto.externalFacility?.trim()) {
      throw new BadRequestException('External facility is required for external referrals');
    }

    const careSetting =
      dto.referralKind === 'External'
        ? 'Outpatient'
        : dto.careSetting ?? 'Outpatient';
    const actorLabel = actorLabelOf(actor);
    const now = new Date();
    const referralNo = await this.nextNo();

    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.clinicalReferrals.create({
        data: {
          REFERRAL_NO: referralNo,
          PERSON_ID: dto.personId,
          ENCOUNTER_ID: dto.encounterId ?? null,
          REFERRAL_KIND: dto.referralKind,
          CARE_SETTING: careSetting,
          PRIORITY: dto.priority ?? 'Routine',
          FROM_DEPARTMENT: dto.fromDepartment?.trim() || null,
          TO_DEPARTMENT: dto.toDepartment?.trim() || null,
          TO_DOCTOR_USER_ID: dto.toDoctorUserId ?? null,
          TO_DOCTOR_LABEL: dto.toDoctorLabel?.trim() || null,
          EXTERNAL_FACILITY: dto.externalFacility?.trim() || null,
          EXTERNAL_CONTACT: dto.externalContact?.trim() || null,
          EXTERNAL_ADDRESS: dto.externalAddress?.trim() || null,
          REASON: dto.reason.trim(),
          PROVISIONAL_DIAGNOSIS: dto.provisionalDiagnosis?.trim() || null,
          CLINICAL_SUMMARY: dto.clinicalSummary?.trim() || null,
          SPECIFIC_QUESTION: dto.specificQuestion?.trim() || null,
          STATUS: 'Submitted',
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
        referralId: created.REFERRAL_ID,
        eventType: 'referral:create',
        actor,
        note: dto.reason.trim(),
        newStatus: 'Submitted',
      });
      return created;
    });

    await this.audit.log({
      type: 'referral:create',
      entity: 'clinical_referral',
      entityId: row.REFERRAL_ID,
      personId: dto.personId,
      userId: actor?.id,
      createdBy: actorLabel,
      item: `Referral ${referralNo} submitted (${dto.referralKind})`,
    });

    await this.notifyRoles(['RECORDS', 'NURSE'], {
      type: 'ReferralRequested',
      title: `Referral ${referralNo}`,
      body: `${person.FIRST_NAME ?? ''} ${person.LAST_NAME ?? ''} → ${dto.toDepartment || dto.externalFacility || 'destination'}`.trim(),
      linkPath: '/records/referrals',
      entityId: row.REFERRAL_ID,
      personId: dto.personId,
    });

    return this.toResponse(await this.load(row.REFERRAL_ID));
  }

  async list(
    params: {
      scope?: string;
      status?: string;
      kind?: string;
      toDepartment?: string;
      personId?: number;
      careSetting?: string;
      q?: string;
      page?: number;
      limit?: number;
    },
    actor?: AuthUser,
  ) {
    const page = Math.max(params.page ?? 1, 1);
    const limit = Math.min(Math.max(params.limit ?? 50, 1), 200);
    const where: Prisma.ClinicalReferralsWhereInput = {};

    if (params.status) {
      const statuses = params.status.split(',').map((s) => s.trim()).filter(Boolean);
      where.STATUS = statuses.length === 1 ? statuses[0] : { in: statuses };
    }
    if (params.kind) where.REFERRAL_KIND = params.kind;
    if (params.toDepartment) where.TO_DEPARTMENT = params.toDepartment;
    if (params.personId) where.PERSON_ID = params.personId;
    if (params.careSetting) where.CARE_SETTING = params.careSetting;

    if (params.scope === 'mine' && actor?.id) {
      where.REQUESTED_BY_USER_ID = actor.id;
    } else if (params.scope === 'inbound' && actor?.id) {
      where.OR = [
        { TO_DOCTOR_USER_ID: actor.id },
        {
          STATUS: {
            in: ['QueuedForDept', 'Accepted', 'InAttendance', 'Returned'],
          },
        },
      ];
    }

    if (params.q?.trim()) {
      const q = params.q.trim();
      where.AND = [
        ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
        {
          OR: [
            { REFERRAL_NO: { contains: q, mode: 'insensitive' } },
            { REASON: { contains: q, mode: 'insensitive' } },
            { TO_DEPARTMENT: { contains: q, mode: 'insensitive' } },
            { EXTERNAL_FACILITY: { contains: q, mode: 'insensitive' } },
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
      this.prisma.clinicalReferrals.count({ where }),
      this.prisma.clinicalReferrals.findMany({
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
    return this.toResponse(await this.load(id));
  }

  private async transition(
    id: number,
    allowed: string[],
    next: string,
    eventType: string,
    actor: AuthUser | undefined,
    extra: Prisma.ClinicalReferralsUncheckedUpdateInput,
    note?: string,
  ) {
    const existing = await this.load(id);
    if (!allowed.includes(existing.STATUS)) {
      throw new ConflictException(
        `Cannot ${eventType} referral in status ${existing.STATUS}`,
      );
    }
    const actorLabel = actorLabelOf(actor);
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.clinicalReferrals.update({
        where: { REFERRAL_ID: id },
        data: {
          STATUS: next,
          UPDATED_BY_ID: actor?.id ?? null,
          UPDATED_BY: actorLabel,
          UPDATED_DATE: now,
          ...extra,
        },
      });
      await this.appendEvent(tx, {
        referralId: id,
        eventType,
        actor,
        note,
        oldStatus: existing.STATUS,
        newStatus: next,
      });
    });
    await this.audit.log({
      type: eventType,
      entity: 'clinical_referral',
      entityId: id,
      personId: existing.PERSON_ID,
      userId: actor?.id,
      createdBy: actorLabel,
      item: `Referral ${existing.REFERRAL_NO} → ${next}`,
      oldValue: { status: existing.STATUS },
      newValue: { status: next },
    });
    return this.toResponse(await this.load(id));
  }

  async ack(id: number, dto: NoteDto, actor?: AuthUser) {
    return this.transition(
      id,
      ['Submitted'],
      'UnderReview',
      'referral:ack',
      actor,
      {
        ACKED_BY_USER_ID: actor?.id ?? null,
        ACKED_AT: new Date(),
      },
      dto.note,
    );
  }

  async route(id: number, dto: RouteReferralDto, actor?: AuthUser) {
    const existing = await this.load(id);
    if (existing.REFERRAL_KIND !== 'Internal') {
      throw new BadRequestException('Only internal referrals can be routed to a department');
    }
    const toDept = dto.toDepartment?.trim() || existing.TO_DEPARTMENT;
    if (!toDept) throw new BadRequestException('Destination department is required');

    const result = await this.transition(
      id,
      ['Submitted', 'UnderReview', 'Returned'],
      'QueuedForDept',
      'referral:route',
      actor,
      {
        TO_DEPARTMENT: toDept,
        TO_DOCTOR_USER_ID: dto.toDoctorUserId ?? existing.TO_DOCTOR_USER_ID,
        TO_DOCTOR_LABEL: dto.toDoctorLabel?.trim() || existing.TO_DOCTOR_LABEL,
        CARE_SETTING: 'Outpatient',
        ROUTED_BY_USER_ID: actor?.id ?? null,
        ROUTED_AT: new Date(),
      },
      dto.note,
    );

    await this.notifyRoles(['DOCTOR', 'NURSE'], {
      type: 'ReferralRouted',
      title: `Referral queued: ${existing.REFERRAL_NO}`,
      body: `Routed to ${toDept}`,
      linkPath: '/dashboard/doctor/clinical/referrals',
      entityId: id,
      personId: existing.PERSON_ID,
    });
    await this.notifyUser(dto.toDoctorUserId ?? existing.TO_DOCTOR_USER_ID, {
      type: 'ReferralRouted',
      title: `Referral for you: ${existing.REFERRAL_NO}`,
      body: `Patient referred to ${toDept}`,
      linkPath: '/dashboard/doctor/clinical/referrals',
      entityId: id,
      personId: existing.PERSON_ID,
      roleHint: 'DOCTOR',
    });

    return result;
  }

  async allocate(id: number, dto: AllocateReferralDto, actor?: AuthUser) {
    const existing = await this.load(id);
    if (existing.REFERRAL_KIND !== 'Internal') {
      throw new BadRequestException('External referrals do not allocate beds');
    }
    if (!['Submitted', 'UnderReview', 'AwaitingBed'].includes(existing.STATUS)) {
      throw new ConflictException(
        `Cannot allocate bed in status ${existing.STATUS}`,
      );
    }

    const bed = await this.prisma.beds.findUnique({
      where: { BED_ID: dto.bedId },
      include: { ward: true },
    });
    if (!bed) throw new NotFoundException('Bed not found');
    if (bed.WARD_ID !== dto.wardId) {
      throw new BadRequestException('Bed does not belong to the selected ward');
    }
    if (bed.STATUS !== 'AVAILABLE' && bed.BED_ID !== existing.ALLOCATED_BED_ID) {
      throw new ConflictException(`Bed is not available (status: ${bed.STATUS})`);
    }

    const actorLabel = actorLabelOf(actor);
    const now = new Date();
    const prevBedId = existing.ALLOCATED_BED_ID;

    await this.prisma.$transaction(async (tx) => {
      if (prevBedId && prevBedId !== dto.bedId) {
        await tx.beds.update({
          where: { BED_ID: prevBedId },
          data: { STATUS: 'AVAILABLE', UPDATED_BY: actorLabel, UPDATED_DATE: now },
        });
      }
      await tx.beds.update({
        where: { BED_ID: dto.bedId },
        data: { STATUS: 'RESERVED', UPDATED_BY: actorLabel, UPDATED_DATE: now },
      });
      await tx.clinicalReferrals.update({
        where: { REFERRAL_ID: id },
        data: {
          STATUS: 'BedAllocated',
          CARE_SETTING: 'Inpatient',
          ALLOCATED_WARD_ID: dto.wardId,
          ALLOCATED_BED_ID: dto.bedId,
          ALLOCATED_BY_USER_ID: actor?.id ?? null,
          ALLOCATED_AT: now,
          UPDATED_BY_ID: actor?.id ?? null,
          UPDATED_BY: actorLabel,
          UPDATED_DATE: now,
        },
      });
      await this.appendEvent(tx, {
        referralId: id,
        eventType: 'referral:allocate',
        actor,
        note: dto.note ?? `Bed ${bed.LABEL} reserved`,
        oldStatus: existing.STATUS,
        newStatus: 'BedAllocated',
      });
    });

    await this.audit.log({
      type: 'referral:allocate',
      entity: 'clinical_referral',
      entityId: id,
      personId: existing.PERSON_ID,
      userId: actor?.id,
      createdBy: actorLabel,
      item: `Referral ${existing.REFERRAL_NO} bed ${bed.LABEL} reserved`,
    });

    return this.toResponse(await this.load(id));
  }

  async requestBed(id: number, dto: NoteDto, actor?: AuthUser) {
    const existing = await this.load(id);
    if (existing.REFERRAL_KIND !== 'Internal') {
      throw new BadRequestException('Only internal referrals can request a bed');
    }
    return this.transition(
      id,
      ['Submitted', 'UnderReview'],
      'AwaitingBed',
      'referral:request-bed',
      actor,
      { CARE_SETTING: 'Inpatient' },
      dto.note,
    );
  }

  async admit(id: number, dto: NoteDto, actor?: AuthUser) {
    const existing = await this.load(id);
    if (existing.STATUS !== 'BedAllocated') {
      throw new ConflictException(
        `Can only admit when BedAllocated (now ${existing.STATUS})`,
      );
    }
    if (!existing.ALLOCATED_WARD_ID || !existing.ALLOCATED_BED_ID) {
      throw new BadRequestException('Ward and bed must be allocated first');
    }

    const actorLabel = actorLabelOf(actor);
    const now = new Date();

    await this.prisma.beds.update({
      where: { BED_ID: existing.ALLOCATED_BED_ID },
      data: { STATUS: 'AVAILABLE', UPDATED_BY: actorLabel, UPDATED_DATE: now },
    });

    const admitted = await this.admissions.admit(
      {
        personId: existing.PERSON_ID,
        wardId: existing.ALLOCATED_WARD_ID,
        bedId: existing.ALLOCATED_BED_ID,
        diagnosis: existing.PROVISIONAL_DIAGNOSIS ?? existing.REASON,
      },
      actor,
    );

    await this.prisma.$transaction(async (tx) => {
      await tx.clinicalReferrals.update({
        where: { REFERRAL_ID: id },
        data: {
          STATUS: 'Admitted',
          ADMISSION_ID: admitted.admissionId,
          COMPLETED_BY_USER_ID: actor?.id ?? null,
          COMPLETED_AT: now,
          OUTCOME_NOTE: dto.note?.trim() || existing.OUTCOME_NOTE,
          UPDATED_BY_ID: actor?.id ?? null,
          UPDATED_BY: actorLabel,
          UPDATED_DATE: now,
        },
      });
      await this.appendEvent(tx, {
        referralId: id,
        eventType: 'referral:admit',
        actor,
        note: dto.note ?? `Admission #${admitted.admissionId}`,
        oldStatus: existing.STATUS,
        newStatus: 'Admitted',
      });
    });

    await this.audit.log({
      type: 'referral:admit',
      entity: 'clinical_referral',
      entityId: id,
      personId: existing.PERSON_ID,
      userId: actor?.id,
      createdBy: actorLabel,
      item: `Referral ${existing.REFERRAL_NO} admitted`,
      newValue: { admissionId: admitted.admissionId },
    });

    await this.notifyUser(existing.REQUESTED_BY_USER_ID, {
      type: 'ReferralCompleted',
      title: `Referral admitted: ${existing.REFERRAL_NO}`,
      body: 'Patient admitted from referral',
      linkPath: '/dashboard/doctor/clinical/referrals',
      entityId: id,
      personId: existing.PERSON_ID,
      roleHint: 'DOCTOR',
    });

    return this.toResponse(await this.load(id));
  }

  async accept(id: number, dto: NoteDto, actor?: AuthUser) {
    const result = await this.transition(
      id,
      ['QueuedForDept'],
      'Accepted',
      'referral:accept',
      actor,
      {
        ACCEPTED_BY_USER_ID: actor?.id ?? null,
        ACCEPTED_AT: new Date(),
      },
      dto.note,
    );
    const existing = await this.load(id);
    await this.notifyUser(existing.REQUESTED_BY_USER_ID, {
      type: 'ReferralAccepted',
      title: `Referral accepted: ${existing.REFERRAL_NO}`,
      linkPath: '/dashboard/doctor/clinical/referrals',
      entityId: id,
      personId: existing.PERSON_ID,
      roleHint: 'DOCTOR',
    });
    return result;
  }

  async attend(id: number, dto: NoteDto, actor?: AuthUser) {
    return this.transition(
      id,
      ['Accepted'],
      'InAttendance',
      'referral:attend',
      actor,
      {},
      dto.note,
    );
  }

  async complete(id: number, dto: CompleteReferralDto, actor?: AuthUser) {
    const result = await this.transition(
      id,
      ['InAttendance', 'Accepted'],
      'Completed',
      'referral:complete',
      actor,
      {
        OUTCOME_NOTE: dto.outcomeNote?.trim() || undefined,
        COMPLETED_BY_USER_ID: actor?.id ?? null,
        COMPLETED_AT: new Date(),
      },
      dto.outcomeNote,
    );
    const existing = await this.load(id);
    await this.notifyUser(existing.REQUESTED_BY_USER_ID, {
      type: 'ReferralCompleted',
      title: `Referral completed: ${existing.REFERRAL_NO}`,
      body: dto.outcomeNote,
      linkPath: '/dashboard/doctor/clinical/referrals',
      entityId: id,
      personId: existing.PERSON_ID,
      roleHint: 'DOCTOR',
    });
    return result;
  }

  async clearExternal(id: number, dto: NoteDto, actor?: AuthUser) {
    const existing = await this.load(id);
    if (existing.REFERRAL_KIND !== 'External') {
      throw new BadRequestException('Only external referrals use clear-external');
    }
    return this.transition(
      id,
      ['Submitted', 'UnderReview'],
      'ClearedExternal',
      'referral:clear-external',
      actor,
      {
        COMPLETED_BY_USER_ID: actor?.id ?? null,
        COMPLETED_AT: new Date(),
        OUTCOME_NOTE: dto.note?.trim() || undefined,
      },
      dto.note,
    );
  }

  async returnForInfo(id: number, dto: ReasonDto, actor?: AuthUser) {
    const result = await this.transition(
      id,
      ['Submitted', 'UnderReview', 'QueuedForDept'],
      'Returned',
      'referral:return',
      actor,
      { RETURN_REASON: dto.reason.trim() },
      dto.reason.trim(),
    );
    const existing = await this.load(id);
    await this.notifyUser(existing.REQUESTED_BY_USER_ID, {
      type: 'ReferralRejected',
      title: `More info needed: ${existing.REFERRAL_NO}`,
      body: dto.reason.trim(),
      linkPath: '/dashboard/doctor/clinical/referrals',
      entityId: id,
      personId: existing.PERSON_ID,
      roleHint: 'DOCTOR',
    });
    return result;
  }

  async reject(id: number, dto: ReasonDto, actor?: AuthUser) {
    const existing = await this.load(id);
    if (TERMINAL.has(existing.STATUS) || existing.STATUS === 'InAttendance') {
      throw new ConflictException(`Cannot reject referral in status ${existing.STATUS}`);
    }
    const actorLabel = actorLabelOf(actor);
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      if (existing.ALLOCATED_BED_ID) {
        await tx.beds.update({
          where: { BED_ID: existing.ALLOCATED_BED_ID },
          data: { STATUS: 'AVAILABLE', UPDATED_BY: actorLabel, UPDATED_DATE: now },
        });
      }
      await tx.clinicalReferrals.update({
        where: { REFERRAL_ID: id },
        data: {
          STATUS: 'Rejected',
          REJECTION_REASON: dto.reason.trim(),
          ALLOCATED_BED_ID: null,
          ALLOCATED_WARD_ID: null,
          UPDATED_BY_ID: actor?.id ?? null,
          UPDATED_BY: actorLabel,
          UPDATED_DATE: now,
        },
      });
      await this.appendEvent(tx, {
        referralId: id,
        eventType: 'referral:reject',
        actor,
        note: dto.reason.trim(),
        oldStatus: existing.STATUS,
        newStatus: 'Rejected',
      });
    });
    await this.audit.log({
      type: 'referral:reject',
      entity: 'clinical_referral',
      entityId: id,
      personId: existing.PERSON_ID,
      userId: actor?.id,
      createdBy: actorLabel,
      item: `Referral ${existing.REFERRAL_NO} rejected`,
    });
    await this.notifyUser(existing.REQUESTED_BY_USER_ID, {
      type: 'ReferralRejected',
      title: `Referral rejected: ${existing.REFERRAL_NO}`,
      body: dto.reason.trim(),
      linkPath: '/dashboard/doctor/clinical/referrals',
      entityId: id,
      personId: existing.PERSON_ID,
      roleHint: 'DOCTOR',
    });
    return this.toResponse(await this.load(id));
  }

  async cancel(id: number, dto: CancelReferralDto, actor?: AuthUser) {
    const existing = await this.load(id);
    if (
      TERMINAL.has(existing.STATUS) ||
      ['InAttendance', 'Accepted', 'BedAllocated'].includes(existing.STATUS)
    ) {
      throw new ConflictException(`Cannot cancel referral in status ${existing.STATUS}`);
    }
    const actorLabel = actorLabelOf(actor);
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      if (existing.ALLOCATED_BED_ID) {
        await tx.beds.update({
          where: { BED_ID: existing.ALLOCATED_BED_ID },
          data: { STATUS: 'AVAILABLE', UPDATED_BY: actorLabel, UPDATED_DATE: now },
        });
      }
      await tx.clinicalReferrals.update({
        where: { REFERRAL_ID: id },
        data: {
          STATUS: 'Cancelled',
          REJECTION_REASON: dto.reason?.trim() || existing.REJECTION_REASON,
          ALLOCATED_BED_ID: null,
          ALLOCATED_WARD_ID: null,
          UPDATED_BY_ID: actor?.id ?? null,
          UPDATED_BY: actorLabel,
          UPDATED_DATE: now,
        },
      });
      await this.appendEvent(tx, {
        referralId: id,
        eventType: 'referral:cancel',
        actor,
        note: dto.reason,
        oldStatus: existing.STATUS,
        newStatus: 'Cancelled',
      });
    });
    await this.audit.log({
      type: 'referral:cancel',
      entity: 'clinical_referral',
      entityId: id,
      personId: existing.PERSON_ID,
      userId: actor?.id,
      createdBy: actorLabel,
      item: `Referral ${existing.REFERRAL_NO} cancelled`,
    });
    return this.toResponse(await this.load(id));
  }
}
