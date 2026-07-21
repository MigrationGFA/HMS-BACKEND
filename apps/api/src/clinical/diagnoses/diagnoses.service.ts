import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import type { AuthUser } from '../../auth/types/auth-user.type';
import type {
  CreatePatientDiagnosisDto,
  UpdatePatientDiagnosisDto,
} from './dto/diagnosis.dto';

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

function actorLabelOf(actor?: AuthUser): string {
  return (
    actor?.email ||
    [actor?.firstName, actor?.lastName].filter(Boolean).join(' ') ||
    'SYSTEM'
  );
}

function personName(p: {
  FIRST_NAME: string | null;
  MIDDLE_NAME: string | null;
  LAST_NAME: string | null;
} | null): string {
  if (!p) return 'Unknown';
  return (
    [p.FIRST_NAME, p.MIDDLE_NAME, p.LAST_NAME].filter(Boolean).join(' ') ||
    'Unknown'
  );
}

function isNewThisWeek(created: Date | null): boolean {
  if (!created) return false;
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  return created.getTime() >= weekAgo;
}

@Injectable()
export class DiagnosesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  toCatalogResponse(row: {
    DIAGNOSIS_CODE_ID: number;
    CODE: string;
    DSM_CODE: string | null;
    SYSTEM: string;
    NAME: string;
    CATEGORY: string | null;
    DESCRIPTION: string | null;
    SYMPTOMS: string | null;
    KEYWORDS: string | null;
    IS_PSYCHIATRIC: boolean;
    STATUS: string;
  }) {
    return {
      diagnosisCodeId: row.DIAGNOSIS_CODE_ID,
      id: String(row.DIAGNOSIS_CODE_ID),
      code: row.CODE,
      dsmCode: row.DSM_CODE,
      system: row.SYSTEM,
      name: row.NAME,
      category: row.CATEGORY,
      description: row.DESCRIPTION,
      symptoms: row.SYMPTOMS,
      keywords: row.KEYWORDS,
      isPsychiatric: row.IS_PSYCHIATRIC,
      status: row.STATUS,
    };
  }

  toPatientDxResponse(
    row: {
      PATIENT_DIAGNOSIS_ID: number;
      PERSON_ID: number;
      ENCOUNTER_ID: number | null;
      CODE: string;
      DSM_CODE: string | null;
      SYSTEM: string;
      NAME: string;
      TYPE: string;
      SEVERITY: string | null;
      STATUS: string;
      CERTAINTY: string | null;
      ONSET_DATE: Date | null;
      NOTES: string | null;
      CLINIC: string | null;
      ON_PROBLEM_LIST: boolean;
      IS_PSYCHIATRIC: boolean;
      REASON_CONSIDERED: string | null;
      SUPPORTING_FINDINGS: string | null;
      AGAINST_FINDINGS: string | null;
      CONTROL_STATUS: string | null;
      LAST_REVIEW: Date | null;
      NEXT_REVIEW: Date | null;
      RISK_LEVEL: string | null;
      LINKED_SYMPTOMS: string | null;
      LINKED_LAB: string | null;
      LINKED_IMAGING: string | null;
      LINKED_RX: string | null;
      CLOSED_REASON: string | null;
      CLOSED_BY: string | null;
      CLOSED_DATE: Date | null;
      CREATED_BY: string | null;
      CREATED_DATE: Date | null;
      person?: {
        PERSON_ID: number;
        HOSPITAL_NO: string | null;
        FIRST_NAME: string | null;
        LAST_NAME: string | null;
        MIDDLE_NAME: string | null;
        SEX: string | null;
        DATE_OF_BIRTH: Date | null;
        PATIENT_PHONE_NO: string | null;
      } | null;
    },
  ) {
    return {
      patientDiagnosisId: row.PATIENT_DIAGNOSIS_ID,
      id: String(row.PATIENT_DIAGNOSIS_ID),
      personId: row.PERSON_ID,
      patientId: String(row.PERSON_ID),
      patientName: personName(row.person ?? null),
      hospitalId: row.person?.HOSPITAL_NO ?? null,
      encounterId: row.ENCOUNTER_ID,
      encounter: row.ENCOUNTER_ID != null ? String(row.ENCOUNTER_ID) : '',
      code: row.CODE,
      dsmCode: row.DSM_CODE,
      system: row.SYSTEM,
      name: row.NAME,
      type: row.TYPE,
      severity: row.SEVERITY,
      status: row.STATUS,
      certainty: row.CERTAINTY,
      dateAdded: row.CREATED_DATE?.toISOString().slice(0, 10) ?? null,
      addedBy: row.CREATED_BY,
      clinic: row.CLINIC,
      notes: row.NOTES ?? '',
      onsetDate: row.ONSET_DATE?.toISOString().slice(0, 10) ?? '',
      onProblemList: row.ON_PROBLEM_LIST,
      isPsychiatric: row.IS_PSYCHIATRIC,
      isNewThisWeek: isNewThisWeek(row.CREATED_DATE),
      reasonConsidered: row.REASON_CONSIDERED,
      supportingFindings: row.SUPPORTING_FINDINGS,
      againstFindings: row.AGAINST_FINDINGS,
      controlStatus: row.CONTROL_STATUS,
      lastReview: row.LAST_REVIEW?.toISOString().slice(0, 10) ?? null,
      nextReview: row.NEXT_REVIEW?.toISOString().slice(0, 10) ?? null,
      riskLevel: row.RISK_LEVEL,
      linkedSymptoms: row.LINKED_SYMPTOMS,
      linkedLab: row.LINKED_LAB,
      linkedImaging: row.LINKED_IMAGING,
      linkedRx: row.LINKED_RX,
      closedReason: row.CLOSED_REASON,
      closedBy: row.CLOSED_BY,
      closedDate: row.CLOSED_DATE?.toISOString().slice(0, 10) ?? null,
      person: row.person
        ? {
            personId: row.person.PERSON_ID,
            hospitalNo: row.person.HOSPITAL_NO,
            firstName: row.person.FIRST_NAME,
            lastName: row.person.LAST_NAME,
            middleName: row.person.MIDDLE_NAME,
            sex: row.person.SEX,
            dateOfBirth: row.person.DATE_OF_BIRTH?.toISOString() ?? null,
            phone: row.person.PATIENT_PHONE_NO,
          }
        : null,
    };
  }

  async listCatalog(params?: {
    q?: string;
    system?: string;
    category?: string;
  }) {
    const where: Prisma.DiagnosisCodesWhereInput = { STATUS: 'Active' };
    if (params?.system?.trim()) where.SYSTEM = params.system.trim();
    if (params?.category?.trim()) where.CATEGORY = params.category.trim();
    if (params?.q?.trim()) {
      const q = params.q.trim();
      where.OR = [
        { CODE: { contains: q, mode: 'insensitive' } },
        { NAME: { contains: q, mode: 'insensitive' } },
        { KEYWORDS: { contains: q, mode: 'insensitive' } },
        { SYMPTOMS: { contains: q, mode: 'insensitive' } },
        { CATEGORY: { contains: q, mode: 'insensitive' } },
      ];
    }
    const rows = await this.prisma.diagnosisCodes.findMany({
      where,
      orderBy: { NAME: 'asc' },
      take: 100,
    });
    return { items: rows.map((r) => this.toCatalogResponse(r)) };
  }

  async list(params: {
    personId?: number;
    status?: string;
    type?: string;
    tab?: string;
    q?: string;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(100, Math.max(1, params.limit ?? 50));
    const where: Prisma.PatientDiagnosesWhereInput = {};
    if (params.personId != null) where.PERSON_ID = params.personId;
    if (params.status?.trim()) {
      const parts = params.status.split(',').map((s) => s.trim()).filter(Boolean);
      where.STATUS = parts.length === 1 ? parts[0] : { in: parts };
    }
    if (params.type?.trim()) {
      const parts = params.type.split(',').map((s) => s.trim()).filter(Boolean);
      where.TYPE = parts.length === 1 ? parts[0] : { in: parts };
    }
    if (params.tab === 'psychiatric') where.IS_PSYCHIATRIC = true;
    if (params.tab === 'differential') where.TYPE = 'Differential';
    if (params.tab === 'chronic') where.STATUS = 'Chronic';
    if (params.tab === 'active') {
      where.STATUS = { in: ['Active', 'In remission'] };
      where.TYPE = { not: 'Ruled out' };
    }
    if (params.tab === 'resolved') {
      where.OR = [
        { STATUS: 'Resolved' },
        { TYPE: 'Ruled out' },
      ];
    }
    if (params.tab === 'provisional') where.TYPE = 'Provisional';
    if (params.tab === 'new') {
      where.CREATED_DATE = {
        gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      };
    }
    if (params.q?.trim()) {
      const q = params.q.trim();
      where.AND = [
        ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
        {
          OR: [
            { CODE: { contains: q, mode: 'insensitive' } },
            { NAME: { contains: q, mode: 'insensitive' } },
            { NOTES: { contains: q, mode: 'insensitive' } },
          ],
        },
      ];
    }

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.patientDiagnoses.count({ where }),
      this.prisma.patientDiagnoses.findMany({
        where,
        include: { person: { select: PERSON_SELECT } },
        orderBy: { CREATED_DATE: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      items: rows.map((r) => this.toPatientDxResponse(r)),
      meta: { page, limit, total },
    };
  }

  async stats(personId?: number) {
    const where: Prisma.PatientDiagnosesWhereInput = personId
      ? { PERSON_ID: personId }
      : {};
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [active, chronic, psychiatric, provisional, differential, resolved, neu] =
      await this.prisma.$transaction([
        this.prisma.patientDiagnoses.count({
          where: {
            ...where,
            STATUS: { in: ['Active', 'In remission'] },
            TYPE: { not: 'Ruled out' },
          },
        }),
        this.prisma.patientDiagnoses.count({
          where: { ...where, STATUS: 'Chronic' },
        }),
        this.prisma.patientDiagnoses.count({
          where: { ...where, IS_PSYCHIATRIC: true },
        }),
        this.prisma.patientDiagnoses.count({
          where: { ...where, TYPE: 'Provisional' },
        }),
        this.prisma.patientDiagnoses.count({
          where: { ...where, TYPE: 'Differential' },
        }),
        this.prisma.patientDiagnoses.count({
          where: {
            ...where,
            OR: [{ STATUS: 'Resolved' }, { TYPE: 'Ruled out' }],
          },
        }),
        this.prisma.patientDiagnoses.count({
          where: { ...where, CREATED_DATE: { gte: weekAgo } },
        }),
      ]);
    return {
      active,
      newThisWeek: neu,
      chronic,
      psychiatric,
      provisional,
      differential,
      resolved,
    };
  }

  async findById(id: number) {
    const row = await this.prisma.patientDiagnoses.findUnique({
      where: { PATIENT_DIAGNOSIS_ID: id },
      include: { person: { select: PERSON_SELECT } },
    });
    if (!row) throw new NotFoundException('Diagnosis not found');
    return this.toPatientDxResponse(row);
  }

  async create(dto: CreatePatientDiagnosisDto, actor?: AuthUser) {
    const person = await this.prisma.persons.findUnique({
      where: { PERSON_ID: dto.personId },
    });
    if (!person || person.DISCONTINUE_FLAG === 'Y') {
      throw new NotFoundException('Person not found');
    }

    let code = dto.code?.trim();
    let name = dto.name?.trim();
    let system = dto.system?.trim() || 'ICD-11';
    let dsmCode: string | null = null;
    let isPsychiatric = false;
    let catalogId = dto.diagnosisCodeId;

    if (catalogId || code) {
      const catalog = catalogId
        ? await this.prisma.diagnosisCodes.findUnique({
            where: { DIAGNOSIS_CODE_ID: catalogId },
          })
        : await this.prisma.diagnosisCodes.findFirst({
            where: { CODE: code!, STATUS: 'Active' },
          });
      if (catalog) {
        code = catalog.CODE;
        name = name || catalog.NAME;
        system = catalog.SYSTEM;
        dsmCode = catalog.DSM_CODE;
        isPsychiatric = catalog.IS_PSYCHIATRIC;
      }
    }

    if (!code || !name) {
      throw new BadRequestException('code (or diagnosisCodeId) and name are required');
    }

    const actorLabel = actorLabelOf(actor);
    const now = new Date();
    const row = await this.prisma.patientDiagnoses.create({
      data: {
        PERSON_ID: dto.personId,
        ENCOUNTER_ID: dto.encounterId ?? null,
        CODE: code,
        DSM_CODE: dsmCode,
        SYSTEM: system,
        NAME: name,
        TYPE: dto.type ?? 'Primary',
        SEVERITY: dto.severity ?? null,
        STATUS: dto.status ?? 'Active',
        CERTAINTY: dto.certainty ?? null,
        ONSET_DATE: dto.onsetDate ? new Date(dto.onsetDate) : null,
        NOTES: dto.notes?.trim() || null,
        CLINIC: dto.clinic?.trim() || null,
        ON_PROBLEM_LIST: dto.onProblemList ?? true,
        IS_PSYCHIATRIC: isPsychiatric,
        REASON_CONSIDERED: dto.reasonConsidered?.trim() || null,
        SUPPORTING_FINDINGS: dto.supportingFindings?.trim() || null,
        AGAINST_FINDINGS: dto.againstFindings?.trim() || null,
        LINKED_SYMPTOMS: dto.linkedSymptoms?.trim() || null,
        LINKED_LAB: dto.linkedLab?.trim() || null,
        LINKED_IMAGING: dto.linkedImaging?.trim() || null,
        LINKED_RX: dto.linkedRx?.trim() || null,
        RISK_LEVEL: dto.riskLevel?.trim() || null,
        CREATED_BY_ID: actor?.id ?? null,
        CREATED_BY: actorLabel,
        CREATED_DATE: now,
        UPDATED_BY_ID: actor?.id ?? null,
        UPDATED_BY: actorLabel,
        UPDATED_DATE: now,
      },
      include: { person: { select: PERSON_SELECT } },
    });

    await this.audit.log({
      type: 'diagnosis:create',
      entity: 'patient-diagnosis',
      entityId: row.PATIENT_DIAGNOSIS_ID,
      personId: row.PERSON_ID,
      userId: actor?.id,
      createdBy: actorLabel,
      item: `Diagnosis ${row.CODE} ${row.NAME}`,
      newValue: { code: row.CODE, type: row.TYPE, status: row.STATUS },
    });

    return this.toPatientDxResponse(row);
  }

  async update(
    id: number,
    dto: UpdatePatientDiagnosisDto,
    actor?: AuthUser,
  ) {
    const existing = await this.prisma.patientDiagnoses.findUnique({
      where: { PATIENT_DIAGNOSIS_ID: id },
    });
    if (!existing) throw new NotFoundException('Diagnosis not found');

    const actorLabel = actorLabelOf(actor);
    const now = new Date();
    const closing =
      dto.status === 'Resolved' ||
      dto.type === 'Ruled out' ||
      (dto.closedReason != null && dto.closedReason.trim() !== '');

    const row = await this.prisma.patientDiagnoses.update({
      where: { PATIENT_DIAGNOSIS_ID: id },
      data: {
        TYPE: dto.type ?? undefined,
        SEVERITY: dto.severity ?? undefined,
        STATUS: dto.status ?? undefined,
        CERTAINTY: dto.certainty ?? undefined,
        NOTES: dto.notes !== undefined ? dto.notes.trim() || null : undefined,
        ON_PROBLEM_LIST: dto.onProblemList ?? undefined,
        CONTROL_STATUS: dto.controlStatus ?? undefined,
        RISK_LEVEL: dto.riskLevel ?? undefined,
        LAST_REVIEW: dto.lastReview ? new Date(dto.lastReview) : undefined,
        NEXT_REVIEW: dto.nextReview ? new Date(dto.nextReview) : undefined,
        CLOSED_REASON: dto.closedReason?.trim() || undefined,
        CLOSED_BY: closing ? actorLabel : undefined,
        CLOSED_DATE: closing ? now : undefined,
        UPDATED_BY_ID: actor?.id ?? null,
        UPDATED_BY: actorLabel,
        UPDATED_DATE: now,
      },
      include: { person: { select: PERSON_SELECT } },
    });

    await this.audit.log({
      type: 'diagnosis:update',
      entity: 'patient-diagnosis',
      entityId: row.PATIENT_DIAGNOSIS_ID,
      personId: row.PERSON_ID,
      userId: actor?.id,
      createdBy: actorLabel,
      item: `Updated diagnosis ${row.CODE}`,
      oldValue: {
        type: existing.TYPE,
        status: existing.STATUS,
      },
      newValue: {
        type: row.TYPE,
        status: row.STATUS,
      },
    });

    return this.toPatientDxResponse(row);
  }
}
