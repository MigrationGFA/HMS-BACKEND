import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../auth/types/auth-user.type';
import type {
  CreateCarePlanDto,
  CreateFormInstanceDto,
  CreateFormTemplateDto,
  CreateIncidentDto,
  CreateNursingNoteDto,
  CreateNursingVitalDto,
  CreateObservationDto,
  ReviewIncidentDto,
  UpdateCarePlanDto,
} from './dto/nursing-care.dto';

function actorLabelOf(actor?: AuthUser): string {
  return (
    actor?.email ||
    [actor?.firstName, actor?.lastName].filter(Boolean).join(' ') ||
    'SYSTEM'
  );
}

function calcBmi(weightKg?: number, heightCm?: number): number | null {
  if (weightKg == null || heightCm == null || heightCm <= 0) return null;
  const m = heightCm / 100;
  return Math.round((weightKg / (m * m)) * 100) / 100;
}

function dec(n?: number | null): Prisma.Decimal | null {
  if (n == null || Number.isNaN(n)) return null;
  return new Prisma.Decimal(n);
}

/** Same thresholds as fnph-aro `nursing-actions` flagVitals. */
function flagVitals(input: {
  bloodPressure?: string;
  temperatureC?: number;
  pulseBpm?: number;
  respiratoryRate?: number;
  spo2Pct?: number;
  painScore?: number;
}): string[] {
  const flags: string[] = [];
  if (input.bloodPressure?.trim()) {
    const m = input.bloodPressure.trim().match(/^(\d+)\s*\/\s*(\d+)$/);
    if (m) {
      const sys = Number(m[1]);
      const dia = Number(m[2]);
      if (sys >= 140 || sys <= 90) flags.push(`BP systolic ${sys}`);
      if (dia >= 90 || dia <= 50) flags.push(`BP diastolic ${dia}`);
    }
  }
  if (input.spo2Pct != null && input.spo2Pct < 94) {
    flags.push(`SpO₂ ${input.spo2Pct}%`);
  }
  if (
    input.temperatureC != null &&
    (input.temperatureC >= 38 || input.temperatureC <= 35)
  ) {
    flags.push(`Temp ${input.temperatureC}°C`);
  }
  if (
    input.pulseBpm != null &&
    (input.pulseBpm >= 120 || input.pulseBpm <= 50)
  ) {
    flags.push(`Pulse ${input.pulseBpm}`);
  }
  if (
    input.respiratoryRate != null &&
    (input.respiratoryRate >= 24 || input.respiratoryRate <= 8)
  ) {
    flags.push(`Resp ${input.respiratoryRate}`);
  }
  if (input.painScore != null && input.painScore >= 7) {
    flags.push(`Pain ${input.painScore}/10`);
  }
  return flags;
}

