import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import type { AuthUser } from '../../auth/types/auth-user.type';
import {
  CreatePrescriptionDto,
  UpdatePrescriptionDto,
} from './dto/prescription.dto';

export type PrescriptionItemResponse = {
  itemId: number;
  drugId: number;
  drugName: string;
  strength: string | null;
  form: string | null;
  route: string | null;
  dose: string;
  frequency: string;
  duration: string | null;
  quantity: number;
  qtyDispensed: number;
  source: string;
  instructions: string | null;
  indication: string | null;
  lineStatus: string;
  unitPrice: number;
};

export type PrescriptionPersonSummary = {
  personId: number;
  hospitalNo: string | null;
  firstName: string | null;
  lastName: string | null;
  middleName: string | null;
  sex: string | null;
  dateOfBirth: string | null;
  age: number | null;
  phone: string | null;
};

export type PrescriptionResponse = {
  prescriptionId: number;
  rxNo: string;
  personId: number;
  status: string;
  urgency: string;
  paymentStatus: string;
  diagnosis: string | null;
  allergiesNote: string | null;
  clinic: string | null;
  notes: string | null;
  pharmacyNotes: string | null;
  sentAt: string | null;
  prescribedBy: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  items: PrescriptionItemResponse[];
  person: PrescriptionPersonSummary | null;
  total: number;
};

const ITEM_INCLUDE = {
  items: { orderBy: { ITEM_ID: 'asc' as const } },
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
    },
  },
} as const;

type RxRow = Prisma.PrescriptionsGetPayload<{ include: typeof ITEM_INCLUDE }>;

function actorLabel(actor?: AuthUser): string {
  if (!actor) return 'SYSTEM';
  const name = [actor.firstName, actor.lastName].filter(Boolean).join(' ');
  return name || actor.email;
}

function ageFromDob(dob: Date | null): number | null {
  if (!dob) return null;
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age -= 1;
  return age;
}

function toResponse(row: RxRow): PrescriptionResponse {
  const items = row.items.map((i) => ({
    itemId: i.ITEM_ID,
    drugId: i.DRUG_ID,
    drugName: i.DRUG_NAME,
    strength: i.STRENGTH,
    form: i.FORM,
    route: i.ROUTE,
    dose: i.DOSE,
    frequency: i.FREQUENCY,
    duration: i.DURATION,
    quantity: i.QUANTITY,
    qtyDispensed: i.QTY_DISPENSED,
    source: i.SOURCE,
    instructions: i.INSTRUCTIONS,
    indication: i.INDICATION,
    lineStatus: i.LINE_STATUS,
    unitPrice: Number(i.UNIT_PRICE),
  }));
  const person = row.person
    ? {
        personId: row.person.PERSON_ID,
        hospitalNo: row.person.HOSPITAL_NO,
        firstName: row.person.FIRST_NAME,
        lastName: row.person.LAST_NAME,
        middleName: row.person.MIDDLE_NAME,
        sex: row.person.SEX,
        dateOfBirth: row.person.DATE_OF_BIRTH?.toISOString() ?? null,
        age: ageFromDob(row.person.DATE_OF_BIRTH),
        phone: row.person.PATIENT_PHONE_NO,
      }
    : null;

  return {
    prescriptionId: row.PRESCRIPTION_ID,
    rxNo: row.RX_NO,
    personId: row.PERSON_ID,
    status: row.STATUS,
    urgency: row.URGENCY,
    paymentStatus: row.PAYMENT_STATUS,
    diagnosis: row.DIAGNOSIS,
    allergiesNote: row.ALLERGIES_NOTE,
    clinic: row.CLINIC,
    notes: row.NOTES,
    pharmacyNotes: row.PHARMACY_NOTES,
    sentAt: row.SENT_AT?.toISOString() ?? null,
    prescribedBy: row.PRESCRIBED_BY,
    createdAt: row.CREATED_DATE?.toISOString() ?? null,
    updatedAt: row.UPDATED_DATE?.toISOString() ?? null,
    items,
    person,
    total: items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0),
  };
}

function pad(id: number): string {
  return String(id).padStart(4, '0');
}

