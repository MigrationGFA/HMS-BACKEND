import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../auth/types/auth-user.type';
import { CreateTriageDto, UpdateTriageDto } from './dto/triage.dto';

function calcBmi(weightKg?: number, heightCm?: number): number | null {
  if (weightKg == null || heightCm == null || heightCm <= 0) return null;
  const m = heightCm / 100;
  return Math.round((weightKg / (m * m)) * 100) / 100;
}

function dec(n?: number | null): Prisma.Decimal | null {
  if (n == null || Number.isNaN(n)) return null;
  return new Prisma.Decimal(n);
}

@Injectable()
export class TriageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(dto: CreateTriageDto, actor?: AuthUser) {
    const person = await this.prisma.persons.findUnique({
      where: { PERSON_ID: dto.personId },
    });
    if (!person || person.DISCONTINUE_FLAG === 'Y') {
      throw new NotFoundException('Person not found');
    }

    const queueNo = await this.nextQueueNo();
    const bmi = calcBmi(dto.weightKg, dto.heightCm);
    const actorLabel =
      actor?.email ||
      [actor?.firstName, actor?.lastName].filter(Boolean).join(' ') ||
      'SYSTEM';

    const row = await this.prisma.triage.create({
      data: {
        PERSON_ID: dto.personId,
        QUEUE_NO: queueNo,
        CLINIC: dto.clinic?.trim() || 'General OPD',
        STATUS: dto.status || 'Waiting',
        PRIORITY: dto.priority || 'Routine',
        PRIORITY_REASON: dto.priorityReason?.trim() || null,
        PATIENT_TYPE: dto.patientType || 'New',
        ARRIVAL_AT: dto.arrivalAt ? new Date(dto.arrivalAt) : new Date(),
        WEIGHT_KG: dec(dto.weightKg),
        HEIGHT_CM: dec(dto.heightCm),
        BMI: dec(bmi),
        BLOOD_PRESSURE: dto.bloodPressure?.trim() || null,
        TEMPERATURE_C: dec(dto.temperatureC),
        PULSE_BPM: dto.pulseBpm ?? null,
        RESPIRATORY_RATE: dto.respiratoryRate ?? null,
        SPO2_PCT: dec(dto.spo2Pct),
        NOTES: dto.notes?.trim() || null,
        CREATED_BY_ID: actor?.id ?? null,
        CREATED_BY: actorLabel,
        CREATED_DATE: new Date(),
      },
      include: {
        person: {
          select: {
            PERSON_ID: true,
            HOSPITAL_NO: true,
            FIRST_NAME: true,
            LAST_NAME: true,
            MIDDLE_NAME: true,
            SEX: true,
            DATE_OF_BIRTH: true,
            PATIENT_PHONE_NO: true,
            NAME_OF_NEXT_OF_KIN: true,
            RELATIONSHIP: true,
            TELEPHONE_OF_NEXT_OF_KIN: true,
            BLOOD_GROUP: true,
          },
        },
      },
    });

    await this.audit.log({
      type: 'triage:create',
      entity: 'triage',
      entityId: row.TRIAGE_ID,
      personId: row.PERSON_ID,
      userId: actor?.id,
      createdBy: actorLabel,
      item: `Triage ${row.QUEUE_NO} created`,
      newValue: { triageId: row.TRIAGE_ID, queueNo: row.QUEUE_NO, personId: row.PERSON_ID },
    });

