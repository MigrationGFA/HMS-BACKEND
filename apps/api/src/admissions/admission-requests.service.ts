import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../auth/types/auth-user.type';
import type {
  CreateAdmissionRequestDto,
  UpdateAdmissionRequestDto,
} from './dto/admission-request.dto';

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

type RowWithRels = Prisma.AdmissionRequestsGetPayload<{
  include: {
    person: { select: typeof PERSON_SELECT };
    ward: true;
  };
}>;

@Injectable()
export class AdmissionRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private toResponse(row: RowWithRels) {
    return {
      admissionRequestId: row.ADMISSION_REQUEST_ID,
      requestNo: row.REQUEST_NO,
      personId: row.PERSON_ID,
      encounterId: row.ENCOUNTER_ID,
      wardId: row.WARD_ID,
      wardPreference: row.WARD_PREFERENCE,
      priority: row.PRIORITY,
      priorityReason: row.PRIORITY_REASON,
      admissionType: row.ADMISSION_TYPE,
      estimatedLos: row.ESTIMATED_LOS,
      provisionalDiagnosis: row.PROVISIONAL_DIAGNOSIS,
      secondaryDiagnosis: row.SECONDARY_DIAGNOSIS,
      clinicalIndication: row.CLINICAL_INDICATION,
      mentalHealthRisk: row.MENTAL_HEALTH_RISK,
      physicalHealthRisk: row.PHYSICAL_HEALTH_RISK,
      treatmentPlan: row.TREATMENT_PLAN,
      requiredMonitoring: row.REQUIRED_MONITORING,
      nursingObservation: row.NURSING_OBSERVATION,
      isolationRequired: row.ISOLATION_REQUIRED,
      fallRisk: row.FALL_RISK,
      suicideRisk: row.SUICIDE_RISK,
      violenceRisk: row.VIOLENCE_RISK,
      withdrawalRisk: row.WITHDRAWAL_RISK,
      specialBed: row.SPECIAL_BED,
      consentStatus: row.CONSENT_STATUS,
      nokInformed: row.NOK_INFORMED,
      clinicDepartment: row.CLINIC_DEPARTMENT,
      doctorNote: row.DOCTOR_NOTE,
      status: row.STATUS,
      rejectionReason: row.REJECTION_REASON,
      requestedByUserId: row.REQUESTED_BY_USER_ID,
      requestedBy: row.REQUESTED_BY,
      createdAt: row.CREATED_DATE?.toISOString() ?? null,
      updatedAt: row.UPDATED_DATE?.toISOString() ?? null,
      person: mapPerson(row.person),
      ward: row.ward
        ? {
            wardId: row.ward.WARD_ID,
            code: row.ward.CODE,
            name: row.ward.NAME,
            wardType: row.ward.WARD_TYPE,
          }
        : null,
    };
  }

  private include() {
    return {
      person: { select: PERSON_SELECT },
      ward: true,
    } as const;
  }

  async create(dto: CreateAdmissionRequestDto, actor?: AuthUser) {
    const person = await this.prisma.persons.findUnique({
      where: { PERSON_ID: dto.personId },
      select: { PERSON_ID: true },
    });
    if (!person) throw new NotFoundException('Person not found');

    if (dto.wardId) {
      const ward = await this.prisma.wards.findUnique({
        where: { WARD_ID: dto.wardId },
      });
      if (!ward) throw new NotFoundException('Ward not found');
    }

    const priority = dto.priority ?? 'Routine';
    if (priority !== 'Routine' && !dto.priorityReason?.trim()) {
      throw new BadRequestException(
        'priorityReason is required for Urgent or Emergency requests',
      );
    }
    if (!dto.asDraft) {
      if (!dto.provisionalDiagnosis?.trim()) {
        throw new BadRequestException('provisionalDiagnosis is required');
      }
      if (!dto.clinicalIndication?.trim()) {
        throw new BadRequestException('clinicalIndication is required');
      }
    }

    const actorLabel = actorLabelOf(actor);
    const now = new Date();
    const year = now.getFullYear();
    const status = dto.asDraft ? 'Draft' : 'Submitted';

    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.admissionRequests.create({
        data: {
          REQUEST_NO: `AR-${year}-PENDING`,
          PERSON_ID: dto.personId,
          ENCOUNTER_ID: dto.encounterId ?? null,
          WARD_ID: dto.wardId ?? null,
          WARD_PREFERENCE: dto.wardPreference?.trim() || null,
          PRIORITY: priority,
          PRIORITY_REASON: dto.priorityReason?.trim() || null,
          ADMISSION_TYPE: dto.admissionType ?? 'New admission',
          ESTIMATED_LOS: dto.estimatedLos?.trim() || null,
          PROVISIONAL_DIAGNOSIS: dto.provisionalDiagnosis?.trim() || null,
          SECONDARY_DIAGNOSIS: dto.secondaryDiagnosis?.trim() || null,
          CLINICAL_INDICATION: dto.clinicalIndication?.trim() || null,
          MENTAL_HEALTH_RISK: dto.mentalHealthRisk?.trim() || null,
          PHYSICAL_HEALTH_RISK: dto.physicalHealthRisk?.trim() || null,
          TREATMENT_PLAN: dto.treatmentPlan?.trim() || null,
          REQUIRED_MONITORING: dto.requiredMonitoring?.trim() || null,
          NURSING_OBSERVATION: dto.nursingObservation ?? 'General',
          ISOLATION_REQUIRED: dto.isolationRequired ?? false,
          FALL_RISK: dto.fallRisk ?? false,
          SUICIDE_RISK: dto.suicideRisk ?? false,
          VIOLENCE_RISK: dto.violenceRisk ?? false,
          WITHDRAWAL_RISK: dto.withdrawalRisk ?? false,
          SPECIAL_BED: dto.specialBed?.trim() || null,
          CONSENT_STATUS: dto.consentStatus ?? null,
          NOK_INFORMED: dto.nokInformed ?? null,
          CLINIC_DEPARTMENT: dto.clinicDepartment?.trim() || null,
          DOCTOR_NOTE: dto.doctorNote?.trim() || null,
          STATUS: status,
          REQUESTED_BY_USER_ID: actor?.id ?? null,
          REQUESTED_BY: actorLabel,
          CREATED_BY_ID: actor?.id ?? null,
          CREATED_BY: actorLabel,
          CREATED_DATE: now,
          UPDATED_BY_ID: actor?.id ?? null,
          UPDATED_BY: actorLabel,
          UPDATED_DATE: now,
        },
      });
      const pad = (n: number) => String(n).padStart(4, '0');
      return tx.admissionRequests.update({
        where: { ADMISSION_REQUEST_ID: created.ADMISSION_REQUEST_ID },
        data: { REQUEST_NO: `AR-${year}-${pad(created.ADMISSION_REQUEST_ID)}` },
        include: this.include(),
      });
    });

    await this.audit.log({
      type: 'admission-request:create',
      entity: 'admission-request',
      entityId: row.ADMISSION_REQUEST_ID,
      personId: row.PERSON_ID,
      userId: actor?.id,
      createdBy: actorLabel,
      item: `Admission request ${row.REQUEST_NO} (${status})`,
      newValue: {
        admissionRequestId: row.ADMISSION_REQUEST_ID,
        requestNo: row.REQUEST_NO,
        status,
        priority,
      },
    });

    return this.toResponse(row);
  }

  async list(params: {
    scope?: string;
    status?: string;
    personId?: number;
    q?: string;
    page?: number;
    limit?: number;
    actor?: AuthUser;
  }) {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(100, Math.max(1, params.limit ?? 50));
    const where: Prisma.AdmissionRequestsWhereInput = {};

    const scope = (params.scope ?? 'all').toLowerCase();
    if (scope === 'mine') {
      if (!params.actor?.id) {
        throw new BadRequestException('Authenticated user required for scope=mine');
      }
      where.REQUESTED_BY_USER_ID = params.actor.id;
    }

    if (params.status) {
      const statuses = params.status.split(',').map((s) => s.trim()).filter(Boolean);
      where.STATUS = statuses.length === 1 ? statuses[0] : { in: statuses };
    }
    if (params.personId) where.PERSON_ID = params.personId;

    if (params.q?.trim()) {
      const q = params.q.trim();
      where.OR = [
        { REQUEST_NO: { contains: q, mode: 'insensitive' } },
        { PROVISIONAL_DIAGNOSIS: { contains: q, mode: 'insensitive' } },
        { WARD_PREFERENCE: { contains: q, mode: 'insensitive' } },
        { REQUESTED_BY: { contains: q, mode: 'insensitive' } },
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
      this.prisma.admissionRequests.count({ where }),
      this.prisma.admissionRequests.findMany({
        where,
        include: this.include(),
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

  async findById(id: number) {
    const row = await this.prisma.admissionRequests.findUnique({
      where: { ADMISSION_REQUEST_ID: id },
      include: this.include(),
    });
    if (!row) throw new NotFoundException('Admission request not found');
    return this.toResponse(row);
  }

  async update(id: number, dto: UpdateAdmissionRequestDto, actor?: AuthUser) {
    const existing = await this.prisma.admissionRequests.findUnique({
      where: { ADMISSION_REQUEST_ID: id },
    });
    if (!existing) throw new NotFoundException('Admission request not found');

    if (dto.wardId != null) {
      const ward = await this.prisma.wards.findUnique({
        where: { WARD_ID: dto.wardId },
      });
      if (!ward) throw new NotFoundException('Ward not found');
    }

    const actorLabel = actorLabelOf(actor);
    const now = new Date();
    const data: Prisma.AdmissionRequestsUpdateInput = {
      UPDATED_BY_ID: actor?.id ?? null,
      UPDATED_BY: actorLabel,
      UPDATED_DATE: now,
    };

    if (dto.wardId !== undefined) {
      data.ward =
        dto.wardId === null
          ? { disconnect: true }
          : { connect: { WARD_ID: dto.wardId } };
    }
    if (dto.wardPreference !== undefined)
      data.WARD_PREFERENCE = dto.wardPreference.trim() || null;
    if (dto.priority !== undefined) data.PRIORITY = dto.priority;
    if (dto.priorityReason !== undefined)
      data.PRIORITY_REASON = dto.priorityReason.trim() || null;
    if (dto.admissionType !== undefined) data.ADMISSION_TYPE = dto.admissionType;
    if (dto.estimatedLos !== undefined)
      data.ESTIMATED_LOS = dto.estimatedLos.trim() || null;
    if (dto.provisionalDiagnosis !== undefined)
      data.PROVISIONAL_DIAGNOSIS = dto.provisionalDiagnosis.trim() || null;
    if (dto.secondaryDiagnosis !== undefined)
      data.SECONDARY_DIAGNOSIS = dto.secondaryDiagnosis.trim() || null;
    if (dto.clinicalIndication !== undefined)
      data.CLINICAL_INDICATION = dto.clinicalIndication.trim() || null;
    if (dto.mentalHealthRisk !== undefined)
      data.MENTAL_HEALTH_RISK = dto.mentalHealthRisk.trim() || null;
    if (dto.physicalHealthRisk !== undefined)
      data.PHYSICAL_HEALTH_RISK = dto.physicalHealthRisk.trim() || null;
    if (dto.treatmentPlan !== undefined)
      data.TREATMENT_PLAN = dto.treatmentPlan.trim() || null;
    if (dto.requiredMonitoring !== undefined)
      data.REQUIRED_MONITORING = dto.requiredMonitoring.trim() || null;
    if (dto.nursingObservation !== undefined)
      data.NURSING_OBSERVATION = dto.nursingObservation;
    if (dto.isolationRequired !== undefined)
      data.ISOLATION_REQUIRED = dto.isolationRequired;
    if (dto.fallRisk !== undefined) data.FALL_RISK = dto.fallRisk;
    if (dto.suicideRisk !== undefined) data.SUICIDE_RISK = dto.suicideRisk;
    if (dto.violenceRisk !== undefined) data.VIOLENCE_RISK = dto.violenceRisk;
    if (dto.withdrawalRisk !== undefined)
      data.WITHDRAWAL_RISK = dto.withdrawalRisk;
    if (dto.specialBed !== undefined)
      data.SPECIAL_BED = dto.specialBed.trim() || null;
    if (dto.consentStatus !== undefined) data.CONSENT_STATUS = dto.consentStatus;
    if (dto.nokInformed !== undefined) data.NOK_INFORMED = dto.nokInformed;
    if (dto.clinicDepartment !== undefined)
      data.CLINIC_DEPARTMENT = dto.clinicDepartment.trim() || null;
    if (dto.doctorNote !== undefined)
      data.DOCTOR_NOTE = dto.doctorNote.trim() || null;
    if (dto.status !== undefined) data.STATUS = dto.status;
    if (dto.rejectionReason !== undefined)
      data.REJECTION_REASON = dto.rejectionReason.trim() || null;

    const row = await this.prisma.admissionRequests.update({
      where: { ADMISSION_REQUEST_ID: id },
      data,
      include: this.include(),
    });

    await this.audit.log({
      type: 'admission-request:update',
      entity: 'admission-request',
      entityId: row.ADMISSION_REQUEST_ID,
      personId: row.PERSON_ID,
      userId: actor?.id,
      createdBy: actorLabel,
      item: `Admission request ${row.REQUEST_NO} updated`,
      oldValue: { status: existing.STATUS },
      newValue: { status: row.STATUS, ...(dto as object) },
    });

    return this.toResponse(row);
  }
}
