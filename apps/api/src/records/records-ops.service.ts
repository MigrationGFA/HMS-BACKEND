import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../auth/types/auth-user.type';
import {
  ArchiveAccessRequestDto,
  CreateArchiveDto,
  CreateFileRequestDto,
  GenerateReportDto,
  UpdateArchiveDto,
  UpdateFileRequestStatusDto,
} from './dto/records-ops.dto';

function actorLabel(user: AuthUser): string {
  return [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email;
}

function personName(p: {
  FIRST_NAME: string | null;
  LAST_NAME: string | null;
  HOSPITAL_NO: string | null;
  PERSON_ID: number;
}): string {
  return (
    [p.FIRST_NAME, p.LAST_NAME].filter(Boolean).join(' ') ||
    p.HOSPITAL_NO ||
    `#${p.PERSON_ID}`
  );
}

function startOfLocalDay(offsetMin: number, d = new Date()): Date {
  const localMs = d.getTime() + offsetMin * 60_000;
  const local = new Date(localMs);
  const startLocal = new Date(
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()),
  );
  return new Date(startLocal.getTime() - offsetMin * 60_000);
}

function rangeBounds(
  range: string,
  offsetMin: number,
): { from: Date; to: Date } {
  const to = new Date();
  const from = startOfLocalDay(offsetMin);
  switch (range) {
    case 'week':
      from.setTime(from.getTime() - 6 * 24 * 60 * 60 * 1000);
      break;
    case 'month':
      from.setTime(from.getTime() - 29 * 24 * 60 * 60 * 1000);
      break;
    case 'quarter':
      from.setTime(from.getTime() - 89 * 24 * 60 * 60 * 1000);
      break;
    case 'year':
      from.setTime(from.getTime() - 364 * 24 * 60 * 60 * 1000);
      break;
    case 'today':
    default:
      break;
  }
  return { from, to };
}

