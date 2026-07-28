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
  CollectDrugScreenDto,
  CreateCultureDto,
  CreateDrugScreenDto,
  DRUG_CATALOG,
  GenerateLabReportDto,
  PatchCultureDto,
  PatchDrugScreenResultsDto,
  RejectDrugScreenDto,
} from './dto/lab-specialty.dto';

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
  DATE_OF_BIRTH: true,
} as const;

@Injectable()
export class LabSpecialtyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ---------- Drug screens ----------

  private mapDrugScreen(
    row: Prisma.LabDrugScreensGetPayload<{
      include: { person: { select: typeof PERSON_SELECT }; results: true };
    }>,
  ) {
    return {
      screenId: row.SCREEN_ID,
      screenNo: row.SCREEN_NO,
      personId: row.PERSON_ID,
      labRequestId: row.LAB_REQUEST_ID,
      patientName: personName(row.person),
      hospitalNo: row.person.HOSPITAL_NO,
      sex: row.person.SEX,
      sampleNo: row.SAMPLE_NO,
      sampleType: row.SAMPLE_TYPE,
      collectedAt: row.COLLECTED_AT?.toISOString() ?? null,
      collectedBy: row.COLLECTED_BY,
      status: row.STATUS,
      rejectReason: row.REJECT_REASON,
      validatedAt: row.VALIDATED_AT?.toISOString() ?? null,
      validatedBy: row.VALIDATED_BY,
      createdAt: row.CREATED_DATE?.toISOString() ?? null,
      createdBy: row.CREATED_BY,
      results: row.results.map((r) => ({
        resultId: r.RESULT_ID,
        drugCode: r.DRUG_CODE,
        drugName: r.DRUG_NAME,
        result: r.RESULT,
        remarks: r.REMARKS,
      })),
    };
  }

  async listDrugScreens(params?: {
    status?: string;
    personId?: number;
    q?: string;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(1, params?.page ?? 1);
    const limit = Math.min(100, Math.max(1, params?.limit ?? 50));
    const where: Prisma.LabDrugScreensWhereInput = {
      NOT: { DELETED_FLAG: 'Y' },
    };
    if (params?.status) where.STATUS = params.status;
    if (params?.personId) where.PERSON_ID = params.personId;
    if (params?.q?.trim()) {
      const q = params.q.trim();
      where.OR = [
        { SCREEN_NO: { contains: q, mode: 'insensitive' } },
        { SAMPLE_NO: { contains: q, mode: 'insensitive' } },
        { person: { HOSPITAL_NO: { contains: q, mode: 'insensitive' } } },
        { person: { FIRST_NAME: { contains: q, mode: 'insensitive' } } },
        { person: { LAST_NAME: { contains: q, mode: 'insensitive' } } },
      ];
    }
    const baseWhere: Prisma.LabDrugScreensWhereInput = { NOT: { DELETED_FLAG: 'Y' } };
    const [total, rows, draft, validated, rejected, inProgress] = await Promise.all([
      this.prisma.labDrugScreens.count({ where }),
      this.prisma.labDrugScreens.findMany({
        where,
        include: { person: { select: PERSON_SELECT }, results: true },
        orderBy: { SCREEN_ID: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.labDrugScreens.count({ where: { ...baseWhere, STATUS: 'Draft' } }),
      this.prisma.labDrugScreens.count({ where: { ...baseWhere, STATUS: 'Validated' } }),
      this.prisma.labDrugScreens.count({ where: { ...baseWhere, STATUS: 'Rejected' } }),
      this.prisma.labDrugScreens.count({
        where: {
          ...baseWhere,
          STATUS: { in: ['Collected', 'ResultsEntered', 'Submitted'] },
        },
      }),
    ]);
    return {
      items: rows.map((r) => this.mapDrugScreen(r)),
      meta: { page, limit, total },
      drugCatalog: DRUG_CATALOG,
      kpis: {
        draft,
        inProgress,
        validated,
        rejected,
        total: draft + inProgress + validated + rejected,
      },
    };
  }

  async getDrugScreen(id: number) {
    const row = await this.prisma.labDrugScreens.findFirst({
      where: { SCREEN_ID: id, NOT: { DELETED_FLAG: 'Y' } },
      include: { person: { select: PERSON_SELECT }, results: true },
    });
    if (!row) throw new NotFoundException('Drug screen not found');
    return this.mapDrugScreen(row);
  }

  async createDrugScreen(dto: CreateDrugScreenDto, actor?: AuthUser) {
    const person = await this.prisma.persons.findUnique({
      where: { PERSON_ID: dto.personId },
      select: PERSON_SELECT,
    });
    if (!person) throw new NotFoundException('Patient not found');
    const codes = [...new Set(dto.drugCodes.map((c) => c.trim().toLowerCase()))];
    if (!codes.length) throw new BadRequestException('Select at least one drug');
    const drugs = codes.map((code) => {
      const hit = DRUG_CATALOG.find((d) => d.code === code);
      if (!hit) throw new BadRequestException(`Unknown drug code: ${code}`);
      return hit;
    });
    const now = new Date();
    const label = actorLabel(actor);
    const created = await this.prisma.$transaction(async (tx) => {
      const draft = await tx.labDrugScreens.create({
        data: {
          SCREEN_NO: `TMP-${Date.now()}`,
          PERSON_ID: dto.personId,
          LAB_REQUEST_ID: dto.labRequestId ?? null,
          STATUS: 'Draft',
          CREATED_BY_ID: actor?.id ?? null,
          CREATED_BY: label,
          CREATED_DATE: now,
        },
      });
      const screenNo = `UDS-${now.getFullYear()}-${pad(draft.SCREEN_ID)}`;
      await tx.labDrugScreens.update({
        where: { SCREEN_ID: draft.SCREEN_ID },
        data: { SCREEN_NO: screenNo },
      });
      await tx.labDrugScreenResults.createMany({
        data: drugs.map((d) => ({
          SCREEN_ID: draft.SCREEN_ID,
          DRUG_CODE: d.code,
          DRUG_NAME: d.name,
          RESULT: 'Pending',
        })),
      });
      return draft.SCREEN_ID;
    });
    const response = await this.getDrugScreen(created);
    await this.audit.log({
      type: 'lab-drug-screen:create',
      entity: 'LabDrugScreen',
      entityId: created,
      personId: dto.personId,
      userId: actor?.id,
      createdBy: label,
      item: response.screenNo,
      newValue: { drugs: drugs.map((d) => d.code) },
    });
    return response;
  }

  async collectDrugScreen(
    id: number,
    dto: CollectDrugScreenDto,
    actor?: AuthUser,
  ) {
    const existing = await this.getDrugScreen(id);
    if (!['Draft', 'Collected'].includes(existing.status)) {
      throw new BadRequestException(`Cannot collect while status is ${existing.status}`);
    }
    const now = new Date();
    const label = actorLabel(actor);
    const sampleNo =
      dto.sampleNo?.trim() ||
      `UDS-SMP-${now.getFullYear()}-${pad(id)}`;
    await this.prisma.labDrugScreens.update({
      where: { SCREEN_ID: id },
      data: {
        STATUS: 'Collected',
        SAMPLE_NO: sampleNo,
        SAMPLE_TYPE: dto.sampleType?.trim() || 'Urine',
        COLLECTED_AT: dto.collectedAt ? new Date(dto.collectedAt) : now,
        COLLECTED_BY: label,
        UPDATED_BY_ID: actor?.id ?? null,
        UPDATED_BY: label,
        UPDATED_DATE: now,
      },
    });
    const response = await this.getDrugScreen(id);
    await this.audit.log({
      type: 'lab-drug-screen:collect',
      entity: 'LabDrugScreen',
      entityId: id,
      personId: existing.personId,
      userId: actor?.id,
      createdBy: label,
      item: response.screenNo,
    });
    return response;
  }

  async patchDrugScreenResults(
    id: number,
    dto: PatchDrugScreenResultsDto,
    actor?: AuthUser,
  ) {
    const existing = await this.getDrugScreen(id);
    if (['Validated', 'Rejected'].includes(existing.status)) {
      throw new BadRequestException('Cannot edit validated/rejected screen');
    }
    if (!['Collected', 'ResultsEntered', 'Submitted', 'Draft'].includes(existing.status)) {
      throw new BadRequestException(`Cannot enter results while status is ${existing.status}`);
    }
    const now = new Date();
    const label = actorLabel(actor);
    await this.prisma.$transaction(async (tx) => {
      for (const line of dto.results) {
        const code = line.drugCode.trim().toLowerCase();
        await tx.labDrugScreenResults.updateMany({
          where: { SCREEN_ID: id, DRUG_CODE: code },
          data: {
            RESULT: line.result,
            REMARKS: line.remarks?.trim() || null,
          },
        });
      }
      await tx.labDrugScreens.update({
        where: { SCREEN_ID: id },
        data: {
          STATUS: existing.status === 'Submitted' ? 'Submitted' : 'ResultsEntered',
          UPDATED_BY_ID: actor?.id ?? null,
          UPDATED_BY: label,
          UPDATED_DATE: now,
        },
      });
    });
    const response = await this.getDrugScreen(id);
    await this.audit.log({
      type: 'lab-drug-screen:results',
      entity: 'LabDrugScreen',
      entityId: id,
      personId: existing.personId,
      userId: actor?.id,
      createdBy: label,
      item: response.screenNo,
    });
    return response;
  }

  async submitDrugScreen(id: number, actor?: AuthUser) {
    const existing = await this.getDrugScreen(id);
    if (!['ResultsEntered', 'Collected', 'Submitted'].includes(existing.status)) {
      throw new BadRequestException(`Cannot submit while status is ${existing.status}`);
    }
    const pending = existing.results.filter((r) => r.result === 'Pending');
    if (pending.length) {
      throw new BadRequestException('All selected drugs must have a result before submit');
    }
    const now = new Date();
    const label = actorLabel(actor);
    await this.prisma.labDrugScreens.update({
      where: { SCREEN_ID: id },
      data: {
        STATUS: 'Submitted',
        UPDATED_BY_ID: actor?.id ?? null,
        UPDATED_BY: label,
        UPDATED_DATE: now,
      },
    });
    const response = await this.getDrugScreen(id);
    await this.audit.log({
      type: 'lab-drug-screen:submit',
      entity: 'LabDrugScreen',
      entityId: id,
      personId: existing.personId,
      userId: actor?.id,
      createdBy: label,
      item: response.screenNo,
    });
    return response;
  }

  async validateDrugScreen(id: number, actor?: AuthUser) {
    const existing = await this.getDrugScreen(id);
    if (existing.status !== 'Submitted' && existing.status !== 'ResultsEntered') {
      throw new BadRequestException('Only submitted screens can be validated');
    }
    const now = new Date();
    const label = actorLabel(actor);
    await this.prisma.labDrugScreens.update({
      where: { SCREEN_ID: id },
      data: {
        STATUS: 'Validated',
        VALIDATED_AT: now,
        VALIDATED_BY: label,
        UPDATED_BY_ID: actor?.id ?? null,
        UPDATED_BY: label,
        UPDATED_DATE: now,
      },
    });
    const response = await this.getDrugScreen(id);
    await this.audit.log({
      type: 'lab-drug-screen:validate',
      entity: 'LabDrugScreen',
      entityId: id,
      personId: existing.personId,
      userId: actor?.id,
      createdBy: label,
      item: response.screenNo,
    });
    return response;
  }

  async rejectDrugScreen(id: number, dto: RejectDrugScreenDto, actor?: AuthUser) {
    const existing = await this.getDrugScreen(id);
    if (existing.status === 'Validated') {
      throw new BadRequestException('Cannot reject a validated screen');
    }
    const now = new Date();
    const label = actorLabel(actor);
    await this.prisma.labDrugScreens.update({
      where: { SCREEN_ID: id },
      data: {
        STATUS: 'Rejected',
        REJECT_REASON: dto.reason.trim(),
        UPDATED_BY_ID: actor?.id ?? null,
        UPDATED_BY: label,
        UPDATED_DATE: now,
      },
    });
    const response = await this.getDrugScreen(id);
    await this.audit.log({
      type: 'lab-drug-screen:reject',
      entity: 'LabDrugScreen',
      entityId: id,
      personId: existing.personId,
      userId: actor?.id,
      createdBy: label,
      item: response.screenNo,
      newValue: { reason: dto.reason },
    });
    return response;
  }

  // ---------- Cultures ----------

  private mapCulture(
    row: Prisma.LabCulturesGetPayload<{
      include: {
        person: { select: typeof PERSON_SELECT };
        sensitivities: true;
      };
    }>,
  ) {
    const sensitivity: Record<string, string> = {};
    for (const s of row.sensitivities) {
      sensitivity[s.ANTIBIOTIC] = s.RESULT.toLowerCase();
    }
    return {
      cultureId: row.CULTURE_ID,
      cultureNo: row.CULTURE_NO,
      personId: row.PERSON_ID,
      labRequestId: row.LAB_REQUEST_ID,
      patientName: personName(row.person),
      hospitalNo: row.person.HOSPITAL_NO,
      cultureType: row.CULTURE_TYPE,
      organism: row.ORGANISM,
      colonyCount: row.COLONY_COUNT,
      gramStain: row.GRAM_STAIN,
      status: row.STATUS,
      scientist: row.SCIENTIST,
      reportedAt: row.REPORTED_AT?.toISOString() ?? null,
      createdAt: row.CREATED_DATE?.toISOString() ?? null,
      createdBy: row.CREATED_BY,
      sensitivity,
      sensitivities: row.sensitivities.map((s) => ({
        antibiotic: s.ANTIBIOTIC,
        result: s.RESULT.toUpperCase(),
      })),
    };
  }

  async listCultures(params?: {
    status?: string;
    personId?: number;
    q?: string;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(1, params?.page ?? 1);
    const limit = Math.min(100, Math.max(1, params?.limit ?? 50));
    const where: Prisma.LabCulturesWhereInput = {
      NOT: { DELETED_FLAG: 'Y' },
    };
    if (params?.status) where.STATUS = params.status;
    if (params?.personId) where.PERSON_ID = params.personId;
    if (params?.q?.trim()) {
      const q = params.q.trim();
      where.OR = [
        { CULTURE_NO: { contains: q, mode: 'insensitive' } },
        { ORGANISM: { contains: q, mode: 'insensitive' } },
        { CULTURE_TYPE: { contains: q, mode: 'insensitive' } },
        { person: { HOSPITAL_NO: { contains: q, mode: 'insensitive' } } },
        { person: { FIRST_NAME: { contains: q, mode: 'insensitive' } } },
        { person: { LAST_NAME: { contains: q, mode: 'insensitive' } } },
      ];
    }
    const [total, rows, finalCount, provisionalCount] = await Promise.all([
      this.prisma.labCultures.count({ where }),
      this.prisma.labCultures.findMany({
        where,
        include: { person: { select: PERSON_SELECT }, sensitivities: true },
        orderBy: { CULTURE_ID: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.labCultures.count({
        where: { NOT: { DELETED_FLAG: 'Y' }, STATUS: 'Final' },
      }),
      this.prisma.labCultures.count({
        where: { NOT: { DELETED_FLAG: 'Y' }, STATUS: 'Provisional' },
      }),
    ]);
    const organisms = new Set(
      rows.map((r) => r.ORGANISM).filter((o): o is string => Boolean(o)),
    );
    return {
      items: rows.map((r) => this.mapCulture(r)),
      meta: { page, limit, total },
      kpis: {
        savedCultures: total,
        finalReports: finalCount,
        provisional: provisionalCount,
        organismsTracked: organisms.size,
      },
    };
  }

  async getCulture(id: number) {
    const row = await this.prisma.labCultures.findFirst({
      where: { CULTURE_ID: id, NOT: { DELETED_FLAG: 'Y' } },
      include: { person: { select: PERSON_SELECT }, sensitivities: true },
    });
    if (!row) throw new NotFoundException('Culture not found');
    return this.mapCulture(row);
  }

  async createCulture(dto: CreateCultureDto, actor?: AuthUser) {
    const person = await this.prisma.persons.findUnique({
      where: { PERSON_ID: dto.personId },
      select: PERSON_SELECT,
    });
    if (!person) throw new NotFoundException('Patient not found');
    const now = new Date();
    const label = actorLabel(actor);
    const status = dto.status ?? 'Final';
    const created = await this.prisma.$transaction(async (tx) => {
      const draft = await tx.labCultures.create({
        data: {
          CULTURE_NO: `TMP-${Date.now()}`,
          PERSON_ID: dto.personId,
          LAB_REQUEST_ID: dto.labRequestId ?? null,
          CULTURE_TYPE: dto.cultureType.trim(),
          ORGANISM: dto.organism?.trim() || null,
          COLONY_COUNT: dto.colonyCount?.trim() || null,
          GRAM_STAIN: dto.gramStain?.trim() || null,
          STATUS: status,
          SCIENTIST: dto.scientist?.trim() || label,
          REPORTED_AT: now,
          CREATED_BY_ID: actor?.id ?? null,
          CREATED_BY: label,
          CREATED_DATE: now,
        },
      });
      const cultureNo = `CUL-${now.getFullYear()}-${pad(draft.CULTURE_ID)}`;
      await tx.labCultures.update({
        where: { CULTURE_ID: draft.CULTURE_ID },
        data: { CULTURE_NO: cultureNo },
      });
      if (dto.sensitivities?.length) {
        await tx.labCultureSensitivities.createMany({
          data: dto.sensitivities.map((s) => ({
            CULTURE_ID: draft.CULTURE_ID,
            ANTIBIOTIC: s.antibiotic.trim(),
            RESULT: s.result.toUpperCase().slice(0, 1),
          })),
        });
      }
      return draft.CULTURE_ID;
    });
    const response = await this.getCulture(created);
    await this.audit.log({
      type: 'lab-culture:create',
      entity: 'LabCulture',
      entityId: created,
      personId: dto.personId,
      userId: actor?.id,
      createdBy: label,
      item: response.cultureNo,
    });
    return response;
  }

  async patchCulture(id: number, dto: PatchCultureDto, actor?: AuthUser) {
    const existing = await this.getCulture(id);
    const now = new Date();
    const label = actorLabel(actor);
    await this.prisma.$transaction(async (tx) => {
      await tx.labCultures.update({
        where: { CULTURE_ID: id },
        data: {
          ORGANISM: dto.organism !== undefined ? dto.organism.trim() || null : undefined,
          COLONY_COUNT:
            dto.colonyCount !== undefined ? dto.colonyCount.trim() || null : undefined,
          GRAM_STAIN:
            dto.gramStain !== undefined ? dto.gramStain.trim() || null : undefined,
          STATUS: dto.status,
          SCIENTIST:
            dto.scientist !== undefined ? dto.scientist.trim() || null : undefined,
          UPDATED_BY_ID: actor?.id ?? null,
          UPDATED_BY: label,
          UPDATED_DATE: now,
        },
      });
      if (dto.sensitivities) {
        await tx.labCultureSensitivities.deleteMany({ where: { CULTURE_ID: id } });
        if (dto.sensitivities.length) {
          await tx.labCultureSensitivities.createMany({
            data: dto.sensitivities.map((s) => ({
              CULTURE_ID: id,
              ANTIBIOTIC: s.antibiotic.trim(),
              RESULT: s.result.toUpperCase().slice(0, 1),
            })),
          });
        }
      }
    });
    const response = await this.getCulture(id);
    await this.audit.log({
      type: 'lab-culture:update',
      entity: 'LabCulture',
      entityId: id,
      personId: existing.personId,
      userId: actor?.id,
      createdBy: label,
      item: response.cultureNo,
    });
    return response;
  }

  // ---------- Reports ----------

  async listReports(params?: { page?: number; limit?: number }) {
    const page = Math.max(1, params?.page ?? 1);
    const limit = Math.min(100, Math.max(1, params?.limit ?? 50));
    const [total, rows] = await Promise.all([
      this.prisma.labReportSnapshots.count(),
      this.prisma.labReportSnapshots.findMany({
        orderBy: { CREATED_DATE: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);
    return {
      items: rows.map((r) => ({
        reportId: r.REPORT_ID,
        reportType: r.REPORT_TYPE,
        from: r.FROM_DATE.toISOString().slice(0, 10),
        to: r.TO_DATE.toISOString().slice(0, 10),
        title: r.TITLE,
        fileSizeLabel: r.FILE_SIZE_LABEL,
        createdBy: r.CREATED_BY,
        createdAt: r.CREATED_DATE.toISOString(),
      })),
      meta: { page, limit, total },
      kpis: {
        reportsGenerated: total,
        scheduled: 0,
        downloadsMonth: total,
      },
    };
  }

  async getReport(id: number) {
    const row = await this.prisma.labReportSnapshots.findUnique({
      where: { REPORT_ID: id },
    });
    if (!row) throw new NotFoundException('Report not found');
    return {
      reportId: row.REPORT_ID,
      reportType: row.REPORT_TYPE,
      from: row.FROM_DATE.toISOString().slice(0, 10),
      to: row.TO_DATE.toISOString().slice(0, 10),
      title: row.TITLE,
      payload: row.PAYLOAD,
      fileSizeLabel: row.FILE_SIZE_LABEL,
      createdBy: row.CREATED_BY,
      createdAt: row.CREATED_DATE.toISOString(),
    };
  }

  async generateReport(dto: GenerateLabReportDto, actor?: AuthUser) {
    const from = new Date(dto.from);
    const to = new Date(dto.to);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      throw new BadRequestException('Invalid from/to dates (use YYYY-MM-DD)');
    }
    const toExclusive = new Date(to);
    toExclusive.setUTCDate(toExclusive.getUTCDate() + 1);

    const [requests, paid, drugScreens, cultures] = await Promise.all([
      this.prisma.labRequests.count({
        where: {
          STATUS: { not: 'Cancelled' },
          CREATED_DATE: { gte: from, lt: toExclusive },
        },
      }),
      this.prisma.labRequests.aggregate({
        where: {
          PAYMENT_STATUS: 'Paid',
          PAID_AT: { gte: from, lt: toExclusive },
        },
        _sum: { TOTAL_AMOUNT: true },
        _count: { _all: true },
      }),
      this.prisma.labDrugScreens.count({
        where: {
          NOT: { DELETED_FLAG: 'Y' },
          CREATED_DATE: { gte: from, lt: toExclusive },
        },
      }),
      this.prisma.labCultures.count({
        where: {
          NOT: { DELETED_FLAG: 'Y' },
          CREATED_DATE: { gte: from, lt: toExclusive },
        },
      }),
    ]);

    const topTests = await this.prisma.labRequestItems.groupBy({
      by: ['TEST_NAME'],
      where: {
        request: {
          STATUS: { not: 'Cancelled' },
          CREATED_DATE: { gte: from, lt: toExclusive },
        },
      },
      _count: { ITEM_ID: true },
      orderBy: { _count: { ITEM_ID: 'desc' } },
      take: 10,
    });

    const revenue = Number(paid._sum.TOTAL_AMOUNT ?? 0);
    const payload = {
      reportType: dto.reportType,
      from: dto.from,
      to: dto.to,
      totalTestsPerformed: requests,
      paidRequests: paid._count._all,
      revenue,
      drugScreens,
      cultures,
      topTests: topTests.map((t) => ({
        name: t.TEST_NAME,
        count: t._count.ITEM_ID,
      })),
      summary:
        dto.reportType === 'Revenue Report'
          ? `Revenue ${revenue.toLocaleString()} across ${paid._count._all} paid requests`
          : dto.reportType === 'Drug Screen Report'
            ? `${drugScreens} urine drug screens in period`
            : dto.reportType === 'Culture Report'
              ? `${cultures} culture reports in period`
              : `${requests} lab requests in period`,
    };

    const label = actorLabel(actor);
    const title =
      dto.title?.trim() ||
      `${dto.reportType} · ${dto.from} → ${dto.to}`;
    const json = JSON.stringify(payload);
    const sizeKb = Math.max(1, Math.round(json.length / 1024));
    const row = await this.prisma.labReportSnapshots.create({
      data: {
        REPORT_TYPE: dto.reportType,
        FROM_DATE: from,
        TO_DATE: to,
        TITLE: title,
        PAYLOAD: payload as Prisma.InputJsonValue,
        FILE_SIZE_LABEL: `${sizeKb} KB`,
        CREATED_BY_ID: actor?.id ?? null,
        CREATED_BY: label,
      },
    });
    await this.audit.log({
      type: 'lab-report:generate',
      entity: 'LabReportSnapshot',
      entityId: row.REPORT_ID,
      userId: actor?.id,
      createdBy: label,
      item: title,
    });
    return this.getReport(row.REPORT_ID);
  }
}
