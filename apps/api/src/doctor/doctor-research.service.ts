import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../auth/types/auth-user.type';
import {
  CreateAuditProjectDto,
  CreateRegistryEntryDto,
  CreateTrialDto,
  PatchAuditProjectDto,
  PatchTrialDto,
} from './dto/doctor-research.dto';

function actorLabel(user: AuthUser): string {
  return [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email;
}

@Injectable()
export class DoctorResearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async summary() {
    const [
      diagnosisCount,
      admissionsCount,
      deaths,
      rxCount,
      registryCount,
      trialsCount,
      auditProjectsCount,
      psychDiagnoses,
      discharged,
    ] = await Promise.all([
      this.prisma.patientDiagnoses.count({
        where: { STATUS: { not: 'Resolved' } },
      }),
      this.prisma.admissions.count(),
      this.prisma.persons.count({
        where: {
          OR: [{ IS_DEATH: 'Y' }, { IS_DEATH: 'Yes' }, { DEATH_DATE: { not: null } }],
        },
      }),
      this.prisma.prescriptions.count({
        where: { STATUS: { not: 'Cancelled' } },
      }),
      this.prisma.researchRegistryEntries.count({
        where: { NOT: { DELETED_FLAG: 'Y' } },
      }),
      this.prisma.researchTrials.count({
        where: { NOT: { DELETED_FLAG: 'Y' } },
      }),
      this.prisma.clinicalAuditProjects.count({
        where: { NOT: { DELETED_FLAG: 'Y' } },
      }),
      this.prisma.patientDiagnoses.count({
        where: { IS_PSYCHIATRIC: true },
      }),
      this.prisma.admissions.findMany({
        where: { STATUS: 'DISCHARGED', DISCHARGED_AT: { not: null } },
        select: { ADMITTED_AT: true, DISCHARGED_AT: true, PERSON_ID: true },
        take: 5000,
      }),
    ]);

    let avgLosDays = 0;
    if (discharged.length > 0) {
      const totalMs = discharged.reduce((sum, a) => {
        if (!a.DISCHARGED_AT) return sum;
        return sum + (a.DISCHARGED_AT.getTime() - a.ADMITTED_AT.getTime());
      }, 0);
      avgLosDays = totalMs / discharged.length / (1000 * 60 * 60 * 24);
    }

    // Simple readmission heuristic: same person with 2+ discharged admissions
    const byPerson = new Map<number, number>();
    for (const a of discharged) {
      byPerson.set(a.PERSON_ID, (byPerson.get(a.PERSON_ID) ?? 0) + 1);
    }
    let readmissions = 0;
    for (const n of byPerson.values()) {
      if (n > 1) readmissions += n - 1;
    }

    const mortalityPct =
      admissionsCount > 0 ? ((deaths / admissionsCount) * 100).toFixed(1) : '0.0';

    return {
      diagnosis: diagnosisCount,
      admissions: admissionsCount,
      mortality: `${mortalityPct}%`,
      los: `${avgLosDays.toFixed(1)}d`,
      readmissions,
      drugs: rxCount,
      registry: registryCount,
      trials: trialsCount,
      auditProjects: auditProjectsCount,
      outcomes: discharged.length,
      psychiatric: psychDiagnoses,
      exported: 0,
    };
  }

  async diagnoses() {
    const rows = await this.prisma.patientDiagnoses.groupBy({
      by: ['CODE', 'NAME'],
      _count: { PATIENT_DIAGNOSIS_ID: true },
      orderBy: { _count: { PATIENT_DIAGNOSIS_ID: 'desc' } },
      take: 50,
    });
    return {
      items: rows.map((r) => ({
        diagnosis: r.NAME,
        code: r.CODE,
        patients: r._count.PATIENT_DIAGNOSIS_ID,
        newCases: 0,
        admissions: 0,
        readmissions: 0,
        los: '0d',
        outcome: '—',
      })),
    };
  }

  async admissionsByWard() {
    const rows = await this.prisma.admissions.groupBy({
      by: ['WARD_ID'],
      _count: { ADMISSION_ID: true },
    });
    const wardIds = rows.map((r) => r.WARD_ID).filter((id): id is number => id != null);
    const wards = wardIds.length
      ? await this.prisma.wards.findMany({ where: { WARD_ID: { in: wardIds } } })
      : [];
    const byId = new Map(wards.map((w) => [w.WARD_ID, w]));

    const discharged = await this.prisma.admissions.groupBy({
      by: ['WARD_ID'],
      where: { STATUS: 'DISCHARGED' },
      _count: { ADMISSION_ID: true },
    });
    const dischargedMap = new Map(
      discharged.map((d) => [d.WARD_ID, d._count.ADMISSION_ID]),
    );

    return {
      items: rows.map((r) => {
        const ward = r.WARD_ID != null ? byId.get(r.WARD_ID) : null;
        return {
          ward: ward?.NAME ?? (r.WARD_ID != null ? `Ward #${r.WARD_ID}` : 'Unassigned'),
          admissions: r._count.ADMISSION_ID,
          discharges: dischargedMap.get(r.WARD_ID) ?? 0,
          transfers: 0,
          dama: 0,
          deaths: 0,
          los: '0d',
          occupancy: 0,
        };
      }),
    };
  }

  async drugUtilization() {
    const items = await this.prisma.prescriptionItems.groupBy({
      by: ['DRUG_NAME'],
      _count: { ITEM_ID: true },
      orderBy: { _count: { ITEM_ID: 'desc' } },
      take: 50,
    });

    // Approximate unique patients per drug via raw query-ish approach: count distinct prescriptions
    const result = [];
    for (const row of items) {
      const prescriptions = await this.prisma.prescriptionItems.findMany({
        where: { DRUG_NAME: row.DRUG_NAME },
        select: { PRESCRIPTION_ID: true },
        distinct: ['PRESCRIPTION_ID'],
        take: 5000,
      });
      const rxIds = prescriptions.map((p) => p.PRESCRIPTION_ID);
      const persons = rxIds.length
        ? await this.prisma.prescriptions.findMany({
            where: { PRESCRIPTION_ID: { in: rxIds } },
            select: { PERSON_ID: true },
            distinct: ['PERSON_ID'],
          })
        : [];
      result.push({
        drug: row.DRUG_NAME,
        rx: row._count.ITEM_ID,
        patients: persons.length,
        dept: '—',
        cost: '—',
        stock: '—',
      });
    }

    return { items: result };
  }

  async listRegistry() {
    const rows = await this.prisma.researchRegistryEntries.findMany({
      where: { NOT: { DELETED_FLAG: 'Y' } },
      orderBy: { CREATED_DATE: 'desc' },
      take: 200,
    });
    return {
      items: rows.map((r) => ({
        id: r.ENTRY_ID,
        personId: r.PERSON_ID,
        patient: r.PATIENT_LABEL,
        diagnosis: r.DIAGNOSIS,
        eligibility: r.ELIGIBILITY,
        consent: r.CONSENT,
        enrolledBy: r.ENROLLED_BY ?? '—',
        studyGroup: r.STUDY_GROUP,
        status: r.STATUS,
        clinic: r.CLINIC,
      })),
    };
  }

  async createRegistry(dto: CreateRegistryEntryDto, user: AuthUser) {
    const label = actorLabel(user);
    const now = new Date();
    const row = await this.prisma.researchRegistryEntries.create({
      data: {
        PERSON_ID: dto.personId ?? null,
        PATIENT_LABEL: dto.patientLabel.trim(),
        DIAGNOSIS: dto.diagnosis.trim(),
        ELIGIBILITY: dto.eligibility?.trim() || 'Eligible',
        CONSENT: dto.consent?.trim() || 'Pending',
        ENROLLED_BY: dto.enrolledBy?.trim() || label,
        STUDY_GROUP: dto.studyGroup.trim(),
        STATUS: dto.status?.trim() || 'Active',
        CLINIC: dto.clinic?.trim() || 'OPC',
        CREATED_BY_ID: user.id,
        CREATED_BY: label,
        CREATED_DATE: now,
      },
    });
    await this.audit.log({
      type: 'research:registry-create',
      entity: 'ResearchRegistryEntry',
      entityId: row.ENTRY_ID,
      personId: dto.personId ?? null,
      userId: user.id,
      createdBy: label,
      newValue: { patient: row.PATIENT_LABEL, studyGroup: row.STUDY_GROUP },
    });
    return {
      id: row.ENTRY_ID,
      personId: row.PERSON_ID,
      patient: row.PATIENT_LABEL,
      diagnosis: row.DIAGNOSIS,
      eligibility: row.ELIGIBILITY,
      consent: row.CONSENT,
      enrolledBy: row.ENROLLED_BY ?? '—',
      studyGroup: row.STUDY_GROUP,
      status: row.STATUS,
      clinic: row.CLINIC,
    };
  }

  async listTrials() {
    const rows = await this.prisma.researchTrials.findMany({
      where: { NOT: { DELETED_FLAG: 'Y' } },
      orderBy: { CREATED_DATE: 'desc' },
      take: 200,
    });
    return {
      items: rows.map((r) => ({
        id: r.TRIAL_ID,
        name: r.NAME,
        pi: r.PI,
        eligible: r.ELIGIBLE_COUNT,
        enrolled: r.ENROLLED_COUNT,
        startDate: r.START_DATE?.toISOString().slice(0, 10) ?? null,
        status: r.STATUS,
      })),
    };
  }

  async createTrial(dto: CreateTrialDto, user: AuthUser) {
    const label = actorLabel(user);
    const now = new Date();
    const row = await this.prisma.researchTrials.create({
      data: {
        NAME: dto.name.trim(),
        PI: dto.pi.trim(),
        ELIGIBLE_COUNT: dto.eligibleCount ?? 0,
        ENROLLED_COUNT: dto.enrolledCount ?? 0,
        START_DATE: dto.startDate ? new Date(dto.startDate) : null,
        STATUS: dto.status?.trim() || 'Recruiting',
        CREATED_BY_ID: user.id,
        CREATED_BY: label,
        CREATED_DATE: now,
      },
    });
    await this.audit.log({
      type: 'research:trial-create',
      entity: 'ResearchTrial',
      entityId: row.TRIAL_ID,
      userId: user.id,
      createdBy: label,
      newValue: { name: row.NAME },
    });
    return {
      id: row.TRIAL_ID,
      name: row.NAME,
      pi: row.PI,
      eligible: row.ELIGIBLE_COUNT,
      enrolled: row.ENROLLED_COUNT,
      startDate: row.START_DATE?.toISOString().slice(0, 10) ?? null,
      status: row.STATUS,
    };
  }

  async patchTrial(id: number, dto: PatchTrialDto, user: AuthUser) {
    const existing = await this.prisma.researchTrials.findFirst({
      where: { TRIAL_ID: id, NOT: { DELETED_FLAG: 'Y' } },
    });
    if (!existing) throw new NotFoundException('Trial not found');
    const label = actorLabel(user);
    const row = await this.prisma.researchTrials.update({
      where: { TRIAL_ID: id },
      data: {
        ...(dto.name != null ? { NAME: dto.name.trim() } : {}),
        ...(dto.pi != null ? { PI: dto.pi.trim() } : {}),
        ...(dto.eligibleCount != null ? { ELIGIBLE_COUNT: dto.eligibleCount } : {}),
        ...(dto.enrolledCount != null ? { ENROLLED_COUNT: dto.enrolledCount } : {}),
        ...(dto.startDate != null ? { START_DATE: new Date(dto.startDate) } : {}),
        ...(dto.status != null ? { STATUS: dto.status.trim() } : {}),
        UPDATED_BY_ID: user.id,
        UPDATED_BY: label,
        UPDATED_DATE: new Date(),
      },
    });
    await this.audit.log({
      type: 'research:trial-update',
      entity: 'ResearchTrial',
      entityId: id,
      userId: user.id,
      createdBy: label,
      newValue: dto,
    });
    return {
      id: row.TRIAL_ID,
      name: row.NAME,
      pi: row.PI,
      eligible: row.ELIGIBLE_COUNT,
      enrolled: row.ENROLLED_COUNT,
      startDate: row.START_DATE?.toISOString().slice(0, 10) ?? null,
      status: row.STATUS,
    };
  }

  async listAuditProjects() {
    const rows = await this.prisma.clinicalAuditProjects.findMany({
      where: { NOT: { DELETED_FLAG: 'Y' } },
      orderBy: { CREATED_DATE: 'desc' },
      take: 200,
    });
    return {
      items: rows.map((r) => ({
        id: r.PROJECT_ID,
        title: r.TITLE,
        department: r.DEPARTMENT,
        lead: r.LEAD,
        indicator: r.INDICATOR,
        standard: r.STANDARD,
        performance: r.PERFORMANCE ?? '—',
        status: r.STATUS,
      })),
    };
  }

  async createAuditProject(dto: CreateAuditProjectDto, user: AuthUser) {
    const label = actorLabel(user);
    const now = new Date();
    const row = await this.prisma.clinicalAuditProjects.create({
      data: {
        TITLE: dto.title.trim(),
        DEPARTMENT: dto.department.trim(),
        LEAD: dto.lead.trim(),
        INDICATOR: dto.indicator.trim(),
        STANDARD: dto.standard.trim(),
        PERFORMANCE: dto.performance?.trim() || null,
        STATUS: dto.status?.trim() || 'Planning',
        CREATED_BY_ID: user.id,
        CREATED_BY: label,
        CREATED_DATE: now,
      },
    });
    await this.audit.log({
      type: 'research:audit-project-create',
      entity: 'ClinicalAuditProject',
      entityId: row.PROJECT_ID,
      userId: user.id,
      createdBy: label,
      newValue: { title: row.TITLE },
    });
    return {
      id: row.PROJECT_ID,
      title: row.TITLE,
      department: row.DEPARTMENT,
      lead: row.LEAD,
      indicator: row.INDICATOR,
      standard: row.STANDARD,
      performance: row.PERFORMANCE ?? '—',
      status: row.STATUS,
    };
  }

  async patchAuditProject(id: number, dto: PatchAuditProjectDto, user: AuthUser) {
    const existing = await this.prisma.clinicalAuditProjects.findFirst({
      where: { PROJECT_ID: id, NOT: { DELETED_FLAG: 'Y' } },
    });
    if (!existing) throw new NotFoundException('Audit project not found');
    const label = actorLabel(user);
    const row = await this.prisma.clinicalAuditProjects.update({
      where: { PROJECT_ID: id },
      data: {
        ...(dto.title != null ? { TITLE: dto.title.trim() } : {}),
        ...(dto.department != null ? { DEPARTMENT: dto.department.trim() } : {}),
        ...(dto.lead != null ? { LEAD: dto.lead.trim() } : {}),
        ...(dto.indicator != null ? { INDICATOR: dto.indicator.trim() } : {}),
        ...(dto.standard != null ? { STANDARD: dto.standard.trim() } : {}),
        ...(dto.performance != null ? { PERFORMANCE: dto.performance.trim() } : {}),
        ...(dto.status != null ? { STATUS: dto.status.trim() } : {}),
        UPDATED_BY_ID: user.id,
        UPDATED_BY: label,
        UPDATED_DATE: new Date(),
      },
    });
    await this.audit.log({
      type: 'research:audit-project-update',
      entity: 'ClinicalAuditProject',
      entityId: id,
      userId: user.id,
      createdBy: label,
      newValue: dto,
    });
    return {
      id: row.PROJECT_ID,
      title: row.TITLE,
      department: row.DEPARTMENT,
      lead: row.LEAD,
      indicator: row.INDICATOR,
      standard: row.STANDARD,
      performance: row.PERFORMANCE ?? '—',
      status: row.STATUS,
    };
  }
}
