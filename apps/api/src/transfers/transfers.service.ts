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
  AcceptTransferDto,
  AllocateTransferDto,
  CancelTransferDto,
  ConfirmArrivalDto,
  CreateTransferDto,
  DepartTransferDto,
  PrepareTransferDto,
  RejectTransferDto,
} from './dto/transfer.dto';

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

const ACTIVE_ADMISSION = [
  'PENDING',
  'BED_ALLOCATED',
  'ADMITTED',
  'ON_LEAVE',
  'DISCHARGE_ORDERED',
  'ACTIVE',
  'Active',
  'Admitted',
] as const;

const TERMINAL = new Set(['Completed', 'Rejected', 'Cancelled']);

const NEEDS_BED = new Set([
  'WardToWard',
  'ClinicToWard',
  'ICU',
  'Department',
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

function mapWard(
  w: {
    WARD_ID: number;
    CODE: string;
    NAME: string;
    WARD_TYPE?: string | null;
    WARD_CLASS?: string | null;
  } | null | undefined,
) {
  if (!w) return null;
  return {
    wardId: w.WARD_ID,
    code: w.CODE,
    name: w.NAME,
    wardType: w.WARD_TYPE ?? null,
    wardClass: w.WARD_CLASS ?? null,
  };
}

function mapBed(
  b: {
    BED_ID: number;
    LABEL: string;
    STATUS: string;
    WARD_ID: number;
  } | null | undefined,
) {
  if (!b) return null;
  return {
    bedId: b.BED_ID,
    label: b.LABEL,
    status: b.STATUS,
    wardId: b.WARD_ID,
  };
}

const INCLUDE = {
  person: { select: PERSON_SELECT },
  fromWard: true,
  toWard: true,
  allocatedBed: true,
  admission: {
    select: {
      ADMISSION_ID: true,
      STATUS: true,
      WARD_ID: true,
      BED_ID: true,
    },
  },
  events: {
    orderBy: { CREATED_DATE: 'asc' as const },
  },
} satisfies Prisma.PatientTransfersInclude;

type Row = Prisma.PatientTransfersGetPayload<{ include: typeof INCLUDE }>;

@Injectable()
export class TransfersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly admissions: AdmissionsService,
    private readonly notifications: NotificationsService,
  ) {}

  private toResponse(row: Row) {
    return {
      transferId: row.TRANSFER_ID,
      transferNo: row.TRANSFER_NO,
      personId: row.PERSON_ID,
      admissionId: row.ADMISSION_ID,
      transferType: row.TRANSFER_TYPE,
      priority: row.PRIORITY,
      fromWardId: row.FROM_WARD_ID,
      toWardId: row.TO_WARD_ID,
      toWardPreference: row.TO_WARD_PREFERENCE,
      destinationLabel: row.DESTINATION_LABEL,
      allocatedBedId: row.ALLOCATED_BED_ID,
      reason: row.REASON,
      clinicalNotes: row.CLINICAL_NOTES,
      handoverNotes: row.HANDOVER_NOTES,
      status: row.STATUS,
      requestedByUserId: row.REQUESTED_BY_USER_ID,
      preparedByUserId: row.PREPARED_BY_USER_ID,
      preparedAt: row.PREPARED_AT?.toISOString() ?? null,
      allocatedByUserId: row.ALLOCATED_BY_USER_ID,
      allocatedAt: row.ALLOCATED_AT?.toISOString() ?? null,
      acceptedByUserId: row.ACCEPTED_BY_USER_ID,
      acceptedAt: row.ACCEPTED_AT?.toISOString() ?? null,
      departedByUserId: row.DEPARTED_BY_USER_ID,
      departedAt: row.DEPARTED_AT?.toISOString() ?? null,
      receivedByUserId: row.RECEIVED_BY_USER_ID,
      receivedAt: row.RECEIVED_AT?.toISOString() ?? null,
      rejectionReason: row.REJECTION_REASON,
      externalFacility: row.EXTERNAL_FACILITY,
      createdBy: row.CREATED_BY,
      createdAt: row.CREATED_DATE?.toISOString() ?? null,
      updatedAt: row.UPDATED_DATE?.toISOString() ?? null,
      person: mapPerson(row.person),
      fromWard: mapWard(row.fromWard),
      toWard: mapWard(row.toWard),
      allocatedBed: mapBed(row.allocatedBed),
      admission: row.admission
        ? {
            admissionId: row.admission.ADMISSION_ID,
            status: row.admission.STATUS,
            wardId: row.admission.WARD_ID,
            bedId: row.admission.BED_ID,
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
    const row = await this.prisma.patientTransfers.findUnique({
      where: { TRANSFER_ID: id },
      include: INCLUDE,
    });
    if (!row) throw new NotFoundException('Transfer not found');
    return row;
  }

  private async nextTransferNo(): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `XFR-${year}-`;
    const latest = await this.prisma.patientTransfers.findFirst({
      where: { TRANSFER_NO: { startsWith: prefix } },
      orderBy: { TRANSFER_NO: 'desc' },
      select: { TRANSFER_NO: true },
    });
    let seq = 1;
    if (latest?.TRANSFER_NO) {
      const part = latest.TRANSFER_NO.slice(prefix.length);
      const n = Number(part);
      if (Number.isFinite(n)) seq = n + 1;
    }
    return `${prefix}${String(seq).padStart(4, '0')}`;
  }

  private async appendEvent(
    tx: Prisma.TransactionClient,
    input: {
      transferId: number;
      eventType: string;
      actor?: AuthUser;
      note?: string | null;
      oldStatus?: string | null;
      newStatus?: string | null;
    },
  ) {
    await tx.patientTransferEvents.create({
      data: {
        TRANSFER_ID: input.transferId,
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
      entity?: string;
      entityId?: number;
      personId?: number | null;
      roleHint?: string;
    },
  ) {
    const users = await this.prisma.users.findMany({
      where: {
        role: { ROLE_NAME: { in: roles } },
      },
      select: { USER_ID: true, role: { select: { ROLE_NAME: true } } },
      take: 100,
    });
    for (const u of users) {
      await this.notifications.createForUser({
        userId: u.USER_ID,
        roleHint: payload.roleHint ?? u.role?.ROLE_NAME ?? null,
        type: payload.type,
        title: payload.title,
        body: payload.body,
        linkPath: payload.linkPath,
        entity: payload.entity,
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
      entity?: string;
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
      entity: payload.entity,
      entityId: payload.entityId,
      personId: payload.personId ?? null,
    });
  }

  async create(dto: CreateTransferDto, actor?: AuthUser) {
    if (dto.transferType === 'Theatre' || dto.transferType === 'RadiologyEscort') {
      throw new BadRequestException(
        `${dto.transferType} transfers are not enabled in this build (stub only)`,
      );
    }

    const person = await this.prisma.persons.findUnique({
      where: { PERSON_ID: dto.personId },
    });
    if (!person) throw new NotFoundException('Patient not found');

    let admissionId = dto.admissionId ?? null;
    let fromWardId = dto.fromWardId ?? null;

    if (admissionId) {
      const adm = await this.prisma.admissions.findUnique({
        where: { ADMISSION_ID: admissionId },
      });
      if (!adm) throw new NotFoundException('Admission not found');
      if (adm.PERSON_ID !== dto.personId) {
        throw new BadRequestException('Admission does not belong to this patient');
      }
      if (!fromWardId) fromWardId = adm.WARD_ID;
    } else if (NEEDS_BED.has(dto.transferType) || dto.transferType === 'WardToClinic') {
      const adm = await this.prisma.admissions.findFirst({
        where: {
          PERSON_ID: dto.personId,
          STATUS: { in: [...ACTIVE_ADMISSION] },
        },
        orderBy: { ADMISSION_ID: 'desc' },
      });
      if (adm) {
        admissionId = adm.ADMISSION_ID;
        if (!fromWardId) fromWardId = adm.WARD_ID;
      }
      if (
        (dto.transferType === 'WardToWard' ||
          dto.transferType === 'ICU' ||
          dto.transferType === 'WardToClinic') &&
        !admissionId
      ) {
        throw new BadRequestException(
          'Active admission is required for this transfer type',
        );
      }
    }

    if (dto.toWardId) {
      const ward = await this.prisma.wards.findUnique({
        where: { WARD_ID: dto.toWardId },
      });
      if (!ward) throw new NotFoundException('Destination ward not found');
    }

    const initialStatus = dto.skipPrepare ? 'AwaitingBed' : 'Submitted';
    const actorLabel = actorLabelOf(actor);
    const now = new Date();
    const transferNo = await this.nextTransferNo();

    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.patientTransfers.create({
        data: {
          TRANSFER_NO: transferNo,
          PERSON_ID: dto.personId,
          ADMISSION_ID: admissionId,
          TRANSFER_TYPE: dto.transferType,
          PRIORITY: dto.priority ?? 'Routine',
          FROM_WARD_ID: fromWardId,
          TO_WARD_ID: dto.toWardId ?? null,
          TO_WARD_PREFERENCE: dto.toWardPreference?.trim() || null,
          DESTINATION_LABEL:
            dto.destinationLabel?.trim() ||
            dto.toWardPreference?.trim() ||
            null,
          REASON: dto.reason.trim(),
          CLINICAL_NOTES: dto.clinicalNotes?.trim() || null,
          EXTERNAL_FACILITY: dto.externalFacility?.trim() || null,
          STATUS: initialStatus,
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
        transferId: created.TRANSFER_ID,
        eventType: 'transfer:create',
        actor,
        note: dto.reason.trim(),
        oldStatus: null,
        newStatus: initialStatus,
      });
      return created;
    });

    await this.audit.log({
      type: 'transfer:create',
      entity: 'patient_transfer',
      entityId: row.TRANSFER_ID,
      personId: dto.personId,
      userId: actor?.id,
      createdBy: actorLabel,
      item: `Transfer ${transferNo} submitted (${dto.transferType})`,
      newValue: { status: initialStatus, transferType: dto.transferType },
    });

    const dest =
      dto.toWardPreference ||
      dto.destinationLabel ||
      (dto.toWardId ? `ward #${dto.toWardId}` : 'destination');
    await this.notifyRoles(['NURSE', 'RECORDS'], {
      type: 'TransferRequested',
      title: `Transfer requested: ${transferNo}`,
      body: `${person.FIRST_NAME ?? ''} ${person.LAST_NAME ?? ''} → ${dest} (${dto.priority ?? 'Routine'})`.trim(),
      linkPath: '/dashboard/nurse/transfers',
      entity: 'patient_transfer',
      entityId: row.TRANSFER_ID,
      personId: dto.personId,
    });

    return this.toResponse(await this.load(row.TRANSFER_ID));
  }

  async list(params: {
    scope?: string;
    status?: string;
    personId?: number;
    admissionId?: number;
    fromWardId?: number;
    toWardId?: number;
    q?: string;
    page?: number;
    limit?: number;
  }, actor?: AuthUser) {
    const page = Math.max(params.page ?? 1, 1);
    const limit = Math.min(Math.max(params.limit ?? 50, 1), 200);
    const where: Prisma.PatientTransfersWhereInput = {};

    if (params.status) {
      const statuses = params.status.split(',').map((s) => s.trim()).filter(Boolean);
      where.STATUS = statuses.length === 1 ? statuses[0] : { in: statuses };
    }
    if (params.personId) where.PERSON_ID = params.personId;
    if (params.admissionId) where.ADMISSION_ID = params.admissionId;
    if (params.fromWardId) where.FROM_WARD_ID = params.fromWardId;
    if (params.toWardId) where.TO_WARD_ID = params.toWardId;

    if (params.scope === 'mine' && actor?.id) {
      where.REQUESTED_BY_USER_ID = actor.id;
    }

    if (params.q?.trim()) {
      const q = params.q.trim();
      where.OR = [
        { TRANSFER_NO: { contains: q, mode: 'insensitive' } },
        { REASON: { contains: q, mode: 'insensitive' } },
        { TO_WARD_PREFERENCE: { contains: q, mode: 'insensitive' } },
        { DESTINATION_LABEL: { contains: q, mode: 'insensitive' } },
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
      this.prisma.patientTransfers.count({ where }),
      this.prisma.patientTransfers.findMany({
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

  async prepare(id: number, dto: PrepareTransferDto, actor?: AuthUser) {
    const existing = await this.load(id);
    if (!['Submitted', 'NursePreparing'].includes(existing.STATUS)) {
      throw new ConflictException(
        `Cannot prepare transfer in status ${existing.STATUS}`,
      );
    }
    const next = dto.ready === false ? 'NursePreparing' : 'AwaitingBed';
    if (existing.STATUS === 'NursePreparing' && next === 'NursePreparing') {
      throw new ConflictException('Transfer is already acknowledged');
    }
    const actorLabel = actorLabelOf(actor);
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      await tx.patientTransfers.update({
        where: { TRANSFER_ID: id },
        data: {
          STATUS: next,
          PREPARED_BY_USER_ID: actor?.id ?? null,
          PREPARED_AT: now,
          UPDATED_BY_ID: actor?.id ?? null,
          UPDATED_BY: actorLabel,
          UPDATED_DATE: now,
        },
      });
      await this.appendEvent(tx, {
        transferId: id,
        eventType: next === 'AwaitingBed' ? 'transfer:prepare' : 'transfer:ack',
        actor,
        note: dto.note,
        oldStatus: existing.STATUS,
        newStatus: next,
      });
    });

    await this.audit.log({
      type: 'transfer:prepare',
      entity: 'patient_transfer',
      entityId: id,
      personId: existing.PERSON_ID,
      userId: actor?.id,
      createdBy: actorLabel,
      item: `Transfer ${existing.TRANSFER_NO} → ${next}`,
      oldValue: { status: existing.STATUS },
      newValue: { status: next },
    });

    if (next === 'AwaitingBed') {
      await this.notifyRoles(['RECORDS', 'NURSE'], {
        type: 'TransferBedAssigned',
        title: `Bed allocation needed: ${existing.TRANSFER_NO}`,
        body: 'Patient is ready — allocate ward and bed',
        linkPath: '/records/transfers',
        entity: 'patient_transfer',
        entityId: id,
        personId: existing.PERSON_ID,
      });
    }

    return this.toResponse(await this.load(id));
  }

  async allocate(id: number, dto: AllocateTransferDto, actor?: AuthUser) {
    const existing = await this.load(id);
    if (!['Submitted', 'NursePreparing', 'AwaitingBed', 'BedReserved'].includes(existing.STATUS)) {
      throw new ConflictException(
        `Cannot allocate bed in status ${existing.STATUS}`,
      );
    }
    if (existing.TRANSFER_TYPE === 'ExternalReferral') {
      throw new BadRequestException('External referrals do not allocate inpatient beds');
    }
    if (existing.TRANSFER_TYPE === 'WardToClinic') {
      throw new BadRequestException('Ward-to-clinic transfers do not allocate a bed');
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
          data: {
            STATUS: 'AVAILABLE',
            UPDATED_BY: actorLabel,
            UPDATED_DATE: now,
          },
        });
      }
      await tx.beds.update({
        where: { BED_ID: dto.bedId },
        data: {
          STATUS: 'RESERVED',
          UPDATED_BY: actorLabel,
          UPDATED_DATE: now,
        },
      });
      await tx.patientTransfers.update({
        where: { TRANSFER_ID: id },
        data: {
          STATUS: 'BedReserved',
          TO_WARD_ID: dto.wardId,
          ALLOCATED_BED_ID: dto.bedId,
          ALLOCATED_BY_USER_ID: actor?.id ?? null,
          ALLOCATED_AT: now,
          UPDATED_BY_ID: actor?.id ?? null,
          UPDATED_BY: actorLabel,
          UPDATED_DATE: now,
        },
      });
      await this.appendEvent(tx, {
        transferId: id,
        eventType: 'transfer:allocate',
        actor,
        note: dto.note ?? `Bed ${bed.LABEL} reserved`,
        oldStatus: existing.STATUS,
        newStatus: 'BedReserved',
      });
    });

    await this.audit.log({
      type: 'transfer:allocate',
      entity: 'patient_transfer',
      entityId: id,
      personId: existing.PERSON_ID,
      userId: actor?.id,
      createdBy: actorLabel,
      item: `Transfer ${existing.TRANSFER_NO} bed ${bed.LABEL} reserved`,
      oldValue: { status: existing.STATUS, bedId: prevBedId },
      newValue: { status: 'BedReserved', bedId: dto.bedId, wardId: dto.wardId },
    });

    await this.notifyRoles(['NURSE'], {
      type: 'TransferBedAssigned',
      title: `Bed reserved: ${existing.TRANSFER_NO}`,
      body: `${bed.ward?.NAME ?? 'Ward'} / ${bed.LABEL} — receiving ward may accept`,
      linkPath: '/dashboard/nurse/transfers',
      entity: 'patient_transfer',
      entityId: id,
      personId: existing.PERSON_ID,
    });
    await this.notifyUser(existing.REQUESTED_BY_USER_ID, {
      type: 'TransferBedAssigned',
      title: `Bed assigned for ${existing.TRANSFER_NO}`,
      body: `${bed.ward?.NAME ?? 'Ward'} / ${bed.LABEL}`,
      linkPath: '/dashboard/doctor/clinical/transfers',
      entity: 'patient_transfer',
      entityId: id,
      personId: existing.PERSON_ID,
      roleHint: 'DOCTOR',
    });

    return this.toResponse(await this.load(id));
  }

  async accept(id: number, dto: AcceptTransferDto, actor?: AuthUser) {
    const existing = await this.load(id);
    if (existing.STATUS !== 'BedReserved') {
      throw new ConflictException(
        `Receiving ward can only accept when status is BedReserved (now ${existing.STATUS})`,
      );
    }
    const actorLabel = actorLabelOf(actor);
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      await tx.patientTransfers.update({
        where: { TRANSFER_ID: id },
        data: {
          STATUS: 'ReceivingAccepted',
          ACCEPTED_BY_USER_ID: actor?.id ?? null,
          ACCEPTED_AT: now,
          UPDATED_BY_ID: actor?.id ?? null,
          UPDATED_BY: actorLabel,
          UPDATED_DATE: now,
        },
      });
      await this.appendEvent(tx, {
        transferId: id,
        eventType: 'transfer:accept',
        actor,
        note: dto.note,
        oldStatus: existing.STATUS,
        newStatus: 'ReceivingAccepted',
      });
    });

    await this.audit.log({
      type: 'transfer:accept',
      entity: 'patient_transfer',
      entityId: id,
      personId: existing.PERSON_ID,
      userId: actor?.id,
      createdBy: actorLabel,
      item: `Transfer ${existing.TRANSFER_NO} accepted by receiving ward`,
    });

    await this.notifyRoles(['NURSE'], {
      type: 'TransferAccepted',
      title: `Receiving accepted: ${existing.TRANSFER_NO}`,
      body: 'Current ward may mark patient departed',
      linkPath: '/dashboard/nurse/transfers',
      entity: 'patient_transfer',
      entityId: id,
      personId: existing.PERSON_ID,
    });

    return this.toResponse(await this.load(id));
  }

  async depart(id: number, dto: DepartTransferDto, actor?: AuthUser) {
    const existing = await this.load(id);
    if (existing.STATUS !== 'ReceivingAccepted') {
      throw new ConflictException(
        `Can only depart when ReceivingAccepted (now ${existing.STATUS})`,
      );
    }
    const actorLabel = actorLabelOf(actor);
    const now = new Date();
    const handover = dto.handoverNotes?.trim() || existing.HANDOVER_NOTES;

    await this.prisma.$transaction(async (tx) => {
      await tx.patientTransfers.update({
        where: { TRANSFER_ID: id },
        data: {
          STATUS: 'InTransit',
          HANDOVER_NOTES: handover,
          DEPARTED_BY_USER_ID: actor?.id ?? null,
          DEPARTED_AT: now,
          UPDATED_BY_ID: actor?.id ?? null,
          UPDATED_BY: actorLabel,
          UPDATED_DATE: now,
        },
      });
      await this.appendEvent(tx, {
        transferId: id,
        eventType: 'transfer:depart',
        actor,
        note: dto.note ?? handover,
        oldStatus: existing.STATUS,
        newStatus: 'InTransit',
      });
    });

    await this.audit.log({
      type: 'transfer:depart',
      entity: 'patient_transfer',
      entityId: id,
      personId: existing.PERSON_ID,
      userId: actor?.id,
      createdBy: actorLabel,
      item: `Transfer ${existing.TRANSFER_NO} in transit`,
    });

    await this.notifyRoles(['NURSE', 'RECORDS'], {
      type: 'TransferAccepted',
      title: `In transit: ${existing.TRANSFER_NO}`,
      body: 'Receiving ward should confirm arrival',
      linkPath: '/dashboard/nurse/transfers',
      entity: 'patient_transfer',
      entityId: id,
      personId: existing.PERSON_ID,
    });

    return this.toResponse(await this.load(id));
  }

  async confirmArrival(id: number, dto: ConfirmArrivalDto, actor?: AuthUser) {
    const existing = await this.load(id);
    if (existing.STATUS !== 'InTransit') {
      throw new ConflictException(
        `Can only confirm arrival when InTransit (now ${existing.STATUS})`,
      );
    }

    const actorLabel = actorLabelOf(actor);
    const now = new Date();
    const needsBedOccupy =
      NEEDS_BED.has(existing.TRANSFER_TYPE) &&
      existing.ADMISSION_ID != null &&
      existing.ALLOCATED_BED_ID != null;

    if (needsBedOccupy) {
      // Free RESERVED so admissions.transfer can occupy AVAILABLE bed
      await this.prisma.beds.update({
        where: { BED_ID: existing.ALLOCATED_BED_ID! },
        data: {
          STATUS: 'AVAILABLE',
          UPDATED_BY: actorLabel,
          UPDATED_DATE: now,
        },
      });
      await this.admissions.transfer(
        existing.ADMISSION_ID!,
        { bedId: existing.ALLOCATED_BED_ID! },
        actor,
      );
    } else if (existing.TRANSFER_TYPE === 'ExternalReferral' && existing.ADMISSION_ID) {
      await this.prisma.admissions.update({
        where: { ADMISSION_ID: existing.ADMISSION_ID },
        data: {
          STATUS: 'ON_LEAVE',
          UPDATED_BY_ID: actor?.id ?? null,
          UPDATED_BY: actorLabel,
          UPDATED_DATE: now,
        },
      });
      if (existing.ALLOCATED_BED_ID) {
        await this.prisma.beds.update({
          where: { BED_ID: existing.ALLOCATED_BED_ID },
          data: { STATUS: 'AVAILABLE', UPDATED_BY: actorLabel, UPDATED_DATE: now },
        });
      }
    } else if (existing.TRANSFER_TYPE === 'WardToClinic' && existing.ADMISSION_ID) {
      // Clinic destination: leave inpatient location; free bed if any
      const adm = await this.prisma.admissions.findUnique({
        where: { ADMISSION_ID: existing.ADMISSION_ID },
      });
      if (adm?.BED_ID) {
        await this.prisma.beds.update({
          where: { BED_ID: adm.BED_ID },
          data: { STATUS: 'CLEANING', UPDATED_BY: actorLabel, UPDATED_DATE: now },
        });
      }
      await this.prisma.admissions.update({
        where: { ADMISSION_ID: existing.ADMISSION_ID },
        data: {
          BED_ID: null,
          STATUS: 'ON_LEAVE',
          UPDATED_BY_ID: actor?.id ?? null,
          UPDATED_BY: actorLabel,
          UPDATED_DATE: now,
        },
      });
    }

    // Optional billing class change note
    let billingNote: string | null = null;
    if (existing.FROM_WARD_ID && existing.TO_WARD_ID && existing.FROM_WARD_ID !== existing.TO_WARD_ID) {
      const [fromW, toW] = await Promise.all([
        this.prisma.wards.findUnique({ where: { WARD_ID: existing.FROM_WARD_ID } }),
        this.prisma.wards.findUnique({ where: { WARD_ID: existing.TO_WARD_ID } }),
      ]);
      if (fromW?.WARD_CLASS && toW?.WARD_CLASS && fromW.WARD_CLASS !== toW.WARD_CLASS) {
        billingNote = `Ward class changed ${fromW.WARD_CLASS} → ${toW.WARD_CLASS}; review daily rate / billing`;
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.patientTransfers.update({
        where: { TRANSFER_ID: id },
        data: {
          STATUS: 'Completed',
          RECEIVED_BY_USER_ID: actor?.id ?? null,
          RECEIVED_AT: now,
          UPDATED_BY_ID: actor?.id ?? null,
          UPDATED_BY: actorLabel,
          UPDATED_DATE: now,
        },
      });
      await this.appendEvent(tx, {
        transferId: id,
        eventType: 'transfer:complete',
        actor,
        note: dto.note ?? billingNote,
        oldStatus: existing.STATUS,
        newStatus: 'Completed',
      });
      if (billingNote) {
        await this.appendEvent(tx, {
          transferId: id,
          eventType: 'transfer:billing-note',
          actor,
          note: billingNote,
          oldStatus: 'Completed',
          newStatus: 'Completed',
        });
      }
    });

    await this.audit.log({
      type: 'transfer:complete',
      entity: 'patient_transfer',
      entityId: id,
      personId: existing.PERSON_ID,
      userId: actor?.id,
      createdBy: actorLabel,
      item: `Transfer ${existing.TRANSFER_NO} completed`,
      newValue: {
        bedId: existing.ALLOCATED_BED_ID,
        wardId: existing.TO_WARD_ID,
        billingNote,
      },
    });

    await this.notifyUser(existing.REQUESTED_BY_USER_ID, {
      type: 'TransferCompleted',
      title: `Transfer completed: ${existing.TRANSFER_NO}`,
      body: 'Patient location updated after receiving ward confirmation',
      linkPath: '/dashboard/doctor/clinical/transfers',
      entity: 'patient_transfer',
      entityId: id,
      personId: existing.PERSON_ID,
      roleHint: 'DOCTOR',
    });
    await this.notifyRoles(['NURSE', 'RECORDS'], {
      type: 'TransferCompleted',
      title: `Transfer completed: ${existing.TRANSFER_NO}`,
      body: billingNote ?? 'Occupancy and location updated',
      linkPath: '/dashboard/nurse/transfers',
      entity: 'patient_transfer',
      entityId: id,
      personId: existing.PERSON_ID,
    });

    return this.toResponse(await this.load(id));
  }

  async reject(id: number, dto: RejectTransferDto, actor?: AuthUser) {
    const existing = await this.load(id);
    if (TERMINAL.has(existing.STATUS) || existing.STATUS === 'InTransit') {
      throw new ConflictException(`Cannot reject transfer in status ${existing.STATUS}`);
    }
    const actorLabel = actorLabelOf(actor);
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      if (existing.ALLOCATED_BED_ID) {
        await tx.beds.update({
          where: { BED_ID: existing.ALLOCATED_BED_ID },
          data: {
            STATUS: 'AVAILABLE',
            UPDATED_BY: actorLabel,
            UPDATED_DATE: now,
          },
        });
      }
      await tx.patientTransfers.update({
        where: { TRANSFER_ID: id },
        data: {
          STATUS: 'Rejected',
          REJECTION_REASON: dto.reason.trim(),
          ALLOCATED_BED_ID: null,
          UPDATED_BY_ID: actor?.id ?? null,
          UPDATED_BY: actorLabel,
          UPDATED_DATE: now,
        },
      });
      await this.appendEvent(tx, {
        transferId: id,
        eventType: 'transfer:reject',
        actor,
        note: dto.reason.trim(),
        oldStatus: existing.STATUS,
        newStatus: 'Rejected',
      });
    });

    await this.audit.log({
      type: 'transfer:reject',
      entity: 'patient_transfer',
      entityId: id,
      personId: existing.PERSON_ID,
      userId: actor?.id,
      createdBy: actorLabel,
      item: `Transfer ${existing.TRANSFER_NO} rejected`,
      newValue: { reason: dto.reason.trim() },
    });

    await this.notifyUser(existing.REQUESTED_BY_USER_ID, {
      type: 'TransferRejected',
      title: `Transfer rejected: ${existing.TRANSFER_NO}`,
      body: dto.reason.trim(),
      linkPath: '/dashboard/doctor/clinical/transfers',
      entity: 'patient_transfer',
      entityId: id,
      personId: existing.PERSON_ID,
      roleHint: 'DOCTOR',
    });

    return this.toResponse(await this.load(id));
  }

  async cancel(id: number, dto: CancelTransferDto, actor?: AuthUser) {
    const existing = await this.load(id);
    if (TERMINAL.has(existing.STATUS) || ['InTransit', 'ReceivingAccepted'].includes(existing.STATUS)) {
      throw new ConflictException(`Cannot cancel transfer in status ${existing.STATUS}`);
    }
    const actorLabel = actorLabelOf(actor);
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      if (existing.ALLOCATED_BED_ID) {
        await tx.beds.update({
          where: { BED_ID: existing.ALLOCATED_BED_ID },
          data: {
            STATUS: 'AVAILABLE',
            UPDATED_BY: actorLabel,
            UPDATED_DATE: now,
          },
        });
      }
      await tx.patientTransfers.update({
        where: { TRANSFER_ID: id },
        data: {
          STATUS: 'Cancelled',
          REJECTION_REASON: dto.reason?.trim() || existing.REJECTION_REASON,
          ALLOCATED_BED_ID: null,
          UPDATED_BY_ID: actor?.id ?? null,
          UPDATED_BY: actorLabel,
          UPDATED_DATE: now,
        },
      });
      await this.appendEvent(tx, {
        transferId: id,
        eventType: 'transfer:cancel',
        actor,
        note: dto.reason,
        oldStatus: existing.STATUS,
        newStatus: 'Cancelled',
      });
    });

    await this.audit.log({
      type: 'transfer:cancel',
      entity: 'patient_transfer',
      entityId: id,
      personId: existing.PERSON_ID,
      userId: actor?.id,
      createdBy: actorLabel,
      item: `Transfer ${existing.TRANSFER_NO} cancelled`,
    });

    return this.toResponse(await this.load(id));
  }
}