    return this.toResponse(row);
  }

  async update(triageId: number, dto: UpdateTriageDto, actor?: AuthUser) {
    const existing = await this.prisma.triage.findUnique({
      where: { TRIAGE_ID: triageId },
    });
    if (!existing) throw new NotFoundException('Triage record not found');

    const weight =
      dto.weightKg !== undefined ? dto.weightKg : existing.WEIGHT_KG?.toNumber();
    const height =
      dto.heightCm !== undefined ? dto.heightCm : existing.HEIGHT_CM?.toNumber();
    const bmi = calcBmi(weight ?? undefined, height ?? undefined);
    const actorLabel =
      actor?.email ||
      [actor?.firstName, actor?.lastName].filter(Boolean).join(' ') ||
      'SYSTEM';

    const row = await this.prisma.triage.update({
      where: { TRIAGE_ID: triageId },
      data: {
        ...(dto.clinic !== undefined ? { CLINIC: dto.clinic.trim() || null } : {}),
        ...(dto.status !== undefined ? { STATUS: dto.status } : {}),
        ...(dto.priority !== undefined ? { PRIORITY: dto.priority } : {}),
        ...(dto.priorityReason !== undefined
          ? { PRIORITY_REASON: dto.priorityReason.trim() || null }
          : {}),
        ...(dto.patientType !== undefined ? { PATIENT_TYPE: dto.patientType } : {}),
        ...(dto.weightKg !== undefined ? { WEIGHT_KG: dec(dto.weightKg) } : {}),
        ...(dto.heightCm !== undefined ? { HEIGHT_CM: dec(dto.heightCm) } : {}),
        BMI: dec(bmi),
        ...(dto.bloodPressure !== undefined
          ? { BLOOD_PRESSURE: dto.bloodPressure.trim() || null }
          : {}),
        ...(dto.temperatureC !== undefined
          ? { TEMPERATURE_C: dec(dto.temperatureC) }
          : {}),
        ...(dto.pulseBpm !== undefined ? { PULSE_BPM: dto.pulseBpm } : {}),
        ...(dto.respiratoryRate !== undefined
          ? { RESPIRATORY_RATE: dto.respiratoryRate }
          : {}),
        ...(dto.spo2Pct !== undefined ? { SPO2_PCT: dec(dto.spo2Pct) } : {}),
        ...(dto.notes !== undefined ? { NOTES: dto.notes.trim() || null } : {}),
        UPDATED_BY_ID: actor?.id ?? null,
        UPDATED_BY: actorLabel,
        UPDATED_DATE: new Date(),
      },
      include: {
        person: {
          select: {
            PERSON_ID: true,
            HOSPITAL_NO: true,
            FIRST_NAME: true,
            LAST_NAME: true,
            MIDDLE_NAME: true,
            SEX: true,
            DATE_OF_BIRTH: true,
            PATIENT_PHONE_NO: true,
            NAME_OF_NEXT_OF_KIN: true,
            RELATIONSHIP: true,
            TELEPHONE_OF_NEXT_OF_KIN: true,
            BLOOD_GROUP: true,
          },
        },
      },
    });

    await this.audit.log({
      type: 'triage:update',
      entity: 'triage',
      entityId: row.TRIAGE_ID,
      personId: row.PERSON_ID,
      userId: actor?.id,
      createdBy: actorLabel,
      item: `Triage ${row.QUEUE_NO} updated`,
      newValue: dto,
      oldValue: {
        status: existing.STATUS,
        priority: existing.PRIORITY,
      },
    });

    return this.toResponse(row);
  }

  async list(params?: {
    status?: string;
    clinic?: string;
    priority?: string;
    q?: string;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(params?.page ?? 1, 1);
    const limit = Math.min(Math.max(params?.limit ?? 50, 1), 100);
    const term = params?.q?.trim();

    const where: Prisma.TriageWhereInput = {
      ...(params?.status ? { STATUS: params.status } : {}),
      ...(params?.clinic ? { CLINIC: params.clinic } : {}),
      ...(params?.priority ? { PRIORITY: params.priority } : {}),
      ...(term
        ? {
            OR: [
              { QUEUE_NO: { contains: term, mode: 'insensitive' } },
              { person: { HOSPITAL_NO: { contains: term, mode: 'insensitive' } } },
              { person: { FIRST_NAME: { contains: term, mode: 'insensitive' } } },
              { person: { LAST_NAME: { contains: term, mode: 'insensitive' } } },
              { person: { PATIENT_PHONE_NO: { contains: term } } },
            ],
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.triage.findMany({
        where,
        orderBy: { ARRIVAL_AT: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          person: {
            select: {
              PERSON_ID: true,
              HOSPITAL_NO: true,
              FIRST_NAME: true,
              LAST_NAME: true,
              MIDDLE_NAME: true,
              SEX: true,
              DATE_OF_BIRTH: true,
              PATIENT_PHONE_NO: true,
              NAME_OF_NEXT_OF_KIN: true,
              RELATIONSHIP: true,
              TELEPHONE_OF_NEXT_OF_KIN: true,
              BLOOD_GROUP: true,
            },
          },
        },
      }),
      this.prisma.triage.count({ where }),
    ]);

    return {
      items: rows.map((r) => this.toResponse(r)),
      meta: { page, limit, total },
    };
  }

  async findById(triageId: number) {
    const row = await this.prisma.triage.findUnique({
      where: { TRIAGE_ID: triageId },
      include: {
        person: {
          select: {
            PERSON_ID: true,
            HOSPITAL_NO: true,
            FIRST_NAME: true,
            LAST_NAME: true,
            MIDDLE_NAME: true,
            SEX: true,
            DATE_OF_BIRTH: true,
            PATIENT_PHONE_NO: true,
            NAME_OF_NEXT_OF_KIN: true,
            RELATIONSHIP: true,
            TELEPHONE_OF_NEXT_OF_KIN: true,
            BLOOD_GROUP: true,
          },
        },
      },
    });
    if (!row) throw new NotFoundException('Triage record not found');
    return this.toResponse(row);
  }

  private async nextQueueNo(): Promise<string> {
    const today = new Date();
    const prefix = `T-${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}-`;
    const latest = await this.prisma.triage.findFirst({
      where: { QUEUE_NO: { startsWith: prefix } },
      orderBy: { QUEUE_NO: 'desc' },
      select: { QUEUE_NO: true },
    });
    let seq = 1;
    if (latest?.QUEUE_NO) {
      const tail = latest.QUEUE_NO.slice(prefix.length);
      const n = Number.parseInt(tail, 10);
      if (!Number.isNaN(n)) seq = n + 1;
    }
    return `${prefix}${String(seq).padStart(4, '0')}`;
  }

  private toResponse(row: {
    TRIAGE_ID: number;
    PERSON_ID: number;
    QUEUE_NO: string;
    CLINIC: string | null;
    STATUS: string;
    PRIORITY: string;
    PRIORITY_REASON: string | null;
    PATIENT_TYPE: string | null;
    ARRIVAL_AT: Date;
    WEIGHT_KG: Prisma.Decimal | null;
    HEIGHT_CM: Prisma.Decimal | null;
    BMI: Prisma.Decimal | null;
    BLOOD_PRESSURE: string | null;
    TEMPERATURE_C: Prisma.Decimal | null;
    PULSE_BPM: number | null;
    RESPIRATORY_RATE: number | null;
    SPO2_PCT: Prisma.Decimal | null;
    NOTES: string | null;
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
      NAME_OF_NEXT_OF_KIN: string | null;
      RELATIONSHIP: string | null;
      TELEPHONE_OF_NEXT_OF_KIN: string | null;
      BLOOD_GROUP: string | null;
    };
  }) {
    const p = row.person;
    const age = p?.DATE_OF_BIRTH
      ? Math.max(
          0,
          Math.floor(
            (Date.now() - p.DATE_OF_BIRTH.getTime()) / (1000 * 60 * 60 * 24 * 365.25),
          ),
        )
      : null;

    return {
      triageId: row.TRIAGE_ID,
      personId: row.PERSON_ID,
      queueNo: row.QUEUE_NO,
      clinic: row.CLINIC,
      status: row.STATUS,
      priority: row.PRIORITY,
      priorityReason: row.PRIORITY_REASON,
      patientType: row.PATIENT_TYPE,
      arrivalAt: row.ARRIVAL_AT.toISOString(),
      weightKg: row.WEIGHT_KG?.toNumber() ?? null,
      heightCm: row.HEIGHT_CM?.toNumber() ?? null,
      bmi: row.BMI?.toNumber() ?? null,
      bloodPressure: row.BLOOD_PRESSURE,
      temperatureC: row.TEMPERATURE_C?.toNumber() ?? null,
      pulseBpm: row.PULSE_BPM,
      respiratoryRate: row.RESPIRATORY_RATE,
      spo2Pct: row.SPO2_PCT?.toNumber() ?? null,
      notes: row.NOTES,
      createdAt: row.CREATED_DATE?.toISOString() ?? null,
      // Joined from PERSONS — not duplicated in TRIAGE
      person: p
        ? {
            personId: p.PERSON_ID,
            hospitalNo: p.HOSPITAL_NO,
            firstName: p.FIRST_NAME,
            lastName: p.LAST_NAME,
            middleName: p.MIDDLE_NAME,
            sex: p.SEX,
            dateOfBirth: p.DATE_OF_BIRTH?.toISOString() ?? null,
            age,
            phone: p.PATIENT_PHONE_NO,
            nextOfKinName: p.NAME_OF_NEXT_OF_KIN,
            nextOfKinRelationship: p.RELATIONSHIP,
            nextOfKinPhone: p.TELEPHONE_OF_NEXT_OF_KIN,
            bloodGroup: p.BLOOD_GROUP,
          }
        : null,
    };
  }
}
