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
  AdvanceHistopathologyDto,
  CreateHistopathologyDto,
  CreateQcRunDto,
  CreateSfaDto,
  CreateSpecimenDto,
  PatchHistopathologyDto,
  PatchQcRunDto,
  PatchSfaDto,
  QcCapaDto,
  RejectSfaDto,
  SpecimenStatusDto,
  TransferSpecimenDto,
} from './dto/lab-specialty.dto';
import { LabSpecialtyService } from './lab-specialty.service';

function actorLabel(actor?: AuthUser): string {
  if (!actor) return 'SYSTEM';
  const name = [actor.firstName, actor.lastName].filter(Boolean).join(' ');
  return name || actor.email || 'SYSTEM';
}

function pad(id: number): string {
  return String(id).padStart(4, '0');
}

function personName(p: {
  FIRST_NAME: string | null;
  MIDDLE_NAME?: string | null;
  LAST_NAME: string | null;
  HOSPITAL_NO?: string | null;
  PERSON_ID: number;
}): string {
  return (
    [p.FIRST_NAME, p.MIDDLE_NAME, p.LAST_NAME].filter(Boolean).join(' ') ||
    p.HOSPITAL_NO ||
    `#${p.PERSON_ID}`
  );
}

const PERSON_SELECT = {
  PERSON_ID: true,
  HOSPITAL_NO: true,
  FIRST_NAME: true,
  LAST_NAME: true,
  MIDDLE_NAME: true,
  SEX: true,
} as const;