@Injectable()
export class PrescriptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(
    dto: CreatePrescriptionDto,
    actor?: AuthUser,
  ): Promise<PrescriptionResponse> {
    const person = await this.prisma.persons.findUnique({
      where: { PERSON_ID: dto.personId },
      select: { PERSON_ID: true },
    });
    if (!person) throw new NotFoundException('Patient not found');

    const drugIds = [...new Set(dto.items.map((i) => i.drugId))];
    const drugs = await this.prisma.drugs.findMany({
      where: { DRUG_ID: { in: drugIds }, STATUS: 'Active' },
      select: {
        DRUG_ID: true,
        NAME: true,
        STRENGTH: true,
        FORM: true,
        UNIT_PRICE: true,
      },
    });
    const drugMap = new Map(drugs.map((d) => [d.DRUG_ID, d]));
    const missing = drugIds.filter((id) => !drugMap.has(id));
    if (missing.length > 0) {
      throw new BadRequestException(
        `Unknown or inactive drug id(s): ${missing.join(', ')}`,
      );
    }

    const send = dto.send !== false;
    const now = new Date();
    const year = now.getFullYear();
    const label = actorLabel(actor);

    const created = await this.prisma.$transaction(async (tx) => {
      const row = await tx.prescriptions.create({
        data: {
          RX_NO: `RX-${year}-PENDING`,
          PERSON_ID: dto.personId,
          STATUS: send ? 'Sent' : 'Draft',
          URGENCY: dto.urgency ?? 'Routine',
          PAYMENT_STATUS:
            dto.urgency === 'Stat'
              ? 'Emergency'
              : (dto.paymentStatus ?? 'Unpaid'),
          DIAGNOSIS: dto.diagnosis ?? null,
          ALLERGIES_NOTE: dto.allergiesNote ?? null,
          CLINIC: dto.clinic ?? null,
          NOTES: dto.notes ?? null,
          SENT_AT: send ? now : null,
          PRESCRIBED_BY_ID: actor?.id ?? null,
          PRESCRIBED_BY: label,
          CREATED_BY_ID: actor?.id ?? null,
          CREATED_BY: label,
          CREATED_DATE: now,
          items: {
            create: dto.items.map((item) => {
              const drug = drugMap.get(item.drugId)!;
              return {
                DRUG_ID: item.drugId,
                DRUG_NAME: drug.NAME,
                STRENGTH: item.strength ?? drug.STRENGTH,
                FORM: item.form ?? drug.FORM,
                ROUTE: item.route ?? null,
                DOSE: item.dose,
                FREQUENCY: item.frequency,
                DURATION: item.duration ?? null,
                QUANTITY: item.quantity,
                SOURCE: item.source ?? 'Internal Pharmacy',
                INSTRUCTIONS: item.instructions ?? null,
                INDICATION: item.indication ?? null,
                UNIT_PRICE: drug.UNIT_PRICE,
              };
            }),
          },
        },
        include: ITEM_INCLUDE,
      });

      return tx.prescriptions.update({
        where: { PRESCRIPTION_ID: row.PRESCRIPTION_ID },
        data: { RX_NO: `RX-${year}-${pad(row.PRESCRIPTION_ID)}` },
        include: ITEM_INCLUDE,
      });
    });

    const response = toResponse(created);
    await this.audit.log({
      type: send ? 'prescription:send' : 'prescription:create',
      entity: 'prescriptions',
      entityId: created.PRESCRIPTION_ID,
      personId: dto.personId,
      userId: actor?.id,
      createdBy: label,
      item: `${send ? 'Prescription sent' : 'Prescription draft'}: ${response.rxNo}`,
      newValue: response,
    });

    return response;
  }

  async list(params?: {
    q?: string;
    status?: string;
    personId?: number;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(params?.page ?? 1, 1);
    const limit = Math.min(Math.max(params?.limit ?? 50, 1), 100);
    const status =
      params?.status && params.status !== 'all' ? params.status : undefined;

    const where: Prisma.PrescriptionsWhereInput = {
      ...(status ? { STATUS: status } : {}),
      ...(params?.personId ? { PERSON_ID: params.personId } : {}),
      ...(params?.q
        ? {
            OR: [
              { RX_NO: { contains: params.q, mode: 'insensitive' } },
              { DIAGNOSIS: { contains: params.q, mode: 'insensitive' } },
              { PRESCRIBED_BY: { contains: params.q, mode: 'insensitive' } },
              {
                person: {
                  OR: [
                    {
                      HOSPITAL_NO: {
                        contains: params.q,
                        mode: 'insensitive',
                      },
                    },
                    {
                      FIRST_NAME: {
                        contains: params.q,
                        mode: 'insensitive',
                      },
                    },
                    {
                      LAST_NAME: {
                        contains: params.q,
                        mode: 'insensitive',
                      },
                    },
                  ],
                },
              },
              {
                items: {
                  some: {
                    DRUG_NAME: { contains: params.q, mode: 'insensitive' },
                  },
                },
              },
            ],
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.prescriptions.findMany({
        where,
        include: ITEM_INCLUDE,
        orderBy: [{ SENT_AT: 'desc' }, { CREATED_DATE: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.prescriptions.count({ where }),
    ]);

    return { items: rows.map(toResponse), meta: { page, limit, total } };
  }

  async findById(id: number): Promise<PrescriptionResponse> {
    const row = await this.prisma.prescriptions.findUnique({
      where: { PRESCRIPTION_ID: id },
      include: ITEM_INCLUDE,
    });
    if (!row) throw new NotFoundException('Prescription not found');
    return toResponse(row);
  }

  async update(
    id: number,
    dto: UpdatePrescriptionDto,
    actor?: AuthUser,
  ): Promise<PrescriptionResponse> {
    const existing = await this.prisma.prescriptions.findUnique({
      where: { PRESCRIPTION_ID: id },
      include: ITEM_INCLUDE,
    });
    if (!existing) throw new NotFoundException('Prescription not found');

    const updated = await this.prisma.prescriptions.update({
      where: { PRESCRIPTION_ID: id },
      data: {
        ...(dto.status !== undefined ? { STATUS: dto.status } : {}),
        ...(dto.paymentStatus !== undefined
          ? { PAYMENT_STATUS: dto.paymentStatus }
          : {}),
        ...(dto.pharmacyNotes !== undefined
          ? { PHARMACY_NOTES: dto.pharmacyNotes }
          : {}),
        ...(dto.notes !== undefined ? { NOTES: dto.notes } : {}),
        UPDATED_BY_ID: actor?.id ?? null,
        UPDATED_BY: actorLabel(actor),
        UPDATED_DATE: new Date(),
      },
      include: ITEM_INCLUDE,
    });

    const response = toResponse(updated);
    await this.audit.log({
      type: 'prescription:update',
      entity: 'prescriptions',
      entityId: id,
      personId: updated.PERSON_ID,
      userId: actor?.id,
      createdBy: actorLabel(actor),
      item: `Prescription updated: ${response.rxNo}`,
      oldValue: toResponse(existing),
      newValue: response,
    });

    return response;
  }
}