@Injectable()
export class RecordsOpsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private notDeletedFile(): Prisma.RecordFileRequestsWhereInput {
    return { NOT: { DELETED_FLAG: 'Y' } };
  }

  private notDeletedArchive(): Prisma.RecordArchivesWhereInput {
    return { NOT: { DELETED_FLAG: 'Y' } };
  }

  private notDeletedSnapshot(): Prisma.RecordReportSnapshotsWhereInput {
    return { NOT: { DELETED_FLAG: 'Y' } };
  }

  private async nextNo(
    model: 'file' | 'archive',
    year: number,
  ): Promise<string> {
    if (model === 'file') {
      const prefix = `RFR-${year}-`;
      const latest = await this.prisma.recordFileRequests.findFirst({
        where: { REQUEST_NO: { startsWith: prefix } },
        orderBy: { REQUEST_NO: 'desc' },
        select: { REQUEST_NO: true },
      });
      let next = 1;
      if (latest?.REQUEST_NO) {
        const n = Number(latest.REQUEST_NO.slice(prefix.length));
        if (Number.isFinite(n) && n >= next) next = n + 1;
      }
      return `${prefix}${String(next).padStart(4, '0')}`;
    }
    const prefix = `RA-${year}-`;
    const latest = await this.prisma.recordArchives.findFirst({
      where: { ARCHIVE_NO: { startsWith: prefix } },
      orderBy: { ARCHIVE_NO: 'desc' },
      select: { ARCHIVE_NO: true },
    });
    let next = 1;
    if (latest?.ARCHIVE_NO) {
      const n = Number(latest.ARCHIVE_NO.slice(prefix.length));
      if (Number.isFinite(n) && n >= next) next = n + 1;
    }
    return `${prefix}${String(next).padStart(4, '0')}`;
  }

  private mapFile(
    row: {
      REQUEST_ID: number;
      REQUEST_NO: string;
      PERSON_ID: number;
      REQUESTED_BY: string;
      REQUESTED_BY_USER_ID: number | null;
      DEPARTMENT: string;
      REASON: string;
      LOCATION: string;
      DUE_DATE: Date | null;
      STATUS: string;
      CREATED_DATE: Date | null;
    },
    person?: {
      FIRST_NAME: string | null;
      LAST_NAME: string | null;
      HOSPITAL_NO: string | null;
      PERSON_ID: number;
    } | null,
  ) {
    return {
      requestId: row.REQUEST_ID,
      requestNo: row.REQUEST_NO,
      personId: row.PERSON_ID,
      hospitalNo: person?.HOSPITAL_NO ?? null,
      patientName: person ? personName(person) : `Person #${row.PERSON_ID}`,
      requestedBy: row.REQUESTED_BY,
      requestedByUserId: row.REQUESTED_BY_USER_ID,
      department: row.DEPARTMENT,
      reason: row.REASON,
      location: row.LOCATION,
      dueDate: row.DUE_DATE?.toISOString().slice(0, 10) ?? null,
      status: row.STATUS,
      createdAt: row.CREATED_DATE?.toISOString() ?? null,
    };
  }

  private async markOverdue() {
    const today = startOfLocalDay(60);
    await this.prisma.recordFileRequests.updateMany({
      where: {
        ...this.notDeletedFile(),
        STATUS: { in: ['Requested', 'Released', 'In Transit'] },
        DUE_DATE: { lt: today },
      },
      data: { STATUS: 'Overdue', UPDATED_DATE: new Date() },
    });
  }

  async listFileRequests(params: {
    status?: string;
    q?: string;
    page?: number;
    limit?: number;
  }) {
    await this.markOverdue();
    const page = Math.max(params.page ?? 1, 1);
    const limit = Math.min(Math.max(params.limit ?? 50, 1), 200);
    const q = params.q?.trim();
    const where: Prisma.RecordFileRequestsWhereInput = {
      ...this.notDeletedFile(),
      ...(params.status ? { STATUS: params.status } : {}),
      ...(q
        ? {
            OR: [
              { REQUEST_NO: { contains: q, mode: 'insensitive' } },
              { REQUESTED_BY: { contains: q, mode: 'insensitive' } },
              { DEPARTMENT: { contains: q, mode: 'insensitive' } },
              { REASON: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [rows, total, requested, released, transit, overdue, returned, missing] =
      await Promise.all([
        this.prisma.recordFileRequests.findMany({
          where,
          orderBy: { CREATED_DATE: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
        }),
        this.prisma.recordFileRequests.count({ where }),
        this.prisma.recordFileRequests.count({
          where: { ...this.notDeletedFile(), STATUS: 'Requested' },
        }),
        this.prisma.recordFileRequests.count({
          where: { ...this.notDeletedFile(), STATUS: 'Released' },
        }),
        this.prisma.recordFileRequests.count({
          where: { ...this.notDeletedFile(), STATUS: 'In Transit' },
        }),
        this.prisma.recordFileRequests.count({
          where: { ...this.notDeletedFile(), STATUS: 'Overdue' },
        }),
        this.prisma.recordFileRequests.count({
          where: { ...this.notDeletedFile(), STATUS: 'Returned' },
        }),
        this.prisma.recordFileRequests.count({
          where: { ...this.notDeletedFile(), STATUS: 'Missing' },
        }),
      ]);

    const personIds = [...new Set(rows.map((r) => r.PERSON_ID))];
    const persons = personIds.length
      ? await this.prisma.persons.findMany({
          where: { PERSON_ID: { in: personIds } },
          select: {
            PERSON_ID: true,
            FIRST_NAME: true,
            LAST_NAME: true,
            HOSPITAL_NO: true,
          },
        })
      : [];
    const pmap = new Map(persons.map((p) => [p.PERSON_ID, p]));

    return {
      items: rows.map((r) => this.mapFile(r, pmap.get(r.PERSON_ID))),
      meta: { page, limit, total },
      kpis: {
        today: total,
        released,
        transit,
        overdue,
        returned,
        missing,
        requested,
      },
    };
  }

  async getFileRequest(id: number) {
    const row = await this.prisma.recordFileRequests.findFirst({
      where: { REQUEST_ID: id, ...this.notDeletedFile() },
      include: { events: { orderBy: { CREATED_DATE: 'desc' } } },
    });
    if (!row) throw new NotFoundException('File request not found');
    const person = await this.prisma.persons.findUnique({
      where: { PERSON_ID: row.PERSON_ID },
      select: {
        PERSON_ID: true,
        FIRST_NAME: true,
        LAST_NAME: true,
        HOSPITAL_NO: true,
      },
    });
    return {
      ...this.mapFile(row, person),
      events: row.events.map((e) => ({
        eventId: e.EVENT_ID,
        eventType: e.EVENT_TYPE,
        oldStatus: e.OLD_STATUS,
        newStatus: e.NEW_STATUS,
        note: e.NOTE,
        location: e.LOCATION,
        actorLabel: e.ACTOR_LABEL,
        createdAt: e.CREATED_DATE?.toISOString() ?? null,
      })),
    };
  }

  async createFileRequest(dto: CreateFileRequestDto, user: AuthUser) {
    const person = await this.prisma.persons.findUnique({
      where: { PERSON_ID: dto.personId },
    });
    if (!person) throw new NotFoundException('Patient not found');
    const label = actorLabel(user);
    const now = new Date();
    const requestNo = await this.nextNo('file', now.getFullYear());
    const row = await this.prisma.recordFileRequests.create({
      data: {
        REQUEST_NO: requestNo,
        PERSON_ID: dto.personId,
        REQUESTED_BY: dto.requestedBy?.trim() || label,
        REQUESTED_BY_USER_ID: user.id,
        DEPARTMENT: dto.department.trim(),
        REASON: dto.reason.trim(),
        LOCATION: 'Records',
        DUE_DATE: dto.dueDate ? new Date(dto.dueDate) : null,
        STATUS: 'Requested',
        CREATED_BY_ID: user.id,
        CREATED_BY: label,
        CREATED_DATE: now,
        DELETED_FLAG: 'N',
        events: {
          create: {
            EVENT_TYPE: 'Created',
            NEW_STATUS: 'Requested',
            ACTOR_USER_ID: user.id,
            ACTOR_LABEL: label,
            CREATED_DATE: now,
          },
        },
      },
    });
    await this.audit.log({
      type: 'records-file:create',
      item: requestNo,
      entity: 'RecordFileRequest',
      entityId: row.REQUEST_ID,
      personId: dto.personId,
      userId: user.id,
      createdBy: label,
      newValue: { department: dto.department, reason: dto.reason },
    });
    return this.mapFile(row, person);
  }

  async updateFileStatus(
    id: number,
    dto: UpdateFileRequestStatusDto,
    user: AuthUser,
  ) {
    const existing = await this.prisma.recordFileRequests.findFirst({
      where: { REQUEST_ID: id, ...this.notDeletedFile() },
    });
    if (!existing) throw new NotFoundException('File request not found');

    const next = dto.status;
    const cur = existing.STATUS;
    const allowed: Record<string, string[]> = {
      Requested: ['Released', 'Missing', 'Overdue'],
      Released: ['In Transit', 'Returned', 'Missing', 'Overdue'],
      'In Transit': ['Returned', 'Missing', 'Overdue'],
      Overdue: ['Released', 'In Transit', 'Returned', 'Missing'],
      Returned: [],
      Missing: ['Returned'],
    };
    if (!(allowed[cur] ?? []).includes(next) && next !== cur) {
      throw new BadRequestException(
        `Cannot transition from ${cur} to ${next}`,
      );
    }

    const label = actorLabel(user);
    const now = new Date();
    const row = await this.prisma.recordFileRequests.update({
      where: { REQUEST_ID: id },
      data: {
        STATUS: next,
        ...(dto.location ? { LOCATION: dto.location.trim() } : {}),
        UPDATED_BY_ID: user.id,
        UPDATED_BY: label,
        UPDATED_DATE: now,
        events: {
          create: {
            EVENT_TYPE: 'StatusChange',
            OLD_STATUS: cur,
            NEW_STATUS: next,
            NOTE: dto.note?.trim() ?? null,
            LOCATION: dto.location?.trim() ?? null,
            ACTOR_USER_ID: user.id,
            ACTOR_LABEL: label,
            CREATED_DATE: now,
          },
        },
      },
    });
    await this.audit.log({
      type: 'records-file:status',
      item: existing.REQUEST_NO,
      entity: 'RecordFileRequest',
      entityId: id,
      personId: existing.PERSON_ID,
      userId: user.id,
      createdBy: label,
      oldValue: { status: cur },
      newValue: { status: next },
    });
    const person = await this.prisma.persons.findUnique({
      where: { PERSON_ID: row.PERSON_ID },
      select: {
        PERSON_ID: true,
        FIRST_NAME: true,
        LAST_NAME: true,
        HOSPITAL_NO: true,
      },
    });
    return this.mapFile(row, person);
  }

  private mapArchive(
    row: {
      ARCHIVE_ID: number;
      ARCHIVE_NO: string;
      PERSON_ID: number;
      CATEGORY: string;
      ACCESS_LEVEL: string;
      LAST_VISIT_AT: Date | null;
      ARCHIVED_AT: Date;
      RETENTION_UNTIL: Date | null;
      DUE_REVIEW_AT: Date | null;
      STATUS: string;
      NOTES: string | null;
    },
    person?: {
      FIRST_NAME: string | null;
      LAST_NAME: string | null;
      HOSPITAL_NO: string | null;
      PERSON_ID: number;
    } | null,
  ) {
    return {
      archiveId: row.ARCHIVE_ID,
      archiveNo: row.ARCHIVE_NO,
      personId: row.PERSON_ID,
      hospitalNo: person?.HOSPITAL_NO ?? null,
      patientName: person ? personName(person) : `Person #${row.PERSON_ID}`,
      category: row.CATEGORY,
      accessLevel: row.ACCESS_LEVEL,
      lastVisit: row.LAST_VISIT_AT?.toISOString().slice(0, 10) ?? null,
      archiveDate: row.ARCHIVED_AT.toISOString().slice(0, 10),
      retentionUntil: row.RETENTION_UNTIL?.toISOString().slice(0, 10) ?? null,
      dueReview: row.DUE_REVIEW_AT?.toISOString().slice(0, 10) ?? null,
      status: row.STATUS,
      notes: row.NOTES,
    };
  }

  async listArchives(params: {
    category?: string;
    q?: string;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(params.page ?? 1, 1);
    const limit = Math.min(Math.max(params.limit ?? 50, 1), 200);
    const q = params.q?.trim();
    const where: Prisma.RecordArchivesWhereInput = {
      ...this.notDeletedArchive(),
      STATUS: 'Archived',
      ...(params.category ? { CATEGORY: params.category } : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.recordArchives.findMany({
        where,
        orderBy: { ARCHIVED_AT: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.recordArchives.count({ where }),
    ]);

    // If q provided, filter after person join
    const personIds = [...new Set(rows.map((r) => r.PERSON_ID))];
    const persons = personIds.length
      ? await this.prisma.persons.findMany({
          where: { PERSON_ID: { in: personIds } },
          select: {
            PERSON_ID: true,
            FIRST_NAME: true,
            LAST_NAME: true,
            HOSPITAL_NO: true,
          },
        })
      : [];
    const pmap = new Map(persons.map((p) => [p.PERSON_ID, p]));
    let items = rows.map((r) => this.mapArchive(r, pmap.get(r.PERSON_ID)));
    if (q) {
      const qq = q.toLowerCase();
      items = items.filter(
        (i) =>
          i.archiveNo.toLowerCase().includes(qq) ||
          i.patientName.toLowerCase().includes(qq) ||
          (i.hospitalNo ?? '').toLowerCase().includes(qq),
      );
    }

    const base = { ...this.notDeletedArchive(), STATUS: 'Archived' as const };
    const today = startOfLocalDay(60);
    const [inactive, deceased, longStay, restricted, dueReview, archived] =
      await Promise.all([
        this.prisma.recordArchives.count({
          where: { ...base, CATEGORY: 'Inactive' },
        }),
        this.prisma.recordArchives.count({
          where: { ...base, CATEGORY: 'Deceased' },
        }),
        this.prisma.recordArchives.count({
          where: { ...base, CATEGORY: 'Long-Stay' },
        }),
        this.prisma.recordArchives.count({
          where: {
            ...base,
            CATEGORY: { in: ['Restricted', 'Legal Hold'] },
          },
        }),
        this.prisma.recordArchives.count({
          where: {
            ...base,
            DUE_REVIEW_AT: { lte: today },
          },
        }),
        this.prisma.recordArchives.count({ where: base }),
      ]);

    return {
      items,
      meta: { page, limit, total: q ? items.length : total },
      kpis: {
        archived,
        inactive,
        deceased,
        longStay,
        dueReview,
        restricted,
      },
    };
  }

  async createArchive(dto: CreateArchiveDto, user: AuthUser) {
    const person = await this.prisma.persons.findUnique({
      where: { PERSON_ID: dto.personId },
    });
    if (!person) throw new NotFoundException('Patient not found');
    const existing = await this.prisma.recordArchives.findUnique({
      where: { PERSON_ID: dto.personId },
    });
    const label = actorLabel(user);
    const now = new Date();

    const lastVisit =
      (
        await this.prisma.triage.findFirst({
          where: { PERSON_ID: dto.personId },
          orderBy: { ARRIVAL_AT: 'desc' },
          select: { ARRIVAL_AT: true },
        })
      )?.ARRIVAL_AT ?? person.CREATED_DATE;

    if (existing && existing.DELETED_FLAG !== 'Y') {
      if (existing.STATUS === 'Archived') {
        throw new ConflictException('Patient is already archived');
      }
      const row = await this.prisma.recordArchives.update({
        where: { ARCHIVE_ID: existing.ARCHIVE_ID },
        data: {
          CATEGORY: dto.category,
          ACCESS_LEVEL: dto.accessLevel ?? 'Standard',
          LAST_VISIT_AT: lastVisit,
          ARCHIVED_AT: now,
          RETENTION_UNTIL: dto.retentionUntil
            ? new Date(dto.retentionUntil)
            : null,
          DUE_REVIEW_AT: dto.dueReviewAt ? new Date(dto.dueReviewAt) : null,
          STATUS: 'Archived',
          NOTES: dto.notes?.trim() ?? null,
          UPDATED_BY_ID: user.id,
          UPDATED_BY: label,
          UPDATED_DATE: now,
          DELETED_FLAG: 'N',
        },
      });
      await this.audit.log({
        type: 'records-archive:create',
        item: row.ARCHIVE_NO,
        entity: 'RecordArchive',
        entityId: row.ARCHIVE_ID,
        personId: dto.personId,
        userId: user.id,
        createdBy: label,
        newValue: { category: dto.category },
      });
      return this.mapArchive(row, person);
    }

    const archiveNo = await this.nextNo('archive', now.getFullYear());
    const row = await this.prisma.recordArchives.create({
      data: {
        ARCHIVE_NO: archiveNo,
        PERSON_ID: dto.personId,
        CATEGORY: dto.category,
        ACCESS_LEVEL: dto.accessLevel ?? 'Standard',
        LAST_VISIT_AT: lastVisit,
        ARCHIVED_AT: now,
        RETENTION_UNTIL: dto.retentionUntil
          ? new Date(dto.retentionUntil)
          : null,
        DUE_REVIEW_AT: dto.dueReviewAt ? new Date(dto.dueReviewAt) : null,
        STATUS: 'Archived',
        NOTES: dto.notes?.trim() ?? null,
        CREATED_BY_ID: user.id,
        CREATED_BY: label,
        CREATED_DATE: now,
        DELETED_FLAG: 'N',
      },
    });
    await this.audit.log({
      type: 'records-archive:create',
      item: archiveNo,
      entity: 'RecordArchive',
      entityId: row.ARCHIVE_ID,
      personId: dto.personId,
      userId: user.id,
      createdBy: label,
      newValue: { category: dto.category },
    });
    return this.mapArchive(row, person);
  }

  async restoreArchive(id: number, user: AuthUser) {
    const existing = await this.prisma.recordArchives.findFirst({
      where: { ARCHIVE_ID: id, ...this.notDeletedArchive() },
    });
    if (!existing) throw new NotFoundException('Archive record not found');
    const label = actorLabel(user);
    const now = new Date();
    const row = await this.prisma.recordArchives.update({
      where: { ARCHIVE_ID: id },
      data: {
        STATUS: 'Restored',
        UPDATED_BY_ID: user.id,
        UPDATED_BY: label,
        UPDATED_DATE: now,
      },
    });
    await this.audit.log({
      type: 'records-archive:restore',
      item: existing.ARCHIVE_NO,
      entity: 'RecordArchive',
      entityId: id,
      personId: existing.PERSON_ID,
      userId: user.id,
      createdBy: label,
    });
    const person = await this.prisma.persons.findUnique({
      where: { PERSON_ID: row.PERSON_ID },
      select: {
        PERSON_ID: true,
        FIRST_NAME: true,
        LAST_NAME: true,
        HOSPITAL_NO: true,
      },
    });
    return this.mapArchive(row, person);
  }

  async updateArchive(id: number, dto: UpdateArchiveDto, user: AuthUser) {
    const existing = await this.prisma.recordArchives.findFirst({
      where: { ARCHIVE_ID: id, ...this.notDeletedArchive() },
    });
    if (!existing) throw new NotFoundException('Archive record not found');
    const label = actorLabel(user);
    const row = await this.prisma.recordArchives.update({
      where: { ARCHIVE_ID: id },
      data: {
        ...(dto.accessLevel != null ? { ACCESS_LEVEL: dto.accessLevel } : {}),
        ...(dto.category != null ? { CATEGORY: dto.category } : {}),
        ...(dto.retentionUntil !== undefined
          ? {
              RETENTION_UNTIL: dto.retentionUntil
                ? new Date(dto.retentionUntil)
                : null,
            }
          : {}),
        ...(dto.dueReviewAt !== undefined
          ? {
              DUE_REVIEW_AT: dto.dueReviewAt
                ? new Date(dto.dueReviewAt)
                : null,
            }
          : {}),
        ...(dto.notes !== undefined ? { NOTES: dto.notes?.trim() ?? null } : {}),
        UPDATED_BY_ID: user.id,
        UPDATED_BY: label,
        UPDATED_DATE: new Date(),
      },
    });
    await this.audit.log({
      type: 'records-archive:update',
      item: existing.ARCHIVE_NO,
      entity: 'RecordArchive',
      entityId: id,
      personId: existing.PERSON_ID,
      userId: user.id,
      createdBy: label,
      newValue: dto,
    });
    const person = await this.prisma.persons.findUnique({
      where: { PERSON_ID: row.PERSON_ID },
      select: {
        PERSON_ID: true,
        FIRST_NAME: true,
        LAST_NAME: true,
        HOSPITAL_NO: true,
      },
    });
    return this.mapArchive(row, person);
  }

  async accessRequest(
    id: number,
    dto: ArchiveAccessRequestDto,
    user: AuthUser,
  ) {
    const existing = await this.prisma.recordArchives.findFirst({
      where: { ARCHIVE_ID: id, ...this.notDeletedArchive() },
    });
    if (!existing) throw new NotFoundException('Archive record not found');
    const label = actorLabel(user);
    await this.audit.log({
      type: 'records-archive:access-request',
      item: existing.ARCHIVE_NO,
      entity: 'RecordArchive',
      entityId: id,
      personId: existing.PERSON_ID,
      userId: user.id,
      createdBy: label,
      newValue: { reason: dto.reason ?? null, accessLevel: existing.ACCESS_LEVEL },
    });
    return {
      ok: true,
      archiveNo: existing.ARCHIVE_NO,
      message: 'Access request logged for supervisor review',
    };
  }

  async reportsSummary(params?: { timezoneOffsetMinutes?: number }) {
    const offsetMin = params?.timezoneOffsetMinutes ?? 60;
    const startOfDay = startOfLocalDay(offsetMin);
    const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

    const [
      totalRegistered,
      newToday,
      returningToday,
      walkInToday,
      referrals,
      admissions,
      discharges,
    ] = await Promise.all([
      this.prisma.persons.count(),
      this.prisma.persons.count({
        where: { CREATED_DATE: { gte: startOfDay, lt: endOfDay } },
      }),
      this.prisma.triage.count({
        where: {
          ARRIVAL_AT: { gte: startOfDay, lt: endOfDay },
          OR: [
            { PATIENT_TYPE: { equals: 'Returning' } },
            { PATIENT_TYPE: { contains: 'Return', mode: 'insensitive' } },
          ],
        },
      }),
      this.prisma.triage.count({
        where: { ARRIVAL_AT: { gte: startOfDay, lt: endOfDay } },
      }),
      this.prisma.clinicalReferrals.count({
        where: { CREATED_DATE: { gte: startOfDay, lt: endOfDay } },
      }),
      this.prisma.admissions.count({
        where: { ADMITTED_AT: { gte: startOfDay, lt: endOfDay } },
      }),
      this.prisma.dischargeDrafts.count({
        where: {
          STATUS: 'Finalized',
          UPDATED_DATE: { gte: startOfDay, lt: endOfDay },
        },
      }),
    ]);

    return {
      totalRegistered,
      newToday,
      returning: returningToday,
      walkIn: walkInToday,
      referrals,
      admissions,
      discharges,
      documents: 0,
    };
  }

  async listReportSnapshots(params?: { page?: number; limit?: number }) {
    const page = Math.max(params?.page ?? 1, 1);
    const limit = Math.min(Math.max(params?.limit ?? 20, 1), 100);
    const where = this.notDeletedSnapshot();
    const [rows, total] = await Promise.all([
      this.prisma.recordReportSnapshots.findMany({
        where,
        orderBy: { CREATED_DATE: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.recordReportSnapshots.count({ where }),
    ]);
    return {
      items: rows.map((r) => ({
        snapshotId: r.SNAPSHOT_ID,
        reportType: r.REPORT_TYPE,
        from: r.FROM_DATE.toISOString().slice(0, 10),
        to: r.TO_DATE.toISOString().slice(0, 10),
        department: r.DEPARTMENT,
        metrics: r.METRICS_JSON,
        generatedBy: r.GENERATED_BY,
        createdAt: r.CREATED_DATE?.toISOString() ?? null,
      })),
      meta: { page, limit, total },
    };
  }

  async generateReport(dto: GenerateReportDto, user: AuthUser) {
    const from = new Date(dto.from);
    const to = new Date(dto.to);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      throw new BadRequestException('Invalid date range');
    }
    if (from > to) {
      throw new BadRequestException('Start date must be before or equal to end date');
    }
    const toEnd = new Date(to.getTime() + 24 * 60 * 60 * 1000);
    const label = actorLabel(user);

    const [
      totalPersons,
      newCards,
      triageCount,
      referrals,
      admissions,
      discharges,
      transfers,
    ] = await Promise.all([
      this.prisma.persons.count({
        where: { CREATED_DATE: { gte: from, lt: toEnd } },
      }),
      this.prisma.patientCards.count({
        where: { CREATED_DATE: { gte: from, lt: toEnd } },
      }),
      this.prisma.triage.count({
        where: { ARRIVAL_AT: { gte: from, lt: toEnd } },
      }),
      this.prisma.clinicalReferrals.count({
        where: { CREATED_DATE: { gte: from, lt: toEnd } },
      }),
      this.prisma.admissions.count({
        where: { ADMITTED_AT: { gte: from, lt: toEnd } },
      }),
      this.prisma.dischargeDrafts.count({
        where: {
          STATUS: 'Finalized',
          UPDATED_DATE: { gte: from, lt: toEnd },
        },
      }),
      this.prisma.patientTransfers.count({
        where: {
          STATUS: 'Completed',
          UPDATED_DATE: { gte: from, lt: toEnd },
        },
      }),
    ]);

    const days =
      Math.max(
        1,
        Math.round((to.getTime() - from.getTime()) / 86400000) + 1,
      );
    const metrics = {
      totalRecords: totalPersons,
      new: newCards,
      returning: Math.max(0, triageCount - newCards),
      walkIn: triageCount,
      online: 0,
      emergency: 0,
      referrals,
      admissions,
      discharges,
      transfers,
      dateRange: `${dto.from} to ${dto.to} (${days} day${days > 1 ? 's' : ''})`,
    };
    const rows = [
      { col: 'Total Records', val: String(metrics.totalRecords) },
      { col: 'New', val: String(metrics.new) },
      { col: 'Returning', val: String(metrics.returning) },
      { col: 'Walk-In / Triage', val: String(metrics.walkIn) },
      { col: 'Referrals', val: String(metrics.referrals) },
      { col: 'Admissions', val: String(metrics.admissions) },
      { col: 'Discharges', val: String(metrics.discharges) },
      { col: 'Transfers', val: String(metrics.transfers) },
      { col: 'Date Range', val: metrics.dateRange },
    ];

    const snap = await this.prisma.recordReportSnapshots.create({
      data: {
        REPORT_TYPE: dto.reportType.trim(),
        FROM_DATE: from,
        TO_DATE: to,
        DEPARTMENT: dto.department?.trim() || null,
        METRICS_JSON: metrics as Prisma.InputJsonValue,
        GENERATED_BY: label,
        GENERATED_BY_ID: user.id,
        CREATED_DATE: new Date(),
        DELETED_FLAG: 'N',
      },
    });

    await this.audit.log({
      type: 'records-report:generate',
      item: dto.reportType,
      entity: 'RecordReportSnapshot',
      entityId: snap.SNAPSHOT_ID,
      userId: user.id,
      createdBy: label,
      newValue: metrics,
    });

    return {
      snapshotId: snap.SNAPSHOT_ID,
      reportType: dto.reportType,
      from: dto.from,
      to: dto.to,
      department: dto.department ?? null,
      rows,
      metrics,
    };
  }

  async analytics(params: {
    range?: string;
    timezoneOffsetMinutes?: number;
  }) {
    const offsetMin = params.timezoneOffsetMinutes ?? 60;
    const range = params.range ?? 'month';
    const { from, to } = rangeBounds(range, offsetMin);

    const [
      totalRegistered,
      newInPeriod,
      triageInPeriod,
      admissions,
      referrals,
      discharges,
      transfers,
      persons,
      triageRows,
    ] = await Promise.all([
      this.prisma.persons.count(),
      this.prisma.persons.count({
        where: { CREATED_DATE: { gte: from, lt: to } },
      }),
      this.prisma.triage.count({
        where: { ARRIVAL_AT: { gte: from, lt: to } },
      }),
      this.prisma.admissions.count({
        where: { ADMITTED_AT: { gte: from, lt: to } },
      }),
      this.prisma.clinicalReferrals.count({
        where: { CREATED_DATE: { gte: from, lt: to } },
      }),
      this.prisma.dischargeDrafts.count({
        where: {
          STATUS: 'Finalized',
          UPDATED_DATE: { gte: from, lt: to },
        },
      }),
      this.prisma.patientTransfers.count({
        where: {
          STATUS: 'Completed',
          UPDATED_DATE: { gte: from, lt: to },
        },
      }),
      this.prisma.persons.findMany({
        where: { CREATED_DATE: { gte: from, lt: to } },
        select: { SEX: true, DATE_OF_BIRTH: true, CREATED_DATE: true },
        take: 5000,
      }),
      this.prisma.triage.findMany({
        where: { ARRIVAL_AT: { gte: from, lt: to } },
        select: { ARRIVAL_AT: true, CLINIC: true },
        take: 5000,
      }),
    ]);

    const sexMap = new Map<string, number>();
    const ageMap = new Map<string, number>();
    const now = new Date();
    for (const p of persons) {
      const sex = p.SEX?.trim() || 'Unknown';
      sexMap.set(sex, (sexMap.get(sex) ?? 0) + 1);
      let band = 'Unknown';
      if (p.DATE_OF_BIRTH) {
        const age =
          (now.getTime() - p.DATE_OF_BIRTH.getTime()) /
          (365.25 * 24 * 60 * 60 * 1000);
        if (age < 18) band = '0–17';
        else if (age < 40) band = '18–39';
        else if (age < 60) band = '40–59';
        else band = '60+';
      }
      ageMap.set(band, (ageMap.get(band) ?? 0) + 1);
    }

    const hourMap = new Map<number, number>();
    const clinicMap = new Map<string, number>();
    const dayMap = new Map<string, { registrations: number; triage: number }>();

    for (const t of triageRows) {
      if (!t.ARRIVAL_AT) continue;
      const local = new Date(t.ARRIVAL_AT.getTime() + offsetMin * 60_000);
      const h = local.getUTCHours();
      hourMap.set(h, (hourMap.get(h) ?? 0) + 1);
      const clinic = t.CLINIC?.trim() || 'Unspecified';
      clinicMap.set(clinic, (clinicMap.get(clinic) ?? 0) + 1);
      const day = local.toISOString().slice(0, 10);
      const cur = dayMap.get(day) ?? { registrations: 0, triage: 0 };
      cur.triage += 1;
      dayMap.set(day, cur);
    }
    for (const p of persons) {
      if (!p.CREATED_DATE) continue;
      const local = new Date(p.CREATED_DATE.getTime() + offsetMin * 60_000);
      const day = local.toISOString().slice(0, 10);
      const cur = dayMap.get(day) ?? { registrations: 0, triage: 0 };
      cur.registrations += 1;
      dayMap.set(day, cur);
    }

    let peakHour = 0;
    let peakCount = 0;
    for (const [h, c] of hourMap) {
      if (c > peakCount) {
        peakCount = c;
        peakHour = h;
      }
    }
    let topClinic = '—';
    let topClinicCount = 0;
    for (const [c, n] of clinicMap) {
      if (n > topClinicCount) {
        topClinicCount = n;
        topClinic = c;
      }
    }
    let topCategory = '—';
    let topCatCount = 0;
    for (const [s, n] of sexMap) {
      if (n > topCatCount) {
        topCatCount = n;
        topCategory = s;
      }
    }

    const trends = [...dayMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([label, v]) => ({
        label,
        registrations: v.registrations,
        triage: v.triage,
      }));

    return {
      range,
      from: from.toISOString(),
      to: to.toISOString(),
      kpis: {
        totalRegistered,
        newInPeriod,
        returningApprox: Math.max(0, triageInPeriod - newInPeriod),
        avgRegMinutes: null as number | null,
        peakHourLabel: peakCount
          ? `${String(peakHour).padStart(2, '0')}:00`
          : '—',
        topClinic,
        topCategory,
      },
      trends,
      demographics: [
        ...[...sexMap.entries()].map(([label, count]) => ({
          label: `Sex: ${label}`,
          count,
        })),
        ...[...ageMap.entries()].map(([label, count]) => ({
          label: `Age ${label}`,
          count,
        })),
      ],
      operations: [
        { label: 'Triage', count: triageInPeriod },
        { label: 'Admissions', count: admissions },
        { label: 'Referrals', count: referrals },
        { label: 'Discharges', count: discharges },
        { label: 'Transfers', count: transfers },
      ],
    };
  }
}