@Injectable()
export class LabExtendedService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly specialty: LabSpecialtyService,
  ) {}

  // ---------- SFA ----------

  private mapSfa(
    row: Prisma.LabSfaAnalysesGetPayload<{
      include: { person: { select: typeof PERSON_SELECT } };
    }>,
  ) {
    return {
      sfaId: row.SFA_ID,
      sfaNo: row.SFA_NO,
      personId: row.PERSON_ID,
      labRequestId: row.LAB_REQUEST_ID,
      patientName: personName(row.person),
      hospitalNo: row.person.HOSPITAL_NO,
      sex: row.person.SEX,
      volumeMl: row.VOLUME_ML,
      colour: row.COLOUR,
      viscosity: row.VISCOSITY,
      liquefactionMin: row.LIQUEFACTION_MIN,
      ph: row.PH,
      countMMl: row.COUNT_M_ML,
      motilityPct: row.MOTILITY_PCT,
      morphologyPct: row.MORPHOLOGY_PCT,
      pusCells: row.PUS_CELLS,
      rbc: row.RBC,
      epithelial: row.EPITHELIAL,
      interpretation: row.INTERPRETATION,
      status: row.STATUS,
      rejectReason: row.REJECT_REASON,
      validatedAt: row.VALIDATED_AT?.toISOString() ?? null,
      validatedBy: row.VALIDATED_BY,
      createdAt: row.CREATED_DATE?.toISOString() ?? null,
      createdBy: row.CREATED_BY,
    };
  }

  async listSfa(params?: {
    status?: string;
    personId?: number;
    q?: string;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(1, params?.page ?? 1);
    const limit = Math.min(100, Math.max(1, params?.limit ?? 50));
    const where: Prisma.LabSfaAnalysesWhereInput = { NOT: { DELETED_FLAG: 'Y' } };
    if (params?.status) where.STATUS = params.status;
    if (params?.personId) where.PERSON_ID = params.personId;
    if (params?.q?.trim()) {
      const q = params.q.trim();
      where.OR = [
        { SFA_NO: { contains: q, mode: 'insensitive' } },
        { person: { HOSPITAL_NO: { contains: q, mode: 'insensitive' } } },
        { person: { FIRST_NAME: { contains: q, mode: 'insensitive' } } },
        { person: { LAST_NAME: { contains: q, mode: 'insensitive' } } },
      ];
    }
    const base = { NOT: { DELETED_FLAG: 'Y' } } as const;
    const [total, rows, draft, submitted, validated, rejected] = await Promise.all([
      this.prisma.labSfaAnalyses.count({ where }),
      this.prisma.labSfaAnalyses.findMany({
        where,
        include: { person: { select: PERSON_SELECT } },
        orderBy: { SFA_ID: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.labSfaAnalyses.count({ where: { ...base, STATUS: 'Draft' } }),
      this.prisma.labSfaAnalyses.count({ where: { ...base, STATUS: 'Submitted' } }),
      this.prisma.labSfaAnalyses.count({ where: { ...base, STATUS: 'Validated' } }),
      this.prisma.labSfaAnalyses.count({ where: { ...base, STATUS: 'Rejected' } }),
    ]);
    return {
      items: rows.map((r) => this.mapSfa(r)),
      meta: { page, limit, total },
      kpis: { draft, submitted, validated, rejected, total: draft + submitted + validated + rejected },
    };
  }

  async getSfa(id: number) {
    const row = await this.prisma.labSfaAnalyses.findFirst({
      where: { SFA_ID: id, NOT: { DELETED_FLAG: 'Y' } },
      include: { person: { select: PERSON_SELECT } },
    });
    if (!row) throw new NotFoundException('SFA analysis not found');
    return this.mapSfa(row);
  }

  private sfaFieldData(dto: CreateSfaDto | PatchSfaDto) {
    return {
      VOLUME_ML: dto.volumeMl?.trim() || null,
      COLOUR: dto.colour?.trim() || null,
      VISCOSITY: dto.viscosity?.trim() || null,
      LIQUEFACTION_MIN: dto.liquefactionMin?.trim() || null,
      PH: dto.ph?.trim() || null,
      COUNT_M_ML: dto.countMMl?.trim() || null,
      MOTILITY_PCT: dto.motilityPct?.trim() || null,
      MORPHOLOGY_PCT: dto.morphologyPct?.trim() || null,
      PUS_CELLS: dto.pusCells?.trim() || null,
      RBC: dto.rbc?.trim() || null,
      EPITHELIAL: dto.epithelial?.trim() || null,
      INTERPRETATION: dto.interpretation?.trim() || null,
    };
  }

  async createSfa(dto: CreateSfaDto, actor?: AuthUser) {
    const person = await this.prisma.persons.findUnique({
      where: { PERSON_ID: dto.personId },
      select: PERSON_SELECT,
    });
    if (!person) throw new NotFoundException('Patient not found');
    const now = new Date();
    const label = actorLabel(actor);
    const created = await this.prisma.$transaction(async (tx) => {
      const draft = await tx.labSfaAnalyses.create({
        data: {
          SFA_NO: `TMP-${Date.now()}`,
          PERSON_ID: dto.personId,
          LAB_REQUEST_ID: dto.labRequestId ?? null,
          ...this.sfaFieldData(dto),
          STATUS: 'Draft',
          CREATED_BY_ID: actor?.id ?? null,
          CREATED_BY: label,
          CREATED_DATE: now,
        },
      });
      return tx.labSfaAnalyses.update({
        where: { SFA_ID: draft.SFA_ID },
        data: { SFA_NO: `SFA-${now.getFullYear()}-${pad(draft.SFA_ID)}` },
        include: { person: { select: PERSON_SELECT } },
      });
    });
    const response = this.mapSfa(created);
    await this.audit.log({
      type: 'lab-sfa:create',
      entity: 'LabSfaAnalysis',
      entityId: created.SFA_ID,
      personId: dto.personId,
      userId: actor?.id,
      createdBy: label,
      item: response.sfaNo,
    });
    return response;
  }

  async patchSfa(id: number, dto: PatchSfaDto, actor?: AuthUser) {
    const existing = await this.getSfa(id);
    if (!['Draft', 'Submitted'].includes(existing.status)) {
      throw new BadRequestException('Only Draft or Submitted SFA can be edited');
    }
    const now = new Date();
    const label = actorLabel(actor);
    const patch: Prisma.LabSfaAnalysesUpdateInput = {
      UPDATED_BY_ID: actor?.id ?? null,
      UPDATED_BY: label,
      UPDATED_DATE: now,
    };
    if (dto.volumeMl !== undefined) patch.VOLUME_ML = dto.volumeMl.trim() || null;
    if (dto.colour !== undefined) patch.COLOUR = dto.colour.trim() || null;
    if (dto.viscosity !== undefined) patch.VISCOSITY = dto.viscosity.trim() || null;
    if (dto.liquefactionMin !== undefined) patch.LIQUEFACTION_MIN = dto.liquefactionMin.trim() || null;
    if (dto.ph !== undefined) patch.PH = dto.ph.trim() || null;
    if (dto.countMMl !== undefined) patch.COUNT_M_ML = dto.countMMl.trim() || null;
    if (dto.motilityPct !== undefined) patch.MOTILITY_PCT = dto.motilityPct.trim() || null;
    if (dto.morphologyPct !== undefined) patch.MORPHOLOGY_PCT = dto.morphologyPct.trim() || null;
    if (dto.pusCells !== undefined) patch.PUS_CELLS = dto.pusCells.trim() || null;
    if (dto.rbc !== undefined) patch.RBC = dto.rbc.trim() || null;
    if (dto.epithelial !== undefined) patch.EPITHELIAL = dto.epithelial.trim() || null;
    if (dto.interpretation !== undefined) patch.INTERPRETATION = dto.interpretation.trim() || null;

    await this.prisma.labSfaAnalyses.update({ where: { SFA_ID: id }, data: patch });
    const response = await this.getSfa(id);
    await this.audit.log({
      type: 'lab-sfa:update',
      entity: 'LabSfaAnalysis',
      entityId: id,
      personId: existing.personId,
      userId: actor?.id,
      createdBy: label,
      item: response.sfaNo,
    });
    return response;
  }

  async submitSfa(id: number, actor?: AuthUser) {
    const existing = await this.getSfa(id);
    if (existing.status !== 'Draft' && existing.status !== 'Rejected') {
      throw new BadRequestException('Only Draft/Rejected SFA can be submitted');
    }
    const label = actorLabel(actor);
    await this.prisma.labSfaAnalyses.update({
      where: { SFA_ID: id },
      data: {
        STATUS: 'Submitted',
        REJECT_REASON: null,
        UPDATED_BY_ID: actor?.id ?? null,
        UPDATED_BY: label,
        UPDATED_DATE: new Date(),
      },
    });
    const response = await this.getSfa(id);
    await this.audit.log({
      type: 'lab-sfa:submit',
      entity: 'LabSfaAnalysis',
      entityId: id,
      personId: existing.personId,
      userId: actor?.id,
      createdBy: label,
      item: response.sfaNo,
    });
    return response;
  }

  async validateSfa(id: number, actor?: AuthUser) {
    const existing = await this.getSfa(id);
    if (existing.status !== 'Submitted') {
      throw new BadRequestException('Only Submitted SFA can be validated');
    }
    const label = actorLabel(actor);
    const now = new Date();
    await this.prisma.labSfaAnalyses.update({
      where: { SFA_ID: id },
      data: {
        STATUS: 'Validated',
        VALIDATED_AT: now,
        VALIDATED_BY: label,
        UPDATED_BY_ID: actor?.id ?? null,
        UPDATED_BY: label,
        UPDATED_DATE: now,
      },
    });
    const response = await this.getSfa(id);
    await this.audit.log({
      type: 'lab-sfa:validate',
      entity: 'LabSfaAnalysis',
      entityId: id,
      personId: existing.personId,
      userId: actor?.id,
      createdBy: label,
      item: response.sfaNo,
    });
    return response;
  }

  async rejectSfa(id: number, dto: RejectSfaDto, actor?: AuthUser) {
    const existing = await this.getSfa(id);
    if (!['Draft', 'Submitted'].includes(existing.status)) {
      throw new BadRequestException('Only Draft/Submitted SFA can be rejected');
    }
    const label = actorLabel(actor);
    await this.prisma.labSfaAnalyses.update({
      where: { SFA_ID: id },
      data: {
        STATUS: 'Rejected',
        REJECT_REASON: dto.reason.trim(),
        UPDATED_BY_ID: actor?.id ?? null,
        UPDATED_BY: label,
        UPDATED_DATE: new Date(),
      },
    });
    const response = await this.getSfa(id);
    await this.audit.log({
      type: 'lab-sfa:reject',
      entity: 'LabSfaAnalysis',
      entityId: id,
      personId: existing.personId,
      userId: actor?.id,
      createdBy: label,
      item: response.sfaNo,
    });
    return response;
  }

  // ---------- Specimens ----------

  private mapSpecimen(
    row: Prisma.LabSpecimenTrackingGetPayload<{
      include: {
        person: { select: typeof PERSON_SELECT };
        events: true;
      };
    }>,
  ) {
    return {
      specimenId: row.SPECIMEN_ID,
      specimenNo: row.SPECIMEN_NO,
      personId: row.PERSON_ID,
      patientName: personName(row.person),
      hospitalNo: row.person.HOSPITAL_NO,
      labRequestId: row.LAB_REQUEST_ID,
      labSampleId: row.LAB_SAMPLE_ID,
      testLabel: row.TEST_LABEL,
      collectedBy: row.COLLECTED_BY,
      location: row.LOCATION,
      status: row.STATUS,
      collectedAt: row.COLLECTED_AT?.toISOString() ?? null,
      tatLabel: row.TAT_LABEL,
      createdAt: row.CREATED_DATE?.toISOString() ?? null,
      createdBy: row.CREATED_BY,
      events: (row.events ?? [])
        .slice()
        .sort((a, b) => a.CREATED_DATE.getTime() - b.CREATED_DATE.getTime())
        .map((e) => ({
          eventId: e.EVENT_ID,
          action: e.ACTION,
          fromLocation: e.FROM_LOCATION,
          toLocation: e.TO_LOCATION,
          reason: e.REASON,
          actorLabel: e.ACTOR_LABEL,
          at: e.CREATED_DATE.toISOString(),
        })),
    };
  }

  private tatLabel(collectedAt: Date | null): string {
    if (!collectedAt) return '—';
    const mins = Math.max(0, Math.round((Date.now() - collectedAt.getTime()) / 60000));
    if (mins < 60) return `${mins}m`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h}h ${m}m`;
  }

  async listSpecimens(params?: {
    status?: string;
    personId?: number;
    q?: string;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(1, params?.page ?? 1);
    const limit = Math.min(100, Math.max(1, params?.limit ?? 50));
    const where: Prisma.LabSpecimenTrackingWhereInput = { NOT: { DELETED_FLAG: 'Y' } };
    if (params?.status) where.STATUS = params.status;
    if (params?.personId) where.PERSON_ID = params.personId;
    if (params?.q?.trim()) {
      const q = params.q.trim();
      where.OR = [
        { SPECIMEN_NO: { contains: q, mode: 'insensitive' } },
        { TEST_LABEL: { contains: q, mode: 'insensitive' } },
        { LOCATION: { contains: q, mode: 'insensitive' } },
        { person: { HOSPITAL_NO: { contains: q, mode: 'insensitive' } } },
        { person: { FIRST_NAME: { contains: q, mode: 'insensitive' } } },
        { person: { LAST_NAME: { contains: q, mode: 'insensitive' } } },
      ];
    }
    const base = { NOT: { DELETED_FLAG: 'Y' } } as const;
    const statuses = [
      'In Transit',
      'Received',
      'Rejected',
      'Lost',
      'Delayed',
      'Completed',
    ] as const;
    const [total, rows, ...counts] = await Promise.all([
      this.prisma.labSpecimenTracking.count({ where }),
      this.prisma.labSpecimenTracking.findMany({
        where,
        include: { person: { select: PERSON_SELECT }, events: true },
        orderBy: { SPECIMEN_ID: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      ...statuses.map((s) =>
        this.prisma.labSpecimenTracking.count({ where: { ...base, STATUS: s } }),
      ),
    ]);
    const items = rows.map((r) => {
      const mapped = this.mapSpecimen(r);
      return { ...mapped, tatLabel: mapped.tatLabel || this.tatLabel(r.COLLECTED_AT) };
    });
    return {
      items,
      meta: { page, limit, total },
      kpis: {
        total: counts.reduce((a, b) => a + b, 0),
        transit: counts[0],
        received: counts[1],
        rejected: counts[2],
        lost: counts[3],
        delayed: counts[4],
        completed: counts[5],
      },
    };
  }

  async getSpecimen(id: number) {
    const row = await this.prisma.labSpecimenTracking.findFirst({
      where: { SPECIMEN_ID: id, NOT: { DELETED_FLAG: 'Y' } },
      include: { person: { select: PERSON_SELECT }, events: true },
    });
    if (!row) throw new NotFoundException('Specimen not found');
    const mapped = this.mapSpecimen(row);
    return { ...mapped, tatLabel: mapped.tatLabel || this.tatLabel(row.COLLECTED_AT) };
  }

  async createSpecimen(dto: CreateSpecimenDto, actor?: AuthUser) {
    const person = await this.prisma.persons.findUnique({
      where: { PERSON_ID: dto.personId },
      select: PERSON_SELECT,
    });
    if (!person) throw new NotFoundException('Patient not found');
    const now = new Date();
    const label = actorLabel(actor);
    const location = dto.location?.trim() || 'Reception';
    const created = await this.prisma.$transaction(async (tx) => {
      const draft = await tx.labSpecimenTracking.create({
        data: {
          SPECIMEN_NO: `TMP-${Date.now()}`,
          PERSON_ID: dto.personId,
          LAB_REQUEST_ID: dto.labRequestId ?? null,
          LAB_SAMPLE_ID: dto.labSampleId ?? null,
          TEST_LABEL: dto.testLabel.trim(),
          COLLECTED_BY: dto.collectedBy?.trim() || label,
          LOCATION: location,
          STATUS: 'Received',
          COLLECTED_AT: now,
          TAT_LABEL: '0m',
          CREATED_BY_ID: actor?.id ?? null,
          CREATED_BY: label,
          CREATED_DATE: now,
        },
      });
      const specimenNo = `SPC-${now.getFullYear()}-${pad(draft.SPECIMEN_ID)}`;
      await tx.labSpecimenTracking.update({
        where: { SPECIMEN_ID: draft.SPECIMEN_ID },
        data: { SPECIMEN_NO: specimenNo },
      });
      await tx.labSpecimenEvents.create({
        data: {
          SPECIMEN_ID: draft.SPECIMEN_ID,
          ACTION: 'Registered',
          TO_LOCATION: location,
          ACTOR_LABEL: label,
          CREATED_DATE: now,
        },
      });
      return draft.SPECIMEN_ID;
    });
    const response = await this.getSpecimen(created);
    await this.audit.log({
      type: 'lab-specimen:create',
      entity: 'LabSpecimenTracking',
      entityId: created,
      personId: dto.personId,
      userId: actor?.id,
      createdBy: label,
      item: response.specimenNo,
    });
    return response;
  }

  async transferSpecimen(id: number, dto: TransferSpecimenDto, actor?: AuthUser) {
    const existing = await this.getSpecimen(id);
    const now = new Date();
    const label = dto.staffLabel?.trim() || actorLabel(actor);
    await this.prisma.$transaction(async (tx) => {
      await tx.labSpecimenTracking.update({
        where: { SPECIMEN_ID: id },
        data: {
          LOCATION: dto.toLocation.trim(),
          STATUS: 'In Transit',
          UPDATED_BY_ID: actor?.id ?? null,
          UPDATED_BY: label,
          UPDATED_DATE: now,
          TAT_LABEL: this.tatLabel(existing.collectedAt ? new Date(existing.collectedAt) : null),
        },
      });
      await tx.labSpecimenEvents.create({
        data: {
          SPECIMEN_ID: id,
          ACTION: 'Transferred',
          FROM_LOCATION: existing.location,
          TO_LOCATION: dto.toLocation.trim(),
          REASON: dto.reason?.trim() || null,
          ACTOR_LABEL: label,
          CREATED_DATE: now,
        },
      });
    });
    const response = await this.getSpecimen(id);
    await this.audit.log({
      type: 'lab-specimen:transfer',
      entity: 'LabSpecimenTracking',
      entityId: id,
      personId: existing.personId,
      userId: actor?.id,
      createdBy: label,
      item: response.specimenNo,
    });
    return response;
  }

  async updateSpecimenStatus(id: number, dto: SpecimenStatusDto, actor?: AuthUser) {
    const existing = await this.getSpecimen(id);
    const now = new Date();
    const label = actorLabel(actor);
    const location = dto.location?.trim() || existing.location;
    await this.prisma.$transaction(async (tx) => {
      await tx.labSpecimenTracking.update({
        where: { SPECIMEN_ID: id },
        data: {
          STATUS: dto.status,
          LOCATION: location,
          UPDATED_BY_ID: actor?.id ?? null,
          UPDATED_BY: label,
          UPDATED_DATE: now,
          TAT_LABEL: this.tatLabel(existing.collectedAt ? new Date(existing.collectedAt) : null),
        },
      });
      await tx.labSpecimenEvents.create({
        data: {
          SPECIMEN_ID: id,
          ACTION: dto.status,
          FROM_LOCATION: existing.location,
          TO_LOCATION: location,
          REASON: dto.reason?.trim() || null,
          ACTOR_LABEL: label,
          CREATED_DATE: now,
        },
      });
    });
    const response = await this.getSpecimen(id);
    await this.audit.log({
      type: 'lab-specimen:status',
      entity: 'LabSpecimenTracking',
      entityId: id,
      personId: existing.personId,
      userId: actor?.id,
      createdBy: label,
      item: `${response.specimenNo} → ${dto.status}`,
    });
    return response;
  }

  // ---------- Analytics ----------

  async analyticsSummary(params?: {
    from?: string;
    to?: string;
    timezoneOffsetMinutes?: number;
  }) {
    const offset = params?.timezoneOffsetMinutes ?? 0;
    const now = new Date();
    let from: Date;
    let to: Date;
    if (params?.from && params?.to) {
      from = new Date(params.from);
      to = new Date(params.to);
      to.setUTCHours(23, 59, 59, 999);
    } else {
      // Month to date in client offset approximation
      const local = new Date(now.getTime() - offset * 60000);
      from = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1));
      to = now;
    }
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      throw new BadRequestException('Invalid from/to dates');
    }

    const requestWhere: Prisma.LabRequestsWhereInput = {
      STATUS: { not: 'Cancelled' },
      CREATED_DATE: { gte: from, lte: to },
    };

    const [requestCount, paidAgg, topTests, categoryGroups, criticalCount, samples, validated] =
      await Promise.all([
        this.prisma.labRequests.count({ where: requestWhere }),
        this.prisma.labRequests.aggregate({
          where: {
            PAYMENT_STATUS: 'Paid',
            PAID_AT: { gte: from, lte: to },
          },
          _sum: { TOTAL_AMOUNT: true },
        }),
        this.prisma.labRequestItems.groupBy({
          by: ['TEST_NAME'],
          where: { request: requestWhere },
          _count: { ITEM_ID: true },
          orderBy: { _count: { ITEM_ID: 'desc' } },
          take: 8,
        }),
        this.prisma.labRequestItems.groupBy({
          by: ['CATEGORY'],
          where: { request: requestWhere },
          _count: { ITEM_ID: true },
          orderBy: { _count: { ITEM_ID: 'desc' } },
          take: 12,
        }),
        this.prisma.labRequests.count({
          where: { ...requestWhere, PRIORITY: { in: ['Stat', 'Urgent'] } },
        }),
        this.prisma.labSamples.findMany({
          where: { COLLECTED_AT: { gte: from, lte: to } },
          select: { COLLECTED_AT: true, LAB_REQUEST_ID: true },
          take: 500,
        }),
        this.prisma.labResults.findMany({
          where: {
            STATUS: 'Validated',
            VALIDATED_AT: { gte: from, lte: to },
          },
          select: { VALIDATED_AT: true, LAB_REQUEST_ID: true },
          take: 500,
        }),
      ]);

    // Avg TAT hours: collect → validate by request id
    const collectMap = new Map<number, Date>();
    for (const s of samples) {
      if (s.COLLECTED_AT && s.LAB_REQUEST_ID) {
        const prev = collectMap.get(s.LAB_REQUEST_ID);
        if (!prev || s.COLLECTED_AT < prev) collectMap.set(s.LAB_REQUEST_ID, s.COLLECTED_AT);
      }
    }
    let tatSum = 0;
    let tatN = 0;
    for (const v of validated) {
      if (!v.VALIDATED_AT || !v.LAB_REQUEST_ID) continue;
      const c = collectMap.get(v.LAB_REQUEST_ID);
      if (!c) continue;
      const hours = (v.VALIDATED_AT.getTime() - c.getTime()) / 3600000;
      if (hours >= 0 && hours < 168) {
        tatSum += hours;
        tatN += 1;
      }
    }
    const avgTatHours = tatN ? Math.round((tatSum / tatN) * 10) / 10 : 0;
    const avgTatLabel =
      avgTatHours >= 1
        ? `${Math.floor(avgTatHours)}h ${Math.round((avgTatHours % 1) * 60)}m`
        : `${Math.round(avgTatHours * 60)}m`;

    const revenue = Number(paidAgg._sum.TOTAL_AMOUNT ?? 0);
    const top = topTests.map((t) => ({ name: t.TEST_NAME, count: t._count.ITEM_ID }));
    const maxTop = top[0]?.count || 1;
    const workloadByCategory = categoryGroups.map((c) => ({
      category: c.CATEGORY || 'Other',
      count: c._count.ITEM_ID,
    }));

    return {
      from: from.toISOString().slice(0, 10),
      to: to.toISOString().slice(0, 10),
      revenue,
      tests: requestCount,
      avgTatHours,
      avgTatLabel,
      criticalResults: criticalCount,
      topTests: top.map((t) => ({ ...t, pct: Math.round((t.count / maxTop) * 100) })),
      workloadByCategory,
    };
  }

  // ---------- Microbiology (cultures wrapper) ----------

  private microOutcome(organism: string | null, status: string): string {
    if (status === 'Cancelled') return 'Cancelled';
    if (status === 'Provisional') return 'Pending';
    const org = (organism || '').toLowerCase();
    if (!org || org.includes('no growth')) return 'Negative';
    return 'Positive';
  }

  async listMicrobiology(params?: {
    status?: string;
    q?: string;
    page?: number;
    limit?: number;
  }) {
    const data = await this.specialty.listCultures({
      status: params?.status,
      q: params?.q,
      page: params?.page,
      limit: params?.limit ?? 100,
    });
    const items = data.items.map((c) => ({
      ...c,
      microOutcome: this.microOutcome(c.organism, c.status),
      awaitingValidation: c.status === 'Provisional',
    }));
    let pending = 0;
    let positive = 0;
    let negative = 0;
    let awaitingValidation = 0;
    let completed = 0;
    // Global KPIs
    const all = await this.prisma.labCultures.findMany({
      where: { NOT: { DELETED_FLAG: 'Y' } },
      select: { ORGANISM: true, STATUS: true },
    });
    for (const r of all) {
      const outcome = this.microOutcome(r.ORGANISM, r.STATUS);
      if (r.STATUS === 'Provisional') {
        pending += 1;
        awaitingValidation += 1;
      } else if (r.STATUS === 'Final') {
        completed += 1;
        if (outcome === 'Positive') positive += 1;
        else negative += 1;
      }
    }
    return {
      items,
      meta: data.meta,
      kpis: { pending, positive, negative, awaitingValidation, completed },
    };
  }

  async getMicrobiology(id: number) {
    const c = await this.specialty.getCulture(id);
    return {
      ...c,
      microOutcome: this.microOutcome(c.organism, c.status),
      awaitingValidation: c.status === 'Provisional',
    };
  }

  async createMicrobiology(
    dto: Parameters<LabSpecialtyService['createCulture']>[0],
    actor?: AuthUser,
  ) {
    return this.createMicroFromCulture(await this.specialty.createCulture(dto, actor));
  }

  async patchMicrobiology(
    id: number,
    dto: Parameters<LabSpecialtyService['patchCulture']>[1],
    actor?: AuthUser,
  ) {
    return this.createMicroFromCulture(await this.specialty.patchCulture(id, dto, actor));
  }

  private createMicroFromCulture(
    c: Awaited<ReturnType<LabSpecialtyService['getCulture']>>,
  ) {
    return {
      ...c,
      microOutcome: this.microOutcome(c.organism, c.status),
      awaitingValidation: c.status === 'Provisional',
    };
  }

  async validateMicrobiology(id: number, actor?: AuthUser) {
    return this.createMicroFromCulture(
      await this.specialty.patchCulture(id, { status: 'Final' }, actor),
    );
  }

  // ---------- Histopathology ----------

  private static readonly HISTO_STAGES = [
    'Received',
    'Grossing',
    'Microscopy',
    'Awaiting Approval',
    'Released',
  ] as const;

  private mapHisto(
    row: Prisma.LabHistopathologyCasesGetPayload<{
      include: { person: { select: typeof PERSON_SELECT } };
    }>,
  ) {
    return {
      caseId: row.CASE_ID,
      caseNo: row.CASE_NO,
      personId: row.PERSON_ID,
      labRequestId: row.LAB_REQUEST_ID,
      patientName: personName(row.person),
      hospitalNo: row.person.HOSPITAL_NO,
      sex: row.person.SEX,
      specimenType: row.SPECIMEN_TYPE,
      stage: row.STAGE,
      site: row.SITE,
      gross: row.GROSS,
      micro: row.MICRO,
      diagnosis: row.DIAGNOSIS,
      grade: row.GRADE,
      receivedAt: row.RECEIVED_AT?.toISOString() ?? null,
      createdAt: row.CREATED_DATE?.toISOString() ?? null,
      createdBy: row.CREATED_BY,
      updatedAt: row.UPDATED_DATE?.toISOString() ?? null,
    };
  }

  async listHistopathology(params?: {
    stage?: string;
    personId?: number;
    q?: string;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(1, params?.page ?? 1);
    const limit = Math.min(100, Math.max(1, params?.limit ?? 50));
    const where: Prisma.LabHistopathologyCasesWhereInput = {
      NOT: { DELETED_FLAG: 'Y' },
    };
    if (params?.stage) where.STAGE = params.stage;
    if (params?.personId) where.PERSON_ID = params.personId;
    if (params?.q?.trim()) {
      const q = params.q.trim();
      where.OR = [
        { CASE_NO: { contains: q, mode: 'insensitive' } },
        { DIAGNOSIS: { contains: q, mode: 'insensitive' } },
        { person: { HOSPITAL_NO: { contains: q, mode: 'insensitive' } } },
        { person: { FIRST_NAME: { contains: q, mode: 'insensitive' } } },
        { person: { LAST_NAME: { contains: q, mode: 'insensitive' } } },
      ];
    }
    const base = { NOT: { DELETED_FLAG: 'Y' } } as const;
    const stageCounts = await Promise.all(
      LabExtendedService.HISTO_STAGES.map((stage) =>
        this.prisma.labHistopathologyCases.count({
          where: { ...base, STAGE: stage },
        }),
      ),
    );
    const [total, rows] = await Promise.all([
      this.prisma.labHistopathologyCases.count({ where }),
      this.prisma.labHistopathologyCases.findMany({
        where,
        include: { person: { select: PERSON_SELECT } },
        orderBy: { CASE_ID: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);
    const kpis = {
      received: stageCounts[0],
      grossing: stageCounts[1],
      microscopy: stageCounts[2],
      awaitingApproval: stageCounts[3],
      released: stageCounts[4],
      total: stageCounts.reduce((a, b) => a + b, 0),
    };
    return {
      items: rows.map((r) => this.mapHisto(r)),
      meta: { page, limit, total },
      kpis,
    };
  }

  async getHistopathology(id: number) {
    const row = await this.prisma.labHistopathologyCases.findFirst({
      where: { CASE_ID: id, NOT: { DELETED_FLAG: 'Y' } },
      include: { person: { select: PERSON_SELECT } },
    });
    if (!row) throw new NotFoundException('Histopathology case not found');
    return this.mapHisto(row);
  }

  private histoReportData(dto: CreateHistopathologyDto | PatchHistopathologyDto) {
    const data: Prisma.LabHistopathologyCasesUpdateInput = {};
    if ('specimenType' in dto && dto.specimenType !== undefined) {
      data.SPECIMEN_TYPE = dto.specimenType;
    }
    if (dto.site !== undefined) data.SITE = dto.site?.trim() || null;
    if (dto.gross !== undefined) data.GROSS = dto.gross?.trim() || null;
    if (dto.micro !== undefined) data.MICRO = dto.micro?.trim() || null;
    if (dto.diagnosis !== undefined) data.DIAGNOSIS = dto.diagnosis?.trim() || null;
    if (dto.grade !== undefined) data.GRADE = dto.grade?.trim() || null;
    return data;
  }

  async createHistopathology(dto: CreateHistopathologyDto, actor?: AuthUser) {
    const person = await this.prisma.persons.findUnique({
      where: { PERSON_ID: dto.personId },
      select: PERSON_SELECT,
    });
    if (!person) throw new NotFoundException('Patient not found');
    const now = new Date();
    const label = actorLabel(actor);
    const created = await this.prisma.$transaction(async (tx) => {
      const draft = await tx.labHistopathologyCases.create({
        data: {
          CASE_NO: `TMP-${Date.now()}`,
          PERSON_ID: dto.personId,
          LAB_REQUEST_ID: dto.labRequestId ?? null,
          SPECIMEN_TYPE: dto.specimenType,
          STAGE: 'Received',
          SITE: dto.site?.trim() || null,
          GROSS: dto.gross?.trim() || null,
          MICRO: dto.micro?.trim() || null,
          DIAGNOSIS: dto.diagnosis?.trim() || null,
          GRADE: dto.grade?.trim() || null,
          RECEIVED_AT: now,
          CREATED_BY_ID: actor?.id ?? null,
          CREATED_BY: label,
          CREATED_DATE: now,
        },
      });
      return tx.labHistopathologyCases.update({
        where: { CASE_ID: draft.CASE_ID },
        data: { CASE_NO: `HST-${now.getFullYear()}-${pad(draft.CASE_ID)}` },
        include: { person: { select: PERSON_SELECT } },
      });
    });
    const response = this.mapHisto(created);
    await this.audit.log({
      type: 'lab-histo:create',
      entity: 'LabHistopathologyCase',
      entityId: created.CASE_ID,
      personId: dto.personId,
      userId: actor?.id,
      createdBy: label,
      item: response.caseNo,
      newValue: { specimenType: dto.specimenType },
    });
    return response;
  }

  async patchHistopathology(
    id: number,
    dto: PatchHistopathologyDto,
    actor?: AuthUser,
  ) {
    const existing = await this.prisma.labHistopathologyCases.findFirst({
      where: { CASE_ID: id, NOT: { DELETED_FLAG: 'Y' } },
    });
    if (!existing) throw new NotFoundException('Histopathology case not found');
    if (existing.STAGE === 'Released') {
      throw new BadRequestException('Released cases cannot be edited');
    }
    const label = actorLabel(actor);
    const now = new Date();
    const updated = await this.prisma.labHistopathologyCases.update({
      where: { CASE_ID: id },
      data: {
        ...this.histoReportData(dto),
        UPDATED_BY_ID: actor?.id ?? null,
        UPDATED_BY: label,
        UPDATED_DATE: now,
      },
      include: { person: { select: PERSON_SELECT } },
    });
    await this.audit.log({
      type: 'lab-histo:update',
      entity: 'LabHistopathologyCase',
      entityId: id,
      personId: existing.PERSON_ID,
      userId: actor?.id,
      createdBy: label,
      item: updated.CASE_NO,
    });
    return this.mapHisto(updated);
  }

  async advanceHistopathology(
    id: number,
    dto: AdvanceHistopathologyDto,
    actor?: AuthUser,
  ) {
    const existing = await this.prisma.labHistopathologyCases.findFirst({
      where: { CASE_ID: id, NOT: { DELETED_FLAG: 'Y' } },
    });
    if (!existing) throw new NotFoundException('Histopathology case not found');
    if (existing.STAGE === 'Released') {
      throw new BadRequestException('Case is already released');
    }
    let next = dto.stage;
    if (!next) {
      const idx = LabExtendedService.HISTO_STAGES.indexOf(
        existing.STAGE as (typeof LabExtendedService.HISTO_STAGES)[number],
      );
      if (idx < 0 || idx >= LabExtendedService.HISTO_STAGES.length - 1) {
        throw new BadRequestException('Cannot advance stage');
      }
      next = LabExtendedService.HISTO_STAGES[idx + 1];
    }
    if (next === 'Released') {
      return this.releaseHistopathology(id, actor);
    }
    if (
      !(LabExtendedService.HISTO_STAGES as readonly string[]).includes(next)
    ) {
      throw new BadRequestException('Invalid stage');
    }
    const label = actorLabel(actor);
    const updated = await this.prisma.labHistopathologyCases.update({
      where: { CASE_ID: id },
      data: {
        STAGE: next,
        UPDATED_BY_ID: actor?.id ?? null,
        UPDATED_BY: label,
        UPDATED_DATE: new Date(),
      },
      include: { person: { select: PERSON_SELECT } },
    });
    await this.audit.log({
      type: 'lab-histo:advance',
      entity: 'LabHistopathologyCase',
      entityId: id,
      personId: existing.PERSON_ID,
      userId: actor?.id,
      createdBy: label,
      item: updated.CASE_NO,
      oldValue: existing.STAGE,
      newValue: next,
    });
    return this.mapHisto(updated);
  }

  async releaseHistopathology(id: number, actor?: AuthUser) {
    const existing = await this.prisma.labHistopathologyCases.findFirst({
      where: { CASE_ID: id, NOT: { DELETED_FLAG: 'Y' } },
    });
    if (!existing) throw new NotFoundException('Histopathology case not found');
    if (existing.STAGE === 'Released') {
      throw new BadRequestException('Case is already released');
    }
    if (!existing.DIAGNOSIS?.trim()) {
      throw new BadRequestException('Diagnosis is required before release');
    }
    const label = actorLabel(actor);
    const updated = await this.prisma.labHistopathologyCases.update({
      where: { CASE_ID: id },
      data: {
        STAGE: 'Released',
        UPDATED_BY_ID: actor?.id ?? null,
        UPDATED_BY: label,
        UPDATED_DATE: new Date(),
      },
      include: { person: { select: PERSON_SELECT } },
    });
    await this.audit.log({
      type: 'lab-histo:release',
      entity: 'LabHistopathologyCase',
      entityId: id,
      personId: existing.PERSON_ID,
      userId: actor?.id,
      createdBy: label,
      item: updated.CASE_NO,
    });
    return this.mapHisto(updated);
  }

  // ---------- QC ----------

  private mapQc(row: {
    QC_RUN_ID: number;
    RUN_NO: string;
    ANALYTE: string;
    INSTRUMENT: string;
    LEVEL: string;
    EXPECTED: string;
    OBSERVED: string;
    RESULT: string;
    FREQ: string;
    RUN_DATE: Date;
    CORRECTIVE: string | null;
    PREVENTIVE: string | null;
    ASSIGNED_TO: string | null;
    TARGET_DATE: Date | null;
    CAPA_STATUS: string;
    CREATED_BY: string | null;
    CREATED_DATE: Date | null;
    UPDATED_DATE: Date | null;
  }) {
    return {
      qcRunId: row.QC_RUN_ID,
      runNo: row.RUN_NO,
      analyte: row.ANALYTE,
      instrument: row.INSTRUMENT,
      level: row.LEVEL,
      expected: row.EXPECTED,
      observed: row.OBSERVED,
      result: row.RESULT,
      freq: row.FREQ,
      runDate: row.RUN_DATE.toISOString().slice(0, 10),
      corrective: row.CORRECTIVE,
      preventive: row.PREVENTIVE,
      assignedTo: row.ASSIGNED_TO,
      targetDate: row.TARGET_DATE?.toISOString().slice(0, 10) ?? null,
      capaStatus: row.CAPA_STATUS,
      createdAt: row.CREATED_DATE?.toISOString() ?? null,
      createdBy: row.CREATED_BY,
      updatedAt: row.UPDATED_DATE?.toISOString() ?? null,
    };
  }

  async listQc(params?: {
    freq?: string;
    result?: string;
    q?: string;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(1, params?.page ?? 1);
    const limit = Math.min(100, Math.max(1, params?.limit ?? 50));
    const where: Prisma.LabQcRunsWhereInput = { NOT: { DELETED_FLAG: 'Y' } };
    if (params?.freq) where.FREQ = params.freq;
    if (params?.result) where.RESULT = params.result;
    if (params?.q?.trim()) {
      const q = params.q.trim();
      where.OR = [
        { RUN_NO: { contains: q, mode: 'insensitive' } },
        { ANALYTE: { contains: q, mode: 'insensitive' } },
        { INSTRUMENT: { contains: q, mode: 'insensitive' } },
      ];
    }
    const base = { NOT: { DELETED_FLAG: 'Y' } } as const;
    const [total, rows, passed, failed] = await Promise.all([
      this.prisma.labQcRuns.count({ where }),
      this.prisma.labQcRuns.findMany({
        where,
        orderBy: [{ RUN_DATE: 'desc' }, { QC_RUN_ID: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.labQcRuns.count({ where: { ...base, RESULT: 'Passed' } }),
      this.prisma.labQcRuns.count({ where: { ...base, RESULT: 'Failed' } }),
    ]);
    return {
      items: rows.map((r) => this.mapQc(r)),
      meta: { page, limit, total },
      kpis: { passed, failed, total: passed + failed },
    };
  }

  async getQc(id: number) {
    const row = await this.prisma.labQcRuns.findFirst({
      where: { QC_RUN_ID: id, NOT: { DELETED_FLAG: 'Y' } },
    });
    if (!row) throw new NotFoundException('QC run not found');
    return this.mapQc(row);
  }

  private parseDateOnly(value: string | undefined, fallback: Date): Date {
    if (!value?.trim()) return fallback;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) {
      throw new BadRequestException('Invalid date');
    }
    return d;
  }

  async createQc(dto: CreateQcRunDto, actor?: AuthUser) {
    const now = new Date();
    const label = actorLabel(actor);
    const runDate = this.parseDateOnly(dto.runDate, now);
    const created = await this.prisma.$transaction(async (tx) => {
      const draft = await tx.labQcRuns.create({
        data: {
          RUN_NO: `TMP-${Date.now()}`,
          ANALYTE: dto.analyte.trim(),
          INSTRUMENT: dto.instrument.trim(),
          LEVEL: dto.level,
          EXPECTED: dto.expected.trim(),
          OBSERVED: dto.observed.trim(),
          RESULT: dto.result,
          FREQ: dto.freq,
          RUN_DATE: runDate,
          CAPA_STATUS: dto.result === 'Failed' ? 'Open' : 'None',
          CREATED_BY_ID: actor?.id ?? null,
          CREATED_BY: label,
          CREATED_DATE: now,
        },
      });
      return tx.labQcRuns.update({
        where: { QC_RUN_ID: draft.QC_RUN_ID },
        data: { RUN_NO: `QC-${now.getFullYear()}-${pad(draft.QC_RUN_ID)}` },
      });
    });
    await this.audit.log({
      type: 'lab-qc:create',
      entity: 'LabQcRun',
      entityId: created.QC_RUN_ID,
      userId: actor?.id,
      createdBy: label,
      item: created.RUN_NO,
      newValue: { result: dto.result },
    });
    return this.mapQc(created);
  }

  async patchQc(id: number, dto: PatchQcRunDto, actor?: AuthUser) {
    const existing = await this.prisma.labQcRuns.findFirst({
      where: { QC_RUN_ID: id, NOT: { DELETED_FLAG: 'Y' } },
    });
    if (!existing) throw new NotFoundException('QC run not found');
    const label = actorLabel(actor);
    const data: Prisma.LabQcRunsUpdateInput = {
      UPDATED_BY_ID: actor?.id ?? null,
      UPDATED_BY: label,
      UPDATED_DATE: new Date(),
    };
    if (dto.analyte !== undefined) data.ANALYTE = dto.analyte.trim();
    if (dto.instrument !== undefined) data.INSTRUMENT = dto.instrument.trim();
    if (dto.level !== undefined) data.LEVEL = dto.level;
    if (dto.expected !== undefined) data.EXPECTED = dto.expected.trim();
    if (dto.observed !== undefined) data.OBSERVED = dto.observed.trim();
    if (dto.result !== undefined) {
      data.RESULT = dto.result;
      if (dto.result === 'Failed' && existing.CAPA_STATUS === 'None') {
        data.CAPA_STATUS = 'Open';
      }
    }
    if (dto.freq !== undefined) data.FREQ = dto.freq;
    if (dto.runDate !== undefined) {
      data.RUN_DATE = this.parseDateOnly(dto.runDate, existing.RUN_DATE);
    }
    const updated = await this.prisma.labQcRuns.update({
      where: { QC_RUN_ID: id },
      data,
    });
    await this.audit.log({
      type: 'lab-qc:update',
      entity: 'LabQcRun',
      entityId: id,
      userId: actor?.id,
      createdBy: label,
      item: updated.RUN_NO,
    });
    return this.mapQc(updated);
  }

  async upsertQcCapa(id: number, dto: QcCapaDto, actor?: AuthUser) {
    const existing = await this.prisma.labQcRuns.findFirst({
      where: { QC_RUN_ID: id, NOT: { DELETED_FLAG: 'Y' } },
    });
    if (!existing) throw new NotFoundException('QC run not found');
    const label = actorLabel(actor);
    const updated = await this.prisma.labQcRuns.update({
      where: { QC_RUN_ID: id },
      data: {
        CORRECTIVE: dto.corrective.trim(),
        PREVENTIVE: dto.preventive.trim(),
        ASSIGNED_TO: dto.assignedTo.trim(),
        TARGET_DATE: dto.targetDate
          ? this.parseDateOnly(dto.targetDate, new Date())
          : null,
        CAPA_STATUS: dto.capaStatus ?? 'Open',
        UPDATED_BY_ID: actor?.id ?? null,
        UPDATED_BY: label,
        UPDATED_DATE: new Date(),
      },
    });
    await this.audit.log({
      type: 'lab-qc:capa',
      entity: 'LabQcRun',
      entityId: id,
      userId: actor?.id,
      createdBy: label,
      item: updated.RUN_NO,
      newValue: { assignedTo: dto.assignedTo, capaStatus: updated.CAPA_STATUS },
    });
    return this.mapQc(updated);
  }
}
