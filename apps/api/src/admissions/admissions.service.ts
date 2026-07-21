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
import type {
  CompleteDischargeDto,
  CreateAdmissionDto,
  CreateWardDto,
  OrderDischargeDto,
  TransferAdmissionDto,
} from './dto/admission.dto';
import { AdmissionBillsService } from './admission-bills.service';

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

const ACTIVE_STATUSES = [
  'PENDING',
  'BED_ALLOCATED',
  'ADMITTED',
  'ON_LEAVE',
  'DISCHARGE_ORDERED',
] as const;

function actorLabelOf(actor?: AuthUser): string {
  return (
    actor?.email ||
    [actor?.firstName, actor?.lastName].filter(Boolean).join(' ') ||
    'SYSTEM'
  );
}

/** Normalize person sex to Male | Female for ward GENDER filter; null = no filter. */
function normalizePersonSex(raw?: string | null): 'Male' | 'Female' | null {
  if (!raw?.trim()) return null;
  const s = raw.trim().toLowerCase();
  if (s === 'male' || s === 'm' || s === 'man') return 'Male';
  if (s === 'female' || s === 'f' || s === 'woman') return 'Female';
  return null;
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

@Injectable()
export class AdmissionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly admissionBills: AdmissionBillsService,
  ) {}

  async listWards(params?: {
    status?: string;
    personSex?: string;
    q?: string;
  }): Promise<{
    items: Array<{
      wardId: number;
      code: string;
      name: string;
      wardType: string | null;
      wardClass: string | null;
      gender: string;
      dailyBedRate: number;
      admissionDepositDefault: number;
      status: string;
      totalBeds: number;
      availableBeds: number;
      occupiedBeds: number;
    }>;
  }> {
    const where: Prisma.WardsWhereInput = {};
    if (params?.status?.trim()) {
      where.STATUS = params.status.trim();
    }
    if (params?.q?.trim()) {
      const q = params.q.trim();
      where.OR = [
        { NAME: { contains: q, mode: 'insensitive' } },
        { CODE: { contains: q, mode: 'insensitive' } },
      ];
    }
    const sex = normalizePersonSex(params?.personSex);
    if (sex) {
      where.GENDER = { in: [sex, 'Mixed'] };
    }

    const wards = await this.prisma.wards.findMany({
      where,
      orderBy: { NAME: 'asc' },
      include: {
        beds: { select: { STATUS: true } },
      },
    });

    return {
      items: wards.map((w) => {
        const totalBeds = w.beds.length;
        const availableBeds = w.beds.filter((b) => b.STATUS === 'AVAILABLE').length;
        const occupiedBeds = w.beds.filter((b) => b.STATUS === 'OCCUPIED').length;
        return {
          wardId: w.WARD_ID,
          code: w.CODE,
          name: w.NAME,
          wardType: w.WARD_TYPE,
          wardClass: w.WARD_CLASS,
          gender: w.GENDER,
          dailyBedRate: Number(w.DAILY_BED_RATE ?? 0),
          admissionDepositDefault: Number(w.ADMISSION_DEPOSIT_DEFAULT ?? 0),
          status: w.STATUS,
          totalBeds,
          availableBeds,
          occupiedBeds,
        };
      }),
    };
  }

  async createWard(
    dto: CreateWardDto,
    actor?: AuthUser,
  ): Promise<{
    wardId: number;
    code: string;
    name: string;
    wardType: string | null;
    wardClass: string | null;
    gender: string;
    dailyBedRate: number;
    admissionDepositDefault: number;
    status: string;
    bedsCreated: number;
  }> {
    const code = dto.code.trim();
    const existing = await this.prisma.wards.findUnique({ where: { CODE: code } });
    if (existing) {
      throw new ConflictException(`Ward with code ${code} already exists`);
    }

    const actorLabel = actorLabelOf(actor);
    const now = new Date();
    const bedCount = dto.bedCount ?? 0;
    const gender = dto.gender?.trim() || 'Mixed';
    const wardClass = dto.wardClass?.trim() || null;

    const ward = await this.prisma.$transaction(async (tx) => {
      const created = await tx.wards.create({
        data: {
          CODE: code,
          NAME: dto.name.trim(),
          WARD_TYPE: dto.wardType?.trim() || null,
          WARD_CLASS: wardClass,
          GENDER: gender,
          DAILY_BED_RATE: dto.dailyBedRate ?? 0,
          ADMISSION_DEPOSIT_DEFAULT: dto.admissionDepositDefault ?? 0,
          STATUS: 'Active',
          CREATED_BY: actorLabel,
          CREATED_DATE: now,
        },
      });

      if (bedCount > 0) {
        await tx.beds.createMany({
          data: Array.from({ length: bedCount }, (_, i) => ({
            WARD_ID: created.WARD_ID,
            LABEL: String(i + 1).padStart(2, '0'),
            STATUS: 'AVAILABLE',
            CREATED_BY: actorLabel,
            CREATED_DATE: now,
          })),
        });
      }

      return created;
    });

    return {
      wardId: ward.WARD_ID,
      code: ward.CODE,
      name: ward.NAME,
      wardType: ward.WARD_TYPE,
      wardClass: ward.WARD_CLASS,
      gender: ward.GENDER,
      dailyBedRate: Number(ward.DAILY_BED_RATE ?? 0),
      admissionDepositDefault: Number(ward.ADMISSION_DEPOSIT_DEFAULT ?? 0),
      status: ward.STATUS,
      bedsCreated: bedCount,
    };
  }

  async listBeds(params?: {
    wardId?: number;
    status?: string;
  }): Promise<{
    items: Array<{
      bedId: number;
      wardId: number;
      label: string;
      status: string;
      ward: { wardId: number; code: string; name: string } | null;
    }>;
  }> {
    const where: Prisma.BedsWhereInput = {
      ...(params?.wardId ? { WARD_ID: params.wardId } : {}),
      ...(params?.status ? { STATUS: params.status } : {}),
    };

    const rows = await this.prisma.beds.findMany({
      where,
      orderBy: [{ WARD_ID: 'asc' }, { LABEL: 'asc' }],
      include: {
        ward: { select: { WARD_ID: true, CODE: true, NAME: true } },
      },
    });

    return {
      items: rows.map((b) => ({
        bedId: b.BED_ID,
        wardId: b.WARD_ID,
        label: b.LABEL,
        status: b.STATUS,
        ward: b.ward
          ? {
              wardId: b.ward.WARD_ID,
              code: b.ward.CODE,
              name: b.ward.NAME,
            }
          : null,
      })),
    };
  }

  async stats(): Promise<{
    active: number;
    availableBeds: number;
    dischargeOrdered: number;
    constantSupervision: number;
  }> {
    const [active, availableBeds, dischargeOrdered, constantSupervision] =
      await Promise.all([
        this.prisma.admissions.count({
          where: { STATUS: { in: [...ACTIVE_STATUSES] } },
        }),
        this.prisma.beds.count({ where: { STATUS: 'AVAILABLE' } }),
        this.prisma.admissions.count({
          where: { STATUS: 'DISCHARGE_ORDERED' },
        }),
        this.prisma.admissions.count({
          where: {
            STATUS: { in: [...ACTIVE_STATUSES] },
            SUPERVISION_LEVEL: 'Constant',
          },
        }),
      ]);

    return { active, availableBeds, dischargeOrdered, constantSupervision };
  }

  async list(params?: {
    status?: string;
    wardId?: number;
    q?: string;
    page?: number;
    limit?: number;
  }): Promise<{
    items: ReturnType<AdmissionsService['toResponse']>[];
    meta: { page: number; limit: number; total: number };
  }> {
    const page = Math.max(params?.page ?? 1, 1);
    const limit = Math.min(Math.max(params?.limit ?? 50, 1), 100);
    const term = params?.q?.trim();

    const where: Prisma.AdmissionsWhereInput = {
      ...(params?.status
        ? (() => {
            const statuses = params.status
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean);
            return {
              STATUS:
                statuses.length === 1 ? statuses[0] : { in: statuses },
            };
          })()
        : {}),
      ...(params?.wardId ? { WARD_ID: params.wardId } : {}),
      ...(term
        ? {
            OR: [
              {
                person: {
                  HOSPITAL_NO: { contains: term, mode: 'insensitive' },
                },
              },
              {
                person: {
                  FIRST_NAME: { contains: term, mode: 'insensitive' },
                },
              },
              {
                person: {
                  LAST_NAME: { contains: term, mode: 'insensitive' },
                },
              },
              { DIAGNOSIS: { contains: term, mode: 'insensitive' } },
              { CONSULTANT: { contains: term, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.admissions.findMany({
        where,
        orderBy: { ADMITTED_AT: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          person: { select: PERSON_SELECT },
          ward: true,
          bed: true,
        },
      }),
      this.prisma.admissions.count({ where }),
    ]);

    return {
      items: rows.map((r) => this.toResponse(r)),
      meta: { page, limit, total },
    };
  }

  async findById(id: number): Promise<ReturnType<AdmissionsService['toResponse']>> {
    const row = await this.prisma.admissions.findUnique({
      where: { ADMISSION_ID: id },
      include: {
        person: { select: PERSON_SELECT },
        ward: true,
        bed: true,
      },
    });
    if (!row) throw new NotFoundException('Admission not found');
    return this.toResponse(row);
  }

  async admit(
    dto: CreateAdmissionDto,
    actor?: AuthUser,
  ): Promise<
    ReturnType<AdmissionsService['toResponse']> & {
      admissionBill: ReturnType<AdmissionBillsService['toResponse']>;
    }
  > {
    const person = await this.prisma.persons.findUnique({
      where: { PERSON_ID: dto.personId },
    });
    if (!person || person.DISCONTINUE_FLAG === 'Y') {
      throw new NotFoundException('Person not found');
    }

    const ward = await this.prisma.wards.findUnique({
      where: { WARD_ID: dto.wardId },
    });
    if (!ward || ward.STATUS !== 'Active') {
      throw new NotFoundException('Ward not found or inactive');
    }

    const bed = await this.prisma.beds.findUnique({
      where: { BED_ID: dto.bedId },
    });
    if (!bed) throw new NotFoundException('Bed not found');
    if (bed.WARD_ID !== dto.wardId) {
      throw new BadRequestException('Bed does not belong to the selected ward');
    }
    if (bed.STATUS !== 'AVAILABLE') {
      throw new ConflictException(`Bed is not available (status: ${bed.STATUS})`);
    }

    const active = await this.prisma.admissions.findFirst({
      where: {
        PERSON_ID: dto.personId,
        STATUS: { in: [...ACTIVE_STATUSES] },
      },
    });
    if (active) {
      throw new ConflictException({
        message: 'Person already has an active admission',
        admissionId: active.ADMISSION_ID,
        status: active.STATUS,
      });
    }

    const actorLabel = actorLabelOf(actor);
    const now = new Date();

    if (dto.admissionRequestId) {
      const req = await this.prisma.admissionRequests.findUnique({
        where: { ADMISSION_REQUEST_ID: dto.admissionRequestId },
      });
      if (!req) throw new NotFoundException('Admission request not found');
      if (req.PERSON_ID !== dto.personId) {
        throw new BadRequestException(
          'Admission request person does not match personId',
        );
      }
      if (['Rejected', 'Cancelled', 'Admitted'].includes(req.STATUS)) {
        throw new ConflictException(
          `Cannot admit from request in status ${req.STATUS}`,
        );
      }
    }

    const { row, bill } = await this.prisma.$transaction(async (tx) => {
      await tx.beds.update({
        where: { BED_ID: dto.bedId },
        data: {
          STATUS: 'OCCUPIED',
          UPDATED_BY: actorLabel,
          UPDATED_DATE: now,
        },
      });

      const admission = await tx.admissions.create({
        data: {
          PERSON_ID: dto.personId,
          WARD_ID: dto.wardId,
          BED_ID: dto.bedId,
          DIAGNOSIS: dto.diagnosis?.trim() || null,
          CONSULTANT: dto.consultant?.trim() || null,
          ADMISSION_TYPE: dto.admissionType || 'General',
          SUPERVISION_LEVEL: dto.supervisionLevel || 'General',
          STATUS: 'ADMITTED',
          ADMITTED_AT: now,
          CREATED_BY_ID: actor?.id ?? null,
          CREATED_BY: actorLabel,
          CREATED_DATE: now,
        },
        include: {
          person: { select: PERSON_SELECT },
          ward: true,
          bed: true,
        },
      });

      if (dto.admissionRequestId) {
        await tx.admissionRequests.update({
          where: { ADMISSION_REQUEST_ID: dto.admissionRequestId },
          data: {
            STATUS: 'Admitted',
            WARD_ID: dto.wardId,
            UPDATED_BY_ID: actor?.id ?? null,
            UPDATED_BY: actorLabel,
            UPDATED_DATE: now,
          },
        });
      }

      const createdBill = await this.admissionBills.createPackageBillInTx(tx, {
        personId: dto.personId,
        admissionId: admission.ADMISSION_ID,
        admissionRequestId: dto.admissionRequestId ?? null,
        wardId: dto.wardId,
        actorLabel,
        actorId: actor?.id ?? null,
        now,
      });

      return { row: admission, bill: createdBill };
    });

    await this.audit.log({
      type: 'admission:create',
      entity: 'admission',
      entityId: row.ADMISSION_ID,
      personId: row.PERSON_ID,
      userId: actor?.id,
      createdBy: actorLabel,
      item: `Admitted person ${dto.personId} to bed ${bed.LABEL}`,
      newValue: {
        admissionId: row.ADMISSION_ID,
        wardId: dto.wardId,
        bedId: dto.bedId,
        status: 'ADMITTED',
        admissionRequestId: dto.admissionRequestId ?? null,
        admissionBillId: bill.ADMISSION_BILL_ID,
        billNo: bill.BILL_NO,
      },
    });

    await this.audit.log({
      type: 'admission-bill:create',
      entity: 'admission-bill',
      entityId: bill.ADMISSION_BILL_ID,
      personId: row.PERSON_ID,
      userId: actor?.id,
      createdBy: actorLabel,
      item: `Admission bill ${bill.BILL_NO} posted (Unpaid)`,
      newValue: {
        billNo: bill.BILL_NO,
        totalAmount: Number(bill.TOTAL_AMOUNT),
        paymentStatus: 'Unpaid',
      },
    });

    return {
      ...this.toResponse(row),
      admissionBill: this.admissionBills.toResponse(bill),
    };
  }

  async transfer(
    id: number,
    dto: TransferAdmissionDto,
    actor?: AuthUser,
  ): Promise<ReturnType<AdmissionsService['toResponse']>> {
    const existing = await this.prisma.admissions.findUnique({
      where: { ADMISSION_ID: id },
    });
    if (!existing) throw new NotFoundException('Admission not found');
    if (!ACTIVE_STATUSES.includes(existing.STATUS as (typeof ACTIVE_STATUSES)[number])) {
      throw new ConflictException(
        `Cannot transfer admission in status ${existing.STATUS}`,
      );
    }
    if (existing.BED_ID === dto.bedId) {
      throw new BadRequestException('Patient is already in this bed');
    }

    const newBed = await this.prisma.beds.findUnique({
      where: { BED_ID: dto.bedId },
      include: { ward: true },
    });
    if (!newBed) throw new NotFoundException('Target bed not found');
    if (newBed.STATUS !== 'AVAILABLE') {
      throw new ConflictException(
        `Target bed is not available (status: ${newBed.STATUS})`,
      );
    }

    const actorLabel = actorLabelOf(actor);
    const now = new Date();
    const oldBedId = existing.BED_ID;

    const row = await this.prisma.$transaction(async (tx) => {
      if (oldBedId != null) {
        await tx.beds.update({
          where: { BED_ID: oldBedId },
          data: {
            STATUS: 'CLEANING',
            UPDATED_BY: actorLabel,
            UPDATED_DATE: now,
          },
        });
      }

      await tx.beds.update({
        where: { BED_ID: dto.bedId },
        data: {
          STATUS: 'OCCUPIED',
          UPDATED_BY: actorLabel,
          UPDATED_DATE: now,
        },
      });

      return tx.admissions.update({
        where: { ADMISSION_ID: id },
        data: {
          BED_ID: dto.bedId,
          WARD_ID: newBed.WARD_ID,
          UPDATED_BY_ID: actor?.id ?? null,
          UPDATED_BY: actorLabel,
          UPDATED_DATE: now,
        },
        include: {
          person: { select: PERSON_SELECT },
          ward: true,
          bed: true,
        },
      });
    });

    await this.audit.log({
      type: 'admission:transfer',
      entity: 'admission',
      entityId: id,
      personId: existing.PERSON_ID,
      userId: actor?.id,
      createdBy: actorLabel,
      item: `Transferred admission ${id} to bed ${newBed.LABEL}`,
      oldValue: { bedId: oldBedId, wardId: existing.WARD_ID },
      newValue: { bedId: dto.bedId, wardId: newBed.WARD_ID },
    });

    return this.toResponse(row);
  }

  async orderDischarge(
    id: number,
    dto: OrderDischargeDto,
    actor?: AuthUser,
  ): Promise<ReturnType<AdmissionsService['toResponse']>> {
    const existing = await this.prisma.admissions.findUnique({
      where: { ADMISSION_ID: id },
    });
    if (!existing) throw new NotFoundException('Admission not found');
    if (
      existing.STATUS !== 'ADMITTED' &&
      existing.STATUS !== 'ON_LEAVE' &&
      existing.STATUS !== 'BED_ALLOCATED'
    ) {
      throw new ConflictException(
        `Cannot order discharge from status ${existing.STATUS}`,
      );
    }

    const actorLabel = actorLabelOf(actor);
    const now = new Date();

    const row = await this.prisma.admissions.update({
      where: { ADMISSION_ID: id },
      data: {
        STATUS: 'DISCHARGE_ORDERED',
        DISCHARGE_ORDERED_AT: now,
        DISCHARGE_ORDERED_BY: actorLabel,
        DISCHARGE_REASON: dto.reason?.trim() || existing.DISCHARGE_REASON,
        UPDATED_BY_ID: actor?.id ?? null,
        UPDATED_BY: actorLabel,
        UPDATED_DATE: now,
      },
      include: {
        person: { select: PERSON_SELECT },
        ward: true,
        bed: true,
      },
    });

    await this.audit.log({
      type: 'admission:order-discharge',
      entity: 'admission',
      entityId: id,
      personId: existing.PERSON_ID,
      userId: actor?.id,
      createdBy: actorLabel,
      item: `Discharge ordered for admission ${id}`,
      newValue: { status: 'DISCHARGE_ORDERED', reason: dto.reason ?? null },
    });

    return this.toResponse(row);
  }

  async completeDischarge(
    id: number,
    dto: CompleteDischargeDto,
    actor?: AuthUser,
  ): Promise<ReturnType<AdmissionsService['toResponse']>> {
    const existing = await this.prisma.admissions.findUnique({
      where: { ADMISSION_ID: id },
    });
    if (!existing) throw new NotFoundException('Admission not found');
    if (existing.STATUS !== 'DISCHARGE_ORDERED') {
      throw new ConflictException(
        `Cannot complete discharge from status ${existing.STATUS} — use discharge draft finalize after payment clearance`,
      );
    }

    const actorLabel = actorLabelOf(actor);
    const now = new Date();
    const bedId = existing.BED_ID;

    const row = await this.prisma.$transaction(async (tx) => {
      if (bedId != null) {
        await tx.beds.update({
          where: { BED_ID: bedId },
          data: {
            STATUS: 'CLEANING',
            UPDATED_BY: actorLabel,
            UPDATED_DATE: now,
          },
        });
      }

      return tx.admissions.update({
        where: { ADMISSION_ID: id },
        data: {
          STATUS: 'DISCHARGED',
          DISCHARGED_AT: now,
          DISCHARGED_BY: actorLabel,
          DISCHARGE_REASON:
            dto.reason?.trim() || existing.DISCHARGE_REASON,
          BED_ID: null,
          UPDATED_BY_ID: actor?.id ?? null,
          UPDATED_BY: actorLabel,
          UPDATED_DATE: now,
        },
        include: {
          person: { select: PERSON_SELECT },
          ward: true,
          bed: true,
        },
      });
    });

    await this.audit.log({
      type: 'admission:discharge',
      entity: 'admission',
      entityId: id,
      personId: existing.PERSON_ID,
      userId: actor?.id,
      createdBy: actorLabel,
      item: `Discharged admission ${id}`,
      newValue: {
        status: 'DISCHARGED',
        previousBedId: bedId,
        reason: dto.reason ?? null,
      },
    });

    return this.toResponse(row);
  }

  private toResponse(row: {
    ADMISSION_ID: number;
    PERSON_ID: number;
    WARD_ID: number | null;
    BED_ID: number | null;
    DIAGNOSIS: string | null;
    CONSULTANT: string | null;
    ASSIGNED_NURSE: string | null;
    ADMISSION_TYPE: string | null;
    SUPERVISION_LEVEL: string | null;
    STATUS: string;
    ADMITTED_AT: Date;
    DISCHARGE_ORDERED_AT: Date | null;
    DISCHARGE_ORDERED_BY: string | null;
    DISCHARGE_REASON: string | null;
    DISCHARGED_AT: Date | null;
    DISCHARGED_BY: string | null;
    CREATED_DATE: Date | null;
    person?: Parameters<typeof mapPerson>[0];
    ward?: {
      WARD_ID: number;
      CODE: string;
      NAME: string;
      WARD_TYPE: string | null;
    } | null;
    bed?: {
      BED_ID: number;
      LABEL: string;
      STATUS: string;
      WARD_ID: number;
    } | null;
  }) {
    return {
      admissionId: row.ADMISSION_ID,
      personId: row.PERSON_ID,
      wardId: row.WARD_ID,
      bedId: row.BED_ID,
      diagnosis: row.DIAGNOSIS,
      consultant: row.CONSULTANT,
      assignedNurse: row.ASSIGNED_NURSE,
      admissionType: row.ADMISSION_TYPE,
      supervisionLevel: row.SUPERVISION_LEVEL,
      status: row.STATUS,
      admittedAt: row.ADMITTED_AT.toISOString(),
      dischargeOrderedAt: row.DISCHARGE_ORDERED_AT?.toISOString() ?? null,
      dischargeOrderedBy: row.DISCHARGE_ORDERED_BY,
      dischargeReason: row.DISCHARGE_REASON,
      dischargedAt: row.DISCHARGED_AT?.toISOString() ?? null,
      dischargedBy: row.DISCHARGED_BY,
      createdAt: row.CREATED_DATE?.toISOString() ?? null,
      person: mapPerson(row.person),
      ward: row.ward
        ? {
            wardId: row.ward.WARD_ID,
            code: row.ward.CODE,
            name: row.ward.NAME,
            wardType: row.ward.WARD_TYPE,
          }
        : null,
      bed: row.bed
        ? {
            bedId: row.bed.BED_ID,
            label: row.bed.LABEL,
            status: row.bed.STATUS,
            wardId: row.bed.WARD_ID,
          }
        : null,
    };
  }
}
