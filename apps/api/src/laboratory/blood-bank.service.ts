import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../auth/types/auth-user.type';
import {
  CreateBloodDonorDto,
  CreateBloodRequestDto,
  CreateBloodUnitDto,
  IssueBloodRequestDto,
  RecordCrossmatchDto,
  RejectBloodRequestDto,
  UpdateBloodDonorDto,
  UpdateBloodUnitDto,
} from './dto/blood-bank.dto';
import { ROLES } from '../common/constants/roles.constants';

function actorLabel(actor?: AuthUser): string {
  if (!actor) return 'SYSTEM';
  const name = [actor.firstName, actor.lastName].filter(Boolean).join(' ');
  return name || actor.email || 'SYSTEM';
}

function pad(id: number): string {
  return String(id).padStart(4, '0');
}

const PERSON_SELECT = {
  PERSON_ID: true,
  HOSPITAL_NO: true,
  FIRST_NAME: true,
  LAST_NAME: true,
  MIDDLE_NAME: true,
} as const;

type RequestRow = Prisma.BloodRequestsGetPayload<{
  include: { person: { select: typeof PERSON_SELECT }; events: true };
}>;

@Injectable()
export class BloodBankService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private personName(p: {
    FIRST_NAME: string | null;
    MIDDLE_NAME: string | null;
    LAST_NAME: string | null;
  }) {
    return [p.FIRST_NAME, p.MIDDLE_NAME, p.LAST_NAME].filter(Boolean).join(' ') || 'Unknown';
  }

  private toUnit(row: Prisma.BloodUnitsGetPayload<object>) {
    return {
      bloodUnitId: row.BLOOD_UNIT_ID,
      unitNo: row.UNIT_NO,
      bloodGroup: row.BLOOD_GROUP,
      component: row.COMPONENT,
      expiryDate: row.EXPIRY_DATE.toISOString().slice(0, 10),
      status: row.STATUS,
      donorId: row.DONOR_ID,
      donorLabel: row.DONOR_LABEL,
      doctorId: row.DOCTOR_ID,
      doctorLabel: row.DOCTOR_LABEL,
      notes: row.NOTES,
      createdAt: row.CREATED_DATE?.toISOString() ?? null,
      updatedAt: row.UPDATED_DATE?.toISOString() ?? null,
    };
  }

  private toRequest(row: RequestRow) {
    return {
      bloodRequestId: row.BLOOD_REQUEST_ID,
      requestNo: row.REQUEST_NO,
      personId: row.PERSON_ID,
      patientName: this.personName(row.person),
      hospitalNo: row.person.HOSPITAL_NO || `PID-${row.PERSON_ID}`,
      bloodGroup: row.BLOOD_GROUP,
      unitsRequested: row.UNITS_REQUESTED,
      department: row.DEPARTMENT,
      doctorId: row.DOCTOR_ID,
      doctorLabel: row.DOCTOR_LABEL,
      status: row.STATUS,
      crossMatchResult: row.CROSS_MATCH_RESULT,
      notes: row.NOTES,
      rejectReason: row.REJECT_REASON,
      issuedAt: row.ISSUED_AT?.toISOString() ?? null,
      issuedBy: row.ISSUED_BY,
      completedAt: row.COMPLETED_AT?.toISOString() ?? null,
      completedBy: row.COMPLETED_BY,
      createdAt: row.CREATED_DATE?.toISOString() ?? null,
      createdBy: row.CREATED_BY,
      events: (row.events ?? [])
        .slice()
        .sort((a, b) => a.CREATED_DATE.getTime() - b.CREATED_DATE.getTime())
        .map((e) => ({
          eventId: e.EVENT_ID,
          action: e.ACTION,
          reason: e.REASON,
          actorLabel: e.ACTOR_LABEL,
          at: e.CREATED_DATE.toISOString(),
        })),
    };
  }

  private async appendEvent(
    tx: Prisma.TransactionClient,
    bloodRequestId: number,
    action: string,
    actor: AuthUser | undefined,
    reason?: string,
  ) {
    await tx.bloodRequestEvents.create({
      data: {
        BLOOD_REQUEST_ID: bloodRequestId,
        ACTION: action,
        REASON: reason ?? null,
        ACTOR_LABEL: actorLabel(actor),
        ACTOR_ID: actor?.id ?? null,
      },
    });
  }

  private async loadRequest(id: number) {
    const row = await this.prisma.bloodRequests.findUnique({
      where: { BLOOD_REQUEST_ID: id },
      include: {
        person: { select: PERSON_SELECT },
        events: true,
      },
    });
    if (!row) throw new NotFoundException('Blood request not found');
    return row;
  }

  async summary() {
    const [available, reserved, expired, issued, cross, emergency] = await Promise.all([
      this.prisma.bloodUnits.count({ where: { STATUS: 'Available' } }),
      this.prisma.bloodUnits.count({ where: { STATUS: 'Reserved' } }),
      this.prisma.bloodUnits.count({ where: { STATUS: 'Expired' } }),
      this.prisma.bloodUnits.count({ where: { STATUS: 'Issued' } }),
      this.prisma.bloodRequests.count({ where: { STATUS: 'Crossmatching' } }),
      this.prisma.bloodRequests.count({
        where: { DEPARTMENT: { contains: 'Emergency', mode: 'insensitive' }, STATUS: { in: ['Pending', 'Crossmatching'] } },
      }),
    ]);
    const byGroup = await this.prisma.bloodUnits.groupBy({
      by: ['BLOOD_GROUP'],
      where: { STATUS: 'Available' },
      _count: { _all: true },
    });
    return {
      available,
      reserved,
      expired,
      issued,
      crossMatchRequests: cross,
      emergencyRequests: emergency,
      stockByGroup: byGroup.map((g) => ({ bloodGroup: g.BLOOD_GROUP, units: g._count._all })),
    };
  }

  async listUnits(params: { status?: string; bloodGroup?: string; q?: string; page?: number; limit?: number }) {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(200, Math.max(1, params.limit ?? 50));
    const where: Prisma.BloodUnitsWhereInput = {};
    if (params.status) where.STATUS = params.status;
    if (params.bloodGroup) where.BLOOD_GROUP = params.bloodGroup;
    if (params.q?.trim()) {
      const q = params.q.trim();
      where.OR = [
        { UNIT_NO: { contains: q, mode: 'insensitive' } },
        { DONOR_LABEL: { contains: q, mode: 'insensitive' } },
        { COMPONENT: { contains: q, mode: 'insensitive' } },
      ];
    }
    const [total, rows] = await Promise.all([
      this.prisma.bloodUnits.count({ where }),
      this.prisma.bloodUnits.findMany({
        where,
        orderBy: [{ EXPIRY_DATE: 'asc' }, { BLOOD_UNIT_ID: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);
    return { items: rows.map((r) => this.toUnit(r)), meta: { page, limit, total } };
  }

  async createUnit(dto: CreateBloodUnitDto, actor?: AuthUser) {
    const expiry = new Date(dto.expiryDate);
    if (Number.isNaN(expiry.getTime())) throw new BadRequestException('Invalid expiryDate');
    const existing = await this.prisma.bloodUnits.findUnique({ where: { UNIT_NO: dto.unitNo.trim() } });
    if (existing) throw new BadRequestException('Unit number already exists');
    const now = new Date();
    const label = actorLabel(actor);
    let donorLabel = dto.donorLabel?.trim() || null;
    if (dto.donorId) {
      const donor = await this.prisma.bloodDonors.findFirst({
        where: { DONOR_ID: dto.donorId, NOT: { DELETED_FLAG: 'Y' } },
      });
      if (!donor) throw new NotFoundException('Donor not found');
      donorLabel = donor.FULL_NAME;
    }
    let doctorLabel = dto.doctorLabel?.trim() || null;
    if (dto.doctorId) {
      const doc = await this.prisma.users.findUnique({ where: { USER_ID: dto.doctorId } });
      if (!doc) throw new NotFoundException('Doctor not found');
      doctorLabel =
        [doc.FIRST_NAME, doc.LAST_NAME].filter(Boolean).join(' ') ||
        doc.USER_NAME ||
        doctorLabel;
    }
    const status =
      dto.status ??
      (expiry < new Date(now.toISOString().slice(0, 10)) ? 'Expired' : 'Available');
    const row = await this.prisma.bloodUnits.create({
      data: {
        UNIT_NO: dto.unitNo.trim(),
        BLOOD_GROUP: dto.bloodGroup,
        COMPONENT: dto.component,
        EXPIRY_DATE: expiry,
        STATUS: status,
        DONOR_ID: dto.donorId ?? null,
        DONOR_LABEL: donorLabel,
        DOCTOR_ID: dto.doctorId ?? null,
        DOCTOR_LABEL: doctorLabel,
        NOTES: dto.notes?.trim() || null,
        CREATED_BY_ID: actor?.id ?? null,
        CREATED_BY: label,
        CREATED_DATE: now,
      },
    });
    const response = this.toUnit(row);
    await this.audit.log({
      type: 'blood-bank:unit-create',
      entity: 'blood_units',
      entityId: row.BLOOD_UNIT_ID,
      userId: actor?.id,
      createdBy: label,
      item: `Blood unit created: ${response.unitNo}`,
      newValue: response,
    });
    return response;
  }

  async updateUnit(id: number, dto: UpdateBloodUnitDto, actor?: AuthUser) {
    const existing = await this.prisma.bloodUnits.findUnique({ where: { BLOOD_UNIT_ID: id } });
    if (!existing) throw new NotFoundException('Blood unit not found');
    if (
      existing.STATUS === 'Issued' &&
      dto.status &&
      dto.status === 'Available'
    ) {
      throw new BadRequestException(
        'Cannot return an Issued unit to Available. Assignment history is preserved.',
      );
    }
    const now = new Date();
    const label = actorLabel(actor);
    const row = await this.prisma.bloodUnits.update({
      where: { BLOOD_UNIT_ID: id },
      data: {
        STATUS: dto.status ?? undefined,
        DONOR_LABEL: dto.donorLabel !== undefined ? dto.donorLabel.trim() || null : undefined,
        NOTES: dto.notes !== undefined ? dto.notes.trim() || null : undefined,
        EXPIRY_DATE: dto.expiryDate ? new Date(dto.expiryDate) : undefined,
        UPDATED_BY_ID: actor?.id ?? null,
        UPDATED_BY: label,
        UPDATED_DATE: now,
      },
    });
    const response = this.toUnit(row);
    await this.audit.log({
      type: 'blood-bank:unit-update',
      entity: 'blood_units',
      entityId: id,
      userId: actor?.id,
      createdBy: label,
      item: `Blood unit updated: ${response.unitNo}`,
      oldValue: this.toUnit(existing),
      newValue: response,
    });
    return response;
  }

  async listRequests(params: { status?: string; q?: string; page?: number; limit?: number }) {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(200, Math.max(1, params.limit ?? 50));
    const where: Prisma.BloodRequestsWhereInput = {};
    if (params.status) where.STATUS = params.status;
    if (params.q?.trim()) {
      const q = params.q.trim();
      where.OR = [
        { REQUEST_NO: { contains: q, mode: 'insensitive' } },
        { DEPARTMENT: { contains: q, mode: 'insensitive' } },
        { DOCTOR_LABEL: { contains: q, mode: 'insensitive' } },
        {
          person: {
            OR: [
              { FIRST_NAME: { contains: q, mode: 'insensitive' } },
              { LAST_NAME: { contains: q, mode: 'insensitive' } },
              { HOSPITAL_NO: { contains: q, mode: 'insensitive' } },
            ],
          },
        },
      ];
    }
    const [total, rows] = await Promise.all([
      this.prisma.bloodRequests.count({ where }),
      this.prisma.bloodRequests.findMany({
        where,
        include: { person: { select: PERSON_SELECT }, events: true },
        orderBy: { BLOOD_REQUEST_ID: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);
    return { items: rows.map((r) => this.toRequest(r)), meta: { page, limit, total } };
  }

  async getRequest(id: number) {
    return this.toRequest(await this.loadRequest(id));
  }

  async createRequest(dto: CreateBloodRequestDto, actor?: AuthUser) {
    const person = await this.prisma.persons.findUnique({
      where: { PERSON_ID: dto.personId },
      select: PERSON_SELECT,
    });
    if (!person) throw new NotFoundException('Patient not found');
    const now = new Date();
    const label = actorLabel(actor);
    let doctorLabel = dto.doctorLabel?.trim() || null;
    if (dto.doctorId) {
      const doc = await this.prisma.users.findUnique({ where: { USER_ID: dto.doctorId } });
      if (!doc) throw new NotFoundException('Doctor not found');
      doctorLabel =
        [doc.FIRST_NAME, doc.LAST_NAME].filter(Boolean).join(' ') ||
        doc.USER_NAME ||
        doctorLabel;
    }
    const created = await this.prisma.$transaction(async (tx) => {
      const draft = await tx.bloodRequests.create({
        data: {
          REQUEST_NO: `TMP-${Date.now()}`,
          PERSON_ID: dto.personId,
          BLOOD_GROUP: dto.bloodGroup,
          UNITS_REQUESTED: dto.unitsRequested,
          DEPARTMENT: dto.department.trim(),
          DOCTOR_ID: dto.doctorId ?? null,
          DOCTOR_LABEL: doctorLabel,
          STATUS: 'Pending',
          CROSS_MATCH_RESULT: 'Pending',
          NOTES: dto.notes?.trim() || null,
          CREATED_BY_ID: actor?.id ?? null,
          CREATED_BY: label,
          CREATED_DATE: now,
        },
      });
      const requestNo = `BR-${now.getFullYear()}-${pad(draft.BLOOD_REQUEST_ID)}`;
      await tx.bloodRequests.update({
        where: { BLOOD_REQUEST_ID: draft.BLOOD_REQUEST_ID },
        data: { REQUEST_NO: requestNo },
      });
      await this.appendEvent(tx, draft.BLOOD_REQUEST_ID, 'Created', actor);
      return draft.BLOOD_REQUEST_ID;
    });
    const response = await this.getRequest(created);
    await this.audit.log({
      type: 'blood-bank:request-create',
      entity: 'blood_requests',
      entityId: created,
      userId: actor?.id,
      createdBy: label,
      item: `Blood request created: ${response.requestNo}`,
      newValue: response,
    });
    return response;
  }

  async startCrossmatch(id: number, actor?: AuthUser) {
    const existing = await this.loadRequest(id);
    if (!['Pending', 'Crossmatching'].includes(existing.STATUS)) {
      throw new BadRequestException('Only Pending requests can start crossmatch');
    }
    const now = new Date();
    const label = actorLabel(actor);
    await this.prisma.$transaction(async (tx) => {
      await tx.bloodRequests.update({
        where: { BLOOD_REQUEST_ID: id },
        data: {
          STATUS: 'Crossmatching',
          CROSS_MATCH_RESULT: existing.CROSS_MATCH_RESULT || 'Pending',
          UPDATED_BY_ID: actor?.id ?? null,
          UPDATED_BY: label,
          UPDATED_DATE: now,
        },
      });
      await this.appendEvent(tx, id, 'Crossmatch started', actor);
    });
    const response = await this.getRequest(id);
    await this.audit.log({
      type: 'blood-bank:crossmatch-start',
      entity: 'blood_requests',
      entityId: id,
      userId: actor?.id,
      createdBy: label,
      item: `Crossmatch started: ${response.requestNo}`,
      newValue: response,
    });
    return response;
  }

  async recordCrossmatch(id: number, dto: RecordCrossmatchDto, actor?: AuthUser) {
    const existing = await this.loadRequest(id);
    if (!['Pending', 'Crossmatching'].includes(existing.STATUS)) {
      throw new BadRequestException('Cannot record crossmatch for this request status');
    }
    if (dto.bloodUnitId) {
      const unit = await this.prisma.bloodUnits.findUnique({ where: { BLOOD_UNIT_ID: dto.bloodUnitId } });
      if (!unit) throw new NotFoundException('Blood unit not found');
    }
    const now = new Date();
    const label = actorLabel(actor);
    await this.prisma.$transaction(async (tx) => {
      await tx.bloodRequests.update({
        where: { BLOOD_REQUEST_ID: id },
        data: {
          STATUS: 'Crossmatching',
          CROSS_MATCH_RESULT: dto.result,
          UPDATED_BY_ID: actor?.id ?? null,
          UPDATED_BY: label,
          UPDATED_DATE: now,
        },
      });
      const cm = await tx.bloodCrossmatches.create({
        data: {
          CROSSMATCH_NO: `TMP-CM-${Date.now()}`,
          BLOOD_REQUEST_ID: id,
          BLOOD_UNIT_ID: dto.bloodUnitId ?? null,
          PERSON_LABEL: this.personName(existing.person),
          BLOOD_GROUP: existing.BLOOD_GROUP,
          RESULT: dto.result,
          NOTES: dto.notes?.trim() || null,
          CREATED_BY_ID: actor?.id ?? null,
          CREATED_BY: label,
          CREATED_DATE: now,
        },
      });
      await tx.bloodCrossmatches.update({
        where: { CROSSMATCH_ID: cm.CROSSMATCH_ID },
        data: { CROSSMATCH_NO: `CM-${now.getFullYear()}-${pad(cm.CROSSMATCH_ID)}` },
      });
      if (dto.bloodUnitId && dto.result === 'Compatible') {
        await tx.bloodUnits.update({
          where: { BLOOD_UNIT_ID: dto.bloodUnitId },
          data: { STATUS: 'Reserved', UPDATED_BY: label, UPDATED_BY_ID: actor?.id ?? null, UPDATED_DATE: now },
        });
      }
      await this.appendEvent(tx, id, `Crossmatch ${dto.result}`, actor, dto.notes);
    });
    const response = await this.getRequest(id);
    await this.audit.log({
      type: 'blood-bank:crossmatch-record',
      entity: 'blood_requests',
      entityId: id,
      userId: actor?.id,
      createdBy: label,
      item: `Crossmatch recorded: ${response.requestNo} → ${dto.result}`,
      newValue: response,
    });
    return response;
  }

  async issueRequest(id: number, dto: IssueBloodRequestDto, actor?: AuthUser) {
    const existing = await this.loadRequest(id);
    if (!['Pending', 'Crossmatching'].includes(existing.STATUS)) {
      throw new BadRequestException('Only Pending/Crossmatching requests can be issued');
    }
    if (existing.CROSS_MATCH_RESULT === 'Incompatible') {
      throw new BadRequestException('Cannot issue incompatible crossmatch');
    }
    const now = new Date();
    const label = actorLabel(actor);
    const needed = Math.max(1, existing.UNITS_REQUESTED);
    await this.prisma.$transaction(async (tx) => {
      const selectedIds: number[] = [];
      if (dto.bloodUnitIds?.length) {
        selectedIds.push(...dto.bloodUnitIds);
      } else if (dto.bloodUnitId) {
        selectedIds.push(dto.bloodUnitId);
      }
      let units: Array<{ BLOOD_UNIT_ID: number; STATUS: string }> = [];
      if (selectedIds.length) {
        units = await tx.bloodUnits.findMany({
          where: { BLOOD_UNIT_ID: { in: selectedIds } },
        });
        if (units.length !== selectedIds.length) {
          throw new NotFoundException('One or more blood units not found');
        }
        for (const u of units) {
          if (!['Available', 'Reserved'].includes(u.STATUS)) {
            throw new BadRequestException(`Unit ${u.BLOOD_UNIT_ID} is not available to issue`);
          }
        }
      } else {
        units = await tx.bloodUnits.findMany({
          where: {
            BLOOD_GROUP: existing.BLOOD_GROUP,
            STATUS: { in: ['Available', 'Reserved'] },
          },
          orderBy: { EXPIRY_DATE: 'asc' },
          take: needed,
        });
        if (units.length < needed) {
          throw new BadRequestException(
            `Need ${needed} unit(s) for this blood group; only ${units.length} available`,
          );
        }
      }
      for (const unit of units) {
        await tx.bloodUnits.update({
          where: { BLOOD_UNIT_ID: unit.BLOOD_UNIT_ID },
          data: {
            STATUS: 'Issued',
            UPDATED_BY: label,
            UPDATED_BY_ID: actor?.id ?? null,
            UPDATED_DATE: now,
          },
        });
        const cm = await tx.bloodCrossmatches.create({
          data: {
            CROSSMATCH_NO: `TMP-CM-${Date.now()}-${unit.BLOOD_UNIT_ID}`,
            BLOOD_REQUEST_ID: id,
            BLOOD_UNIT_ID: unit.BLOOD_UNIT_ID,
            PERSON_LABEL: this.personName(existing.person),
            BLOOD_GROUP: existing.BLOOD_GROUP,
            RESULT: 'Compatible',
            NOTES: dto.notes?.trim() || 'Issued',
            CREATED_BY_ID: actor?.id ?? null,
            CREATED_BY: label,
            CREATED_DATE: now,
          },
        });
        await tx.bloodCrossmatches.update({
          where: { CROSSMATCH_ID: cm.CROSSMATCH_ID },
          data: { CROSSMATCH_NO: `CM-${now.getFullYear()}-${pad(cm.CROSSMATCH_ID)}` },
        });
      }
      await tx.bloodRequests.update({
        where: { BLOOD_REQUEST_ID: id },
        data: {
          STATUS: 'Issued',
          CROSS_MATCH_RESULT: 'Compatible',
          ISSUED_AT: now,
          ISSUED_BY: label,
          UPDATED_BY_ID: actor?.id ?? null,
          UPDATED_BY: label,
          UPDATED_DATE: now,
        },
      });
      await this.appendEvent(
        tx,
        id,
        'Blood Issued',
        actor,
        dto.notes || `Issued ${units.length} unit(s)`,
      );
    });
    const response = await this.getRequest(id);
    await this.audit.log({
      type: 'blood-bank:issue',
      entity: 'blood_requests',
      entityId: id,
      userId: actor?.id,
      createdBy: label,
      item: `Blood issued: ${response.requestNo}`,
      newValue: response,
    });
    return response;
  }

  async rejectRequest(id: number, dto: RejectBloodRequestDto, actor?: AuthUser) {
    const existing = await this.loadRequest(id);
    if (['Rejected', 'Completed', 'Issued'].includes(existing.STATUS)) {
      throw new BadRequestException('Cannot reject this request status');
    }
    const now = new Date();
    const label = actorLabel(actor);
    await this.prisma.$transaction(async (tx) => {
      await tx.bloodRequests.update({
        where: { BLOOD_REQUEST_ID: id },
        data: {
          STATUS: 'Rejected',
          REJECT_REASON: dto.reason.trim(),
          UPDATED_BY_ID: actor?.id ?? null,
          UPDATED_BY: label,
          UPDATED_DATE: now,
        },
      });
      await this.appendEvent(tx, id, 'Rejected', actor, dto.reason.trim());
    });
    const response = await this.getRequest(id);
    await this.audit.log({
      type: 'blood-bank:reject',
      entity: 'blood_requests',
      entityId: id,
      userId: actor?.id,
      createdBy: label,
      item: `Blood request rejected: ${response.requestNo}`,
      newValue: response,
    });
    return response;
  }

  async completeRequest(id: number, actor?: AuthUser) {
    const existing = await this.loadRequest(id);
    if (existing.STATUS !== 'Issued') {
      throw new BadRequestException('Only Issued requests can be completed');
    }
    const now = new Date();
    const label = actorLabel(actor);
    await this.prisma.$transaction(async (tx) => {
      await tx.bloodRequests.update({
        where: { BLOOD_REQUEST_ID: id },
        data: {
          STATUS: 'Completed',
          COMPLETED_AT: now,
          COMPLETED_BY: label,
          UPDATED_BY_ID: actor?.id ?? null,
          UPDATED_BY: label,
          UPDATED_DATE: now,
        },
      });
      await this.appendEvent(tx, id, 'Transfusion Completed', actor);
    });
    const response = await this.getRequest(id);
    await this.audit.log({
      type: 'blood-bank:complete',
      entity: 'blood_requests',
      entityId: id,
      userId: actor?.id,
      createdBy: label,
      item: `Blood request completed: ${response.requestNo}`,
      newValue: response,
    });
    return response;
  }

  async listCrossmatches(params: { page?: number; limit?: number }) {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(200, Math.max(1, params.limit ?? 50));
    const [total, rows] = await Promise.all([
      this.prisma.bloodCrossmatches.count(),
      this.prisma.bloodCrossmatches.findMany({
        orderBy: { CROSSMATCH_ID: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          request: { select: { REQUEST_NO: true } },
          unit: { select: { UNIT_NO: true } },
        },
      }),
    ]);
    return {
      items: rows.map((r) => ({
        crossmatchId: r.CROSSMATCH_ID,
        crossmatchNo: r.CROSSMATCH_NO,
        requestNo: r.request?.REQUEST_NO ?? null,
        unitNo: r.unit?.UNIT_NO ?? null,
        patientName: r.PERSON_LABEL,
        bloodGroup: r.BLOOD_GROUP,
        result: r.RESULT,
        notes: r.NOTES,
        createdAt: r.CREATED_DATE?.toISOString() ?? null,
        createdBy: r.CREATED_BY,
      })),
      meta: { page, limit, total },
    };
  }

  private toDonor(row: Prisma.BloodDonorsGetPayload<object>) {
    return {
      donorId: row.DONOR_ID,
      donorNo: row.DONOR_NO,
      fullName: row.FULL_NAME,
      phone: row.PHONE,
      address: row.ADDRESS,
      bloodGroup: row.BLOOD_GROUP,
      notes: row.NOTES,
      status: row.STATUS,
      createdAt: row.CREATED_DATE?.toISOString() ?? null,
      createdBy: row.CREATED_BY,
    };
  }

  async listDonors(params?: { q?: string; status?: string; page?: number; limit?: number }) {
    const page = Math.max(1, params?.page ?? 1);
    const limit = Math.min(100, Math.max(1, params?.limit ?? 50));
    const where: Prisma.BloodDonorsWhereInput = {
      NOT: { DELETED_FLAG: 'Y' },
    };
    if (params?.status) where.STATUS = params.status;
    if (params?.q?.trim()) {
      const q = params.q.trim();
      where.OR = [
        { FULL_NAME: { contains: q, mode: 'insensitive' } },
        { PHONE: { contains: q, mode: 'insensitive' } },
        { DONOR_NO: { contains: q, mode: 'insensitive' } },
      ];
    }
    const [total, rows] = await Promise.all([
      this.prisma.bloodDonors.count({ where }),
      this.prisma.bloodDonors.findMany({
        where,
        orderBy: { DONOR_ID: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);
    return { items: rows.map((r) => this.toDonor(r)), meta: { page, limit, total } };
  }

  async getDonor(id: number) {
    const row = await this.prisma.bloodDonors.findFirst({
      where: { DONOR_ID: id, NOT: { DELETED_FLAG: 'Y' } },
    });
    if (!row) throw new NotFoundException('Donor not found');
    return this.toDonor(row);
  }

  async createDonor(dto: CreateBloodDonorDto, actor?: AuthUser) {
    const now = new Date();
    const label = actorLabel(actor);
    const created = await this.prisma.$transaction(async (tx) => {
      const draft = await tx.bloodDonors.create({
        data: {
          DONOR_NO: `TMP-${Date.now()}`,
          FULL_NAME: dto.fullName.trim(),
          PHONE: dto.phone.trim(),
          ADDRESS: dto.address?.trim() || null,
          BLOOD_GROUP: dto.bloodGroup ?? null,
          NOTES: dto.notes?.trim() || null,
          STATUS: 'Active',
          CREATED_BY_ID: actor?.id ?? null,
          CREATED_BY: label,
          CREATED_DATE: now,
        },
      });
      const donorNo = `DN-${now.getFullYear()}-${pad(draft.DONOR_ID)}`;
      return tx.bloodDonors.update({
        where: { DONOR_ID: draft.DONOR_ID },
        data: { DONOR_NO: donorNo },
      });
    });
    const response = this.toDonor(created);
    await this.audit.log({
      type: 'blood-bank:donor-create',
      entity: 'BloodDonor',
      entityId: created.DONOR_ID,
      userId: actor?.id,
      createdBy: label,
      item: response.donorNo,
    });
    return response;
  }

  async updateDonor(id: number, dto: UpdateBloodDonorDto, actor?: AuthUser) {
    const existing = await this.prisma.bloodDonors.findFirst({
      where: { DONOR_ID: id, NOT: { DELETED_FLAG: 'Y' } },
    });
    if (!existing) throw new NotFoundException('Donor not found');
    const now = new Date();
    const label = actorLabel(actor);
    const row = await this.prisma.bloodDonors.update({
      where: { DONOR_ID: id },
      data: {
        FULL_NAME: dto.fullName?.trim(),
        PHONE: dto.phone?.trim(),
        ADDRESS: dto.address !== undefined ? dto.address.trim() || null : undefined,
        BLOOD_GROUP: dto.bloodGroup,
        NOTES: dto.notes !== undefined ? dto.notes.trim() || null : undefined,
        STATUS: dto.status,
        UPDATED_BY_ID: actor?.id ?? null,
        UPDATED_BY: label,
        UPDATED_DATE: now,
      },
    });
    const response = this.toDonor(row);
    await this.audit.log({
      type: 'blood-bank:donor-update',
      entity: 'BloodDonor',
      entityId: id,
      userId: actor?.id,
      createdBy: label,
      item: response.donorNo,
    });
    return response;
  }

  async searchDoctors(q?: string, limit = 20) {
    const take = Math.min(50, Math.max(1, limit));
    const doctorRoles = [
      ROLES.DOCTOR,
      ROLES.CMD,
      ROLES.PSYCHIATRIC_OPC,
      ROLES.ICU,
    ];
    const where: Prisma.UsersWhereInput = {
      OR: [{ LOCK_ACCOUNT: null }, { LOCK_ACCOUNT: { not: 'Y' } }],
      role: { ROLE_NAME: { in: doctorRoles } },
    };
    if (q?.trim()) {
      const term = q.trim();
      where.AND = [
        {
          OR: [
            { FIRST_NAME: { contains: term, mode: 'insensitive' } },
            { LAST_NAME: { contains: term, mode: 'insensitive' } },
            { USER_NAME: { contains: term, mode: 'insensitive' } },
            { EMAIL_ADDRESS: { contains: term, mode: 'insensitive' } },
          ],
        },
      ];
    }
    const rows = await this.prisma.users.findMany({
      where,
      take,
      orderBy: [{ LAST_NAME: 'asc' }, { FIRST_NAME: 'asc' }],
      select: {
        USER_ID: true,
        FIRST_NAME: true,
        LAST_NAME: true,
        USER_NAME: true,
        EMAIL_ADDRESS: true,
        role: { select: { ROLE_NAME: true } },
      },
    });
    return {
      items: rows.map((u) => ({
        userId: u.USER_ID,
        name:
          [u.FIRST_NAME, u.LAST_NAME].filter(Boolean).join(' ') ||
          u.USER_NAME ||
          u.EMAIL_ADDRESS ||
          `#${u.USER_ID}`,
        email: u.EMAIL_ADDRESS,
        role: u.role?.ROLE_NAME ?? null,
      })),
    };
  }

  async issueHistory(params?: { page?: number; limit?: number; q?: string }) {
    const page = Math.max(1, params?.page ?? 1);
    const limit = Math.min(100, Math.max(1, params?.limit ?? 50));
    const where: Prisma.BloodCrossmatchesWhereInput = {
      RESULT: 'Compatible',
      BLOOD_UNIT_ID: { not: null },
      request: {
        ISSUED_AT: { not: null },
        STATUS: { in: ['Issued', 'Completed'] },
      },
    };
    if (params?.q?.trim()) {
      const q = params.q.trim();
      where.AND = [
        {
          OR: [
            { PERSON_LABEL: { contains: q, mode: 'insensitive' } },
            { CROSSMATCH_NO: { contains: q, mode: 'insensitive' } },
            { request: { REQUEST_NO: { contains: q, mode: 'insensitive' } } },
            { unit: { UNIT_NO: { contains: q, mode: 'insensitive' } } },
          ],
        },
      ];
    }
    const [total, rows] = await Promise.all([
      this.prisma.bloodCrossmatches.count({ where }),
      this.prisma.bloodCrossmatches.findMany({
        where,
        include: {
          request: {
            select: {
              REQUEST_NO: true,
              PERSON_ID: true,
              DEPARTMENT: true,
              ISSUED_AT: true,
              ISSUED_BY: true,
              STATUS: true,
            },
          },
          unit: {
            select: {
              UNIT_NO: true,
              BLOOD_GROUP: true,
              COMPONENT: true,
              STATUS: true,
              DONOR_LABEL: true,
            },
          },
        },
        orderBy: { CROSSMATCH_ID: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);
    return {
      items: rows.map((r) => ({
        crossmatchId: r.CROSSMATCH_ID,
        crossmatchNo: r.CROSSMATCH_NO,
        requestNo: r.request?.REQUEST_NO ?? null,
        personId: r.request?.PERSON_ID ?? null,
        patientName: r.PERSON_LABEL,
        unitNo: r.unit?.UNIT_NO ?? null,
        bloodGroup: r.BLOOD_GROUP,
        component: r.unit?.COMPONENT ?? null,
        unitStatus: r.unit?.STATUS ?? null,
        donorLabel: r.unit?.DONOR_LABEL ?? null,
        department: r.request?.DEPARTMENT ?? null,
        issuedAt: r.request?.ISSUED_AT?.toISOString() ?? r.CREATED_DATE?.toISOString() ?? null,
        issuedBy: r.request?.ISSUED_BY ?? r.CREATED_BY,
        requestStatus: r.request?.STATUS ?? null,
      })),
      meta: { page, limit, total },
    };
  }
}