@Injectable()
export class NursingCareService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async listNotes(params?: {
    personId?: number;
    admissionId?: number;
  }): Promise<{ items: ReturnType<NursingCareService['mapNote']>[] }> {
    const where: Prisma.NursingNotesWhereInput = {
      ...(params?.personId ? { PERSON_ID: params.personId } : {}),
      ...(params?.admissionId ? { ADMISSION_ID: params.admissionId } : {}),
    };
    const rows = await this.prisma.nursingNotes.findMany({
      where,
      orderBy: { CREATED_DATE: 'desc' },
      take: 200,
    });
    return { items: rows.map((r) => this.mapNote(r)) };
  }

  async createNote(
    dto: CreateNursingNoteDto,
    actor?: AuthUser,
  ): Promise<ReturnType<NursingCareService['mapNote']>> {
    await this.assertPerson(dto.personId);
    if (dto.admissionId != null) await this.assertAdmission(dto.admissionId);

    const actorLabel = actorLabelOf(actor);
    const row = await this.prisma.nursingNotes.create({
      data: {
        PERSON_ID: dto.personId,
        ADMISSION_ID: dto.admissionId ?? null,
        NOTE_TYPE: dto.noteType,
        FORMAT: dto.format || 'Narrative',
        BODY: dto.body.trim(),
        AUTHOR_BY: actorLabel,
        CREATED_BY_ID: actor?.id ?? null,
        CREATED_DATE: new Date(),
      },
    });

    await this.audit.log({
      type: 'nursing-note:create',
      entity: 'nursing-note',
      entityId: row.NOTE_ID,
      personId: dto.personId,
      userId: actor?.id,
      createdBy: actorLabel,
      item: `Nursing note (${dto.noteType}) created`,
      newValue: { noteId: row.NOTE_ID, noteType: dto.noteType },
    });

    return this.mapNote(row);
  }

  async listVitals(params?: {
    personId?: number;
    admissionId?: number;
    abnormal?: boolean;
  }): Promise<{ items: ReturnType<NursingCareService['mapVital']>[] }> {
    const where: Prisma.NursingVitalsWhereInput = {
      ...(params?.personId ? { PERSON_ID: params.personId } : {}),
      ...(params?.admissionId ? { ADMISSION_ID: params.admissionId } : {}),
      ...(params?.abnormal != null ? { ABNORMAL: params.abnormal } : {}),
    };
    const rows = await this.prisma.nursingVitals.findMany({
      where,
      orderBy: { RECORDED_AT: 'desc' },
      take: 200,
    });
    return { items: rows.map((r) => this.mapVital(r)) };
  }

  async createVital(
    dto: CreateNursingVitalDto,
    actor?: AuthUser,
  ): Promise<ReturnType<NursingCareService['mapVital']>> {
    await this.assertPerson(dto.personId);
    if (dto.admissionId != null) await this.assertAdmission(dto.admissionId);

    const flags = flagVitals(dto);
    const bmi = calcBmi(dto.weightKg, dto.heightCm);
    const actorLabel = actorLabelOf(actor);

    const row = await this.prisma.nursingVitals.create({
      data: {
        PERSON_ID: dto.personId,
        ADMISSION_ID: dto.admissionId ?? null,
        WEIGHT_KG: dec(dto.weightKg),
        HEIGHT_CM: dec(dto.heightCm),
        BMI: dec(bmi),
        BLOOD_PRESSURE: dto.bloodPressure?.trim() || null,
        TEMPERATURE_C: dec(dto.temperatureC),
        PULSE_BPM: dto.pulseBpm ?? null,
        RESPIRATORY_RATE: dto.respiratoryRate ?? null,
        SPO2_PCT: dec(dto.spo2Pct),
        BLOOD_SUGAR: dec(dto.bloodSugar),
        PAIN_SCORE: dto.painScore ?? null,
        ABNORMAL: flags.length > 0,
        FLAGS: flags.length > 0 ? flags.join(', ') : null,
        NOTES: dto.notes?.trim() || null,
        RECORDED_BY: actorLabel,
        RECORDED_AT: new Date(),
        CREATED_BY_ID: actor?.id ?? null,
      },
    });

    await this.audit.log({
      type: 'nursing-vital:create',
      entity: 'nursing-vital',
      entityId: row.VITAL_ID,
      personId: dto.personId,
      userId: actor?.id,
      createdBy: actorLabel,
      item:
        flags.length > 0
          ? `Abnormal vitals recorded (${flags.join(', ')})`
          : 'Nursing vitals recorded',
      newValue: { vitalId: row.VITAL_ID, abnormal: flags.length > 0, flags },
    });

    return this.mapVital(row);
  }

  async listCarePlans(params?: {
    personId?: number;
    admissionId?: number;
    status?: string;
  }): Promise<{ items: ReturnType<NursingCareService['mapCarePlan']>[] }> {
    const where: Prisma.NursingCarePlansWhereInput = {
      ...(params?.personId ? { PERSON_ID: params.personId } : {}),
      ...(params?.admissionId ? { ADMISSION_ID: params.admissionId } : {}),
      ...(params?.status ? { STATUS: params.status } : {}),
    };
    const rows = await this.prisma.nursingCarePlans.findMany({
      where,
      orderBy: { CREATED_DATE: 'desc' },
      take: 200,
    });
    return { items: rows.map((r) => this.mapCarePlan(r)) };
  }

  async createCarePlan(
    dto: CreateCarePlanDto,
    actor?: AuthUser,
  ): Promise<ReturnType<NursingCareService['mapCarePlan']>> {
    await this.assertPerson(dto.personId);
    if (dto.admissionId != null) await this.assertAdmission(dto.admissionId);

    const actorLabel = actorLabelOf(actor);
    const row = await this.prisma.nursingCarePlans.create({
      data: {
        PERSON_ID: dto.personId,
        ADMISSION_ID: dto.admissionId ?? null,
        DIAGNOSIS: dto.diagnosis?.trim() || null,
        PROBLEM: dto.problem?.trim() || null,
        GOAL: dto.goal?.trim() || null,
        INTERVENTION: dto.intervention?.trim() || null,
        ACTION_TAKEN: dto.actionTaken?.trim() || null,
        EVALUATION: dto.evaluation?.trim() || null,
        REVIEW_DATE: dto.reviewDate ? new Date(dto.reviewDate) : null,
        STATUS: dto.status || 'active',
        CREATED_BY: actorLabel,
        CREATED_DATE: new Date(),
      },
    });

    await this.audit.log({
      type: 'nursing-care-plan:create',
      entity: 'nursing-care-plan',
      entityId: row.CARE_PLAN_ID,
      personId: dto.personId,
      userId: actor?.id,
      createdBy: actorLabel,
      item: 'Nursing care plan created',
      newValue: { carePlanId: row.CARE_PLAN_ID, status: row.STATUS },
    });

    return this.mapCarePlan(row);
  }

  async updateCarePlan(
    id: number,
    dto: UpdateCarePlanDto,
    actor?: AuthUser,
  ): Promise<ReturnType<NursingCareService['mapCarePlan']>> {
    const existing = await this.prisma.nursingCarePlans.findUnique({
      where: { CARE_PLAN_ID: id },
    });
    if (!existing) throw new NotFoundException('Care plan not found');

    const actorLabel = actorLabelOf(actor);
    const row = await this.prisma.nursingCarePlans.update({
      where: { CARE_PLAN_ID: id },
      data: {
        ...(dto.diagnosis !== undefined
          ? { DIAGNOSIS: dto.diagnosis.trim() || null }
          : {}),
        ...(dto.problem !== undefined
          ? { PROBLEM: dto.problem.trim() || null }
          : {}),
        ...(dto.goal !== undefined ? { GOAL: dto.goal.trim() || null } : {}),
        ...(dto.intervention !== undefined
          ? { INTERVENTION: dto.intervention.trim() || null }
          : {}),
        ...(dto.actionTaken !== undefined
          ? { ACTION_TAKEN: dto.actionTaken.trim() || null }
          : {}),
        ...(dto.evaluation !== undefined
          ? { EVALUATION: dto.evaluation.trim() || null }
          : {}),
        ...(dto.reviewDate !== undefined
          ? { REVIEW_DATE: dto.reviewDate ? new Date(dto.reviewDate) : null }
          : {}),
        ...(dto.status !== undefined ? { STATUS: dto.status } : {}),
        UPDATED_DATE: new Date(),
      },
    });

    await this.audit.log({
      type: 'nursing-care-plan:update',
      entity: 'nursing-care-plan',
      entityId: id,
      personId: existing.PERSON_ID,
      userId: actor?.id,
      createdBy: actorLabel,
      item: `Nursing care plan ${id} updated`,
      newValue: dto,
    });

    return this.mapCarePlan(row);
  }

  async listObservations(params?: {
    personId?: number;
    admissionId?: number;
  }): Promise<{ items: ReturnType<NursingCareService['mapObservation']>[] }> {
    const where: Prisma.NursingObservationsWhereInput = {
      ...(params?.personId ? { PERSON_ID: params.personId } : {}),
      ...(params?.admissionId ? { ADMISSION_ID: params.admissionId } : {}),
    };
    const rows = await this.prisma.nursingObservations.findMany({
      where,
      orderBy: { RECORDED_AT: 'desc' },
      take: 200,
    });
    return { items: rows.map((r) => this.mapObservation(r)) };
  }

  async createObservation(
    dto: CreateObservationDto,
    actor?: AuthUser,
  ): Promise<ReturnType<NursingCareService['mapObservation']>> {
    await this.assertPerson(dto.personId);
    if (dto.admissionId != null) await this.assertAdmission(dto.admissionId);

    const actorLabel = actorLabelOf(actor);
    const row = await this.prisma.nursingObservations.create({
      data: {
        PERSON_ID: dto.personId,
        ADMISSION_ID: dto.admissionId ?? null,
        CHART: dto.chart,
        INTERVAL: dto.interval?.trim() || null,
        FIELDS_JSON: JSON.stringify(dto.fields ?? {}),
        RECORDED_BY: actorLabel,
        RECORDED_AT: new Date(),
        CREATED_BY_ID: actor?.id ?? null,
      },
    });

    await this.audit.log({
      type: 'nursing-observation:create',
      entity: 'nursing-observation',
      entityId: row.OBSERVATION_ID,
      personId: dto.personId,
      userId: actor?.id,
      createdBy: actorLabel,
      item: `Observation chart (${dto.chart}) recorded`,
      newValue: { observationId: row.OBSERVATION_ID, chart: dto.chart },
    });

    return this.mapObservation(row);
  }

  async listIncidents(params?: {
    status?: string;
    personId?: number;
  }): Promise<{ items: ReturnType<NursingCareService['mapIncident']>[] }> {
    const where: Prisma.NursingIncidentsWhereInput = {
      ...(params?.status ? { STATUS: params.status } : {}),
      ...(params?.personId ? { PERSON_ID: params.personId } : {}),
    };
    const rows = await this.prisma.nursingIncidents.findMany({
      where,
      orderBy: { CREATED_DATE: 'desc' },
      take: 200,
    });
    return { items: rows.map((r) => this.mapIncident(r)) };
  }

  async createIncident(
    dto: CreateIncidentDto,
    actor?: AuthUser,
  ): Promise<ReturnType<NursingCareService['mapIncident']>> {
    if (dto.personId != null) await this.assertPerson(dto.personId);
    if (dto.admissionId != null) await this.assertAdmission(dto.admissionId);

    const actorLabel = actorLabelOf(actor);
    const row = await this.prisma.nursingIncidents.create({
      data: {
        PERSON_ID: dto.personId ?? null,
        ADMISSION_ID: dto.admissionId ?? null,
        PATIENT_NAME: dto.patientName?.trim() || null,
        INCIDENT_TYPE: dto.incidentType,
        DESCRIPTION: dto.description.trim(),
        ACTION_TAKEN: dto.actionTaken?.trim() || null,
        SEVERITY: dto.severity || 'Moderate',
        STATUS: 'REPORTED',
        REPORTED_BY: actorLabel,
        CREATED_DATE: new Date(),
        CREATED_BY_ID: actor?.id ?? null,
      },
    });

    await this.audit.log({
      type: 'nursing-incident:create',
      entity: 'nursing-incident',
      entityId: row.INCIDENT_ID,
      personId: dto.personId,
      userId: actor?.id,
      createdBy: actorLabel,
      item: `Incident reported (${dto.incidentType}, ${row.SEVERITY})`,
      newValue: {
        incidentId: row.INCIDENT_ID,
        incidentType: dto.incidentType,
        severity: row.SEVERITY,
      },
    });

    return this.mapIncident(row);
  }

  async reviewIncident(
    id: number,
    dto: ReviewIncidentDto,
    actor?: AuthUser,
  ): Promise<ReturnType<NursingCareService['mapIncident']>> {
    const existing = await this.prisma.nursingIncidents.findUnique({
      where: { INCIDENT_ID: id },
    });
    if (!existing) throw new NotFoundException('Incident not found');

    const actorLabel = actorLabelOf(actor);
    const now = new Date();
    const row = await this.prisma.nursingIncidents.update({
      where: { INCIDENT_ID: id },
      data: {
        STATUS: 'REVIEWED',
        REVIEWED_BY: actorLabel,
        REVIEWED_AT: now,
        REVIEW_NOTE: dto.note?.trim() || null,
      },
    });

    await this.audit.log({
      type: 'nursing-incident:review',
      entity: 'nursing-incident',
      entityId: id,
      personId: existing.PERSON_ID ?? undefined,
      userId: actor?.id,
      createdBy: actorLabel,
      item: `Incident ${id} reviewed`,
      newValue: { status: 'REVIEWED', note: dto.note ?? null },
    });

    return this.mapIncident(row);
  }

  async listFormTemplates(): Promise<{
    items: ReturnType<NursingCareService['mapTemplate']>[];
  }> {
    const rows = await this.prisma.nursingFormTemplates.findMany({
      where: { ACTIVE: true },
      orderBy: { TITLE: 'asc' },
    });
    return { items: rows.map((r) => this.mapTemplate(r)) };
  }

  async createFormTemplate(
    dto: CreateFormTemplateDto,
    actor?: AuthUser,
  ): Promise<ReturnType<NursingCareService['mapTemplate']>> {
    const actorLabel = actorLabelOf(actor);
    const row = await this.prisma.nursingFormTemplates.create({
      data: {
        CODE: dto.code.trim(),
        TITLE: dto.title.trim(),
        SCHEMA_JSON: JSON.stringify(dto.schema ?? {}),
        ACTIVE: dto.active ?? true,
        CREATED_BY: actorLabel,
        CREATED_DATE: new Date(),
      },
    });

    await this.audit.log({
      type: 'nursing-form:template-create',
      entity: 'nursing-form-template',
      entityId: row.TEMPLATE_ID,
      userId: actor?.id,
      createdBy: actorLabel,
      item: `Form template ${row.CODE} created`,
      newValue: { templateId: row.TEMPLATE_ID, code: row.CODE },
    });

    return this.mapTemplate(row);
  }

  async listFormInstances(params?: {
    personId?: number;
  }): Promise<{ items: ReturnType<NursingCareService['mapInstance']>[] }> {
    const where: Prisma.NursingFormInstancesWhereInput = {
      ...(params?.personId ? { PERSON_ID: params.personId } : {}),
    };
    const rows = await this.prisma.nursingFormInstances.findMany({
      where,
      orderBy: { CREATED_DATE: 'desc' },
      take: 200,
      include: {
        template: { select: { TEMPLATE_ID: true, CODE: true, TITLE: true } },
      },
    });
    return { items: rows.map((r) => this.mapInstance(r)) };
  }

  async createFormInstance(
    dto: CreateFormInstanceDto,
    actor?: AuthUser,
  ): Promise<ReturnType<NursingCareService['mapInstance']>> {
    await this.assertPerson(dto.personId);
    if (dto.admissionId != null) await this.assertAdmission(dto.admissionId);

    const template = await this.prisma.nursingFormTemplates.findUnique({
      where: { TEMPLATE_ID: dto.templateId },
    });
    if (!template || !template.ACTIVE) {
      throw new NotFoundException('Form template not found');
    }

    const actorLabel = actorLabelOf(actor);
    const row = await this.prisma.nursingFormInstances.create({
      data: {
        TEMPLATE_ID: dto.templateId,
        PERSON_ID: dto.personId,
        ADMISSION_ID: dto.admissionId ?? null,
        VALUES_JSON: JSON.stringify(dto.values ?? {}),
        SIGNED_BY: actorLabel,
        CREATED_DATE: new Date(),
      },
      include: {
        template: { select: { TEMPLATE_ID: true, CODE: true, TITLE: true } },
      },
    });

    await this.audit.log({
      type: 'nursing-form:instance-create',
      entity: 'nursing-form-instance',
      entityId: row.INSTANCE_ID,
      personId: dto.personId,
      userId: actor?.id,
      createdBy: actorLabel,
      item: `Form instance for template ${template.CODE} created`,
      newValue: { instanceId: row.INSTANCE_ID, templateId: dto.templateId },
    });

    return this.mapInstance(row);
  }

  async timeline(personId: number): Promise<{
    items: Array<{
      type: string;
      id: number;
      at: string;
      summary: string;
      data: unknown;
    }>;
  }> {
    await this.assertPerson(personId);

    const [notes, vitals, observations, incidents, carePlans] =
      await Promise.all([
        this.prisma.nursingNotes.findMany({
          where: { PERSON_ID: personId },
          orderBy: { CREATED_DATE: 'desc' },
          take: 50,
        }),
        this.prisma.nursingVitals.findMany({
          where: { PERSON_ID: personId },
          orderBy: { RECORDED_AT: 'desc' },
          take: 50,
        }),
        this.prisma.nursingObservations.findMany({
          where: { PERSON_ID: personId },
          orderBy: { RECORDED_AT: 'desc' },
          take: 50,
        }),
        this.prisma.nursingIncidents.findMany({
          where: { PERSON_ID: personId },
          orderBy: { CREATED_DATE: 'desc' },
          take: 50,
        }),
        this.prisma.nursingCarePlans.findMany({
          where: { PERSON_ID: personId },
          orderBy: { CREATED_DATE: 'desc' },
          take: 50,
        }),
      ]);

    const items = [
      ...notes.map((r) => ({
        type: 'note' as const,
        id: r.NOTE_ID,
        at: r.CREATED_DATE.toISOString(),
        summary: `${r.NOTE_TYPE} note`,
        data: this.mapNote(r),
      })),
      ...vitals.map((r) => ({
        type: 'vital' as const,
        id: r.VITAL_ID,
        at: r.RECORDED_AT.toISOString(),
        summary: r.ABNORMAL
          ? `Abnormal vitals (${r.FLAGS ?? ''})`
          : 'Vitals recorded',
        data: this.mapVital(r),
      })),
      ...observations.map((r) => ({
        type: 'observation' as const,
        id: r.OBSERVATION_ID,
        at: r.RECORDED_AT.toISOString(),
        summary: `${r.CHART} observation`,
        data: this.mapObservation(r),
      })),
      ...incidents.map((r) => ({
        type: 'incident' as const,
        id: r.INCIDENT_ID,
        at: r.CREATED_DATE.toISOString(),
        summary: `${r.INCIDENT_TYPE} (${r.SEVERITY})`,
        data: this.mapIncident(r),
      })),
      ...carePlans.map((r) => ({
        type: 'care-plan' as const,
        id: r.CARE_PLAN_ID,
        at: r.CREATED_DATE.toISOString(),
        summary: `Care plan (${r.STATUS})`,
        data: this.mapCarePlan(r),
      })),
    ].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));

    return { items };
  }

  async alerts(): Promise<{
    abnormalVitals48h: ReturnType<NursingCareService['mapVital']>[];
    openHighIncidents: ReturnType<NursingCareService['mapIncident']>[];
    dischargeOrderedCount: number;
  }> {
    const since = new Date(Date.now() - 48 * 60 * 60 * 1000);

    const [abnormalVitals, openIncidents, dischargeOrderedCount] =
      await Promise.all([
        this.prisma.nursingVitals.findMany({
          where: { ABNORMAL: true, RECORDED_AT: { gte: since } },
          orderBy: { RECORDED_AT: 'desc' },
          take: 100,
        }),
        this.prisma.nursingIncidents.findMany({
          where: {
            SEVERITY: { in: ['High', 'Critical'] },
            STATUS: { in: ['REPORTED', 'ESCALATED'] },
          },
          orderBy: { CREATED_DATE: 'desc' },
          take: 100,
        }),
        this.prisma.admissions.count({
          where: { STATUS: 'DISCHARGE_ORDERED' },
        }),
      ]);

    return {
      abnormalVitals48h: abnormalVitals.map((r) => this.mapVital(r)),
      openHighIncidents: openIncidents.map((r) => this.mapIncident(r)),
      dischargeOrderedCount,
    };
  }

  private async assertPerson(personId: number): Promise<void> {
    const person = await this.prisma.persons.findUnique({
      where: { PERSON_ID: personId },
    });
    if (!person || person.DISCONTINUE_FLAG === 'Y') {
      throw new NotFoundException('Person not found');
    }
  }

  private async assertAdmission(admissionId: number): Promise<void> {
    const admission = await this.prisma.admissions.findUnique({
      where: { ADMISSION_ID: admissionId },
    });
    if (!admission) throw new NotFoundException('Admission not found');
  }

  private mapNote(row: {
    NOTE_ID: number;
    ADMISSION_ID: number | null;
    PERSON_ID: number;
    NOTE_TYPE: string;
    FORMAT: string;
    BODY: string;
    AUTHOR_BY: string | null;
    CREATED_DATE: Date;
  }) {
    return {
      noteId: row.NOTE_ID,
      admissionId: row.ADMISSION_ID,
      personId: row.PERSON_ID,
      noteType: row.NOTE_TYPE,
      format: row.FORMAT,
      body: row.BODY,
      authorBy: row.AUTHOR_BY,
      createdAt: row.CREATED_DATE.toISOString(),
    };
  }

  private mapVital(row: {
    VITAL_ID: number;
    ADMISSION_ID: number | null;
    PERSON_ID: number;
    WEIGHT_KG: Prisma.Decimal | null;
    HEIGHT_CM: Prisma.Decimal | null;
    BMI: Prisma.Decimal | null;
    BLOOD_PRESSURE: string | null;
    TEMPERATURE_C: Prisma.Decimal | null;
    PULSE_BPM: number | null;
    RESPIRATORY_RATE: number | null;
    SPO2_PCT: Prisma.Decimal | null;
    BLOOD_SUGAR: Prisma.Decimal | null;
    PAIN_SCORE: number | null;
    ABNORMAL: boolean;
    FLAGS: string | null;
    NOTES: string | null;
    RECORDED_BY: string | null;
    RECORDED_AT: Date;
  }) {
    return {
      vitalId: row.VITAL_ID,
      admissionId: row.ADMISSION_ID,
      personId: row.PERSON_ID,
      weightKg: row.WEIGHT_KG?.toNumber() ?? null,
      heightCm: row.HEIGHT_CM?.toNumber() ?? null,
      bmi: row.BMI?.toNumber() ?? null,
      bloodPressure: row.BLOOD_PRESSURE,
      temperatureC: row.TEMPERATURE_C?.toNumber() ?? null,
      pulseBpm: row.PULSE_BPM,
      respiratoryRate: row.RESPIRATORY_RATE,
      spo2Pct: row.SPO2_PCT?.toNumber() ?? null,
      bloodSugar: row.BLOOD_SUGAR?.toNumber() ?? null,
      painScore: row.PAIN_SCORE,
      abnormal: row.ABNORMAL,
      flags: row.FLAGS,
      notes: row.NOTES,
      recordedBy: row.RECORDED_BY,
      recordedAt: row.RECORDED_AT.toISOString(),
    };
  }

  private mapCarePlan(row: {
    CARE_PLAN_ID: number;
    ADMISSION_ID: number | null;
    PERSON_ID: number;
    DIAGNOSIS: string | null;
    PROBLEM: string | null;
    GOAL: string | null;
    INTERVENTION: string | null;
    ACTION_TAKEN: string | null;
    EVALUATION: string | null;
    REVIEW_DATE: Date | null;
    STATUS: string;
    CREATED_BY: string | null;
    CREATED_DATE: Date;
    UPDATED_DATE: Date | null;
  }) {
    return {
      carePlanId: row.CARE_PLAN_ID,
      admissionId: row.ADMISSION_ID,
      personId: row.PERSON_ID,
      diagnosis: row.DIAGNOSIS,
      problem: row.PROBLEM,
      goal: row.GOAL,
      intervention: row.INTERVENTION,
      actionTaken: row.ACTION_TAKEN,
      evaluation: row.EVALUATION,
      reviewDate: row.REVIEW_DATE?.toISOString() ?? null,
      status: row.STATUS,
      createdBy: row.CREATED_BY,
      createdAt: row.CREATED_DATE.toISOString(),
      updatedAt: row.UPDATED_DATE?.toISOString() ?? null,
    };
  }

  private mapObservation(row: {
    OBSERVATION_ID: number;
    ADMISSION_ID: number | null;
    PERSON_ID: number;
    CHART: string;
    INTERVAL: string | null;
    FIELDS_JSON: string;
    RECORDED_BY: string | null;
    RECORDED_AT: Date;
  }) {
    let fields: Record<string, unknown> = {};
    try {
      fields = JSON.parse(row.FIELDS_JSON) as Record<string, unknown>;
    } catch {
      fields = {};
    }
    return {
      observationId: row.OBSERVATION_ID,
      admissionId: row.ADMISSION_ID,
      personId: row.PERSON_ID,
      chart: row.CHART,
      interval: row.INTERVAL,
      fields,
      recordedBy: row.RECORDED_BY,
      recordedAt: row.RECORDED_AT.toISOString(),
    };
  }

  private mapIncident(row: {
    INCIDENT_ID: number;
    ADMISSION_ID: number | null;
    PERSON_ID: number | null;
    PATIENT_NAME: string | null;
    INCIDENT_TYPE: string;
    DESCRIPTION: string;
    ACTION_TAKEN: string | null;
    SEVERITY: string;
    STATUS: string;
    REPORTED_BY: string | null;
    REVIEWED_BY: string | null;
    REVIEWED_AT: Date | null;
    REVIEW_NOTE: string | null;
    CREATED_DATE: Date;
  }) {
    return {
      incidentId: row.INCIDENT_ID,
      admissionId: row.ADMISSION_ID,
      personId: row.PERSON_ID,
      patientName: row.PATIENT_NAME,
      incidentType: row.INCIDENT_TYPE,
      description: row.DESCRIPTION,
      actionTaken: row.ACTION_TAKEN,
      severity: row.SEVERITY,
      status: row.STATUS,
      reportedBy: row.REPORTED_BY,
      reviewedBy: row.REVIEWED_BY,
      reviewedAt: row.REVIEWED_AT?.toISOString() ?? null,
      reviewNote: row.REVIEW_NOTE,
      createdAt: row.CREATED_DATE.toISOString(),
    };
  }

  private mapTemplate(row: {
    TEMPLATE_ID: number;
    CODE: string;
    TITLE: string;
    SCHEMA_JSON: string;
    ACTIVE: boolean;
    CREATED_BY: string | null;
    CREATED_DATE: Date;
  }) {
    let schema: Record<string, unknown> = {};
    try {
      schema = JSON.parse(row.SCHEMA_JSON) as Record<string, unknown>;
    } catch {
      schema = {};
    }
    return {
      templateId: row.TEMPLATE_ID,
      code: row.CODE,
      title: row.TITLE,
      schema,
      active: row.ACTIVE,
      createdBy: row.CREATED_BY,
      createdAt: row.CREATED_DATE.toISOString(),
    };
  }

  private mapInstance(row: {
    INSTANCE_ID: number;
    TEMPLATE_ID: number;
    ADMISSION_ID: number | null;
    PERSON_ID: number;
    VALUES_JSON: string;
    SIGNED_BY: string | null;
    CREATED_DATE: Date;
    template?: { TEMPLATE_ID: number; CODE: string; TITLE: string } | null;
  }) {
    let values: Record<string, unknown> = {};
    try {
      values = JSON.parse(row.VALUES_JSON) as Record<string, unknown>;
    } catch {
      values = {};
    }
    return {
      instanceId: row.INSTANCE_ID,
      templateId: row.TEMPLATE_ID,
      admissionId: row.ADMISSION_ID,
      personId: row.PERSON_ID,
      values,
      signedBy: row.SIGNED_BY,
      createdAt: row.CREATED_DATE.toISOString(),
      template: row.template
        ? {
            templateId: row.template.TEMPLATE_ID,
            code: row.template.CODE,
            title: row.template.TITLE,
          }
        : null,
    };
  }
}
