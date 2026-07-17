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
  DispensePrescriptionDto,
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

export type PrescriptionAuditEvent = {
  at: string;
  actor: string;
  action: string;
  note?: string;
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
  dispensedBy: string | null;
  dispensedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  items: PrescriptionItemResponse[];
  person: PrescriptionPersonSummary | null;
  total: number;
  auditTrail: PrescriptionAuditEvent[];
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

  const dispensed =
    row.STATUS === 'Dispensed' || row.STATUS === 'Partially Dispensed';

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
    dispensedBy: dispensed ? (row.UPDATED_BY ?? null) : null,
    dispensedAt: dispensed ? (row.UPDATED_DATE?.toISOString() ?? null) : null,
    createdAt: row.CREATED_DATE?.toISOString() ?? null,
    updatedAt: row.UPDATED_DATE?.toISOString() ?? null,
    items,
    person,
    total: items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0),
    auditTrail: [],
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

  private async withAuditTrail(
    response: PrescriptionResponse,
  ): Promise<PrescriptionResponse> {
    const logs = await this.prisma.audits.findMany({
      where: {
        ENTITY: 'prescriptions',
        ENTITY_ID: String(response.prescriptionId),
      },
      orderBy: { CREATE_DATE: 'desc' },
      take: 50,
    });
    return {
      ...response,
      auditTrail: logs.map((a) => ({
        at: a.CREATE_DATE?.toISOString() ?? '',
        actor: a.CREATED_BY ?? 'SYSTEM',
        action: a.AUDIT_TYPE ?? a.ITEM ?? 'audit',
        note: a.ITEM ?? undefined,
      })),
    };
  }

  async findById(id: number): Promise<PrescriptionResponse> {
    const row = await this.prisma.prescriptions.findUnique({
      where: { PRESCRIPTION_ID: id },
      include: ITEM_INCLUDE,
    });
    if (!row) throw new NotFoundException('Prescription not found');
    return this.withAuditTrail(toResponse(row));
  }

  async findByRxNo(rxNo: string): Promise<PrescriptionResponse> {
    let decoded = rxNo?.trim() ?? '';
    try {
      decoded = decodeURIComponent(decoded).trim();
    } catch {
      // keep trimmed raw value
    }
    if (!decoded) throw new NotFoundException('Prescription not found');

    const row =
      (await this.prisma.prescriptions.findUnique({
        where: { RX_NO: decoded },
        include: ITEM_INCLUDE,
      })) ??
      (await this.prisma.prescriptions.findFirst({
        where: { RX_NO: { equals: decoded, mode: 'insensitive' } },
        include: ITEM_INCLUDE,
      }));
    if (!row) throw new NotFoundException('Prescription not found');
    return this.withAuditTrail(toResponse(row));
  }

  /**
   * Dispense prescription lines with FEFO stock deduction from DRUG_BATCHES.
   * Same pharmacist can process and complete in one action.
   */
  async dispense(
    id: number,
    dto: DispensePrescriptionDto,
    actor?: AuthUser,
  ): Promise<PrescriptionResponse> {
    const existing = await this.prisma.prescriptions.findUnique({
      where: { PRESCRIPTION_ID: id },
      include: ITEM_INCLUDE,
    });
    if (!existing) throw new NotFoundException('Prescription not found');
    if (existing.STATUS === 'Cancelled' || existing.STATUS === 'Rejected') {
      throw new BadRequestException(
        `Cannot dispense a ${existing.STATUS.toLowerCase()} prescription`,
      );
    }
    if (existing.STATUS === 'Dispensed') {
      throw new BadRequestException('Prescription already fully dispensed');
    }

    const label = actorLabel(actor);
    const now = new Date();
    const requested = new Map(
      (dto.items ?? []).map((i) => [i.itemId, i.quantity]),
    );

    const lines = existing.items
      .filter((i) => i.LINE_STATUS === 'Active' && i.SOURCE === 'Internal Pharmacy')
      .map((i) => {
        const remaining = i.QUANTITY - i.QTY_DISPENSED;
        const qty =
          requested.size > 0
            ? (requested.get(i.ITEM_ID) ?? 0)
            : remaining;
        return { row: i, qty, remaining };
      })
      .filter((l) => l.qty > 0);

    // External-only prescriptions: mark dispensed without stock deduction.
    if (lines.length === 0) {
      const externalActive = existing.items.filter(
        (i) =>
          i.LINE_STATUS === 'Active' &&
          i.SOURCE !== 'Internal Pharmacy' &&
          i.QTY_DISPENSED < i.QUANTITY,
      );
      if (externalActive.length === 0) {
        throw new BadRequestException(
          'No internal-pharmacy items left to dispense',
        );
      }
      await this.prisma.prescriptions.update({
        where: { PRESCRIPTION_ID: id },
        data: {
          STATUS: 'Dispensed',
          ...(dto.pharmacyNotes !== undefined
            ? { PHARMACY_NOTES: dto.pharmacyNotes }
            : {}),
          UPDATED_BY_ID: actor?.id ?? null,
          UPDATED_BY: label,
          UPDATED_DATE: now,
        },
      });
      await this.audit.log({
        type: 'pharmacy:dispense',
        entity: 'prescriptions',
        entityId: id,
        personId: existing.PERSON_ID,
        userId: actor?.id,
        createdBy: label,
        item: `Dispensed ${existing.RX_NO} (external / non-stock lines only)`,
        oldValue: toResponse(existing),
      });
      return this.findById(id);
    }

    for (const line of lines) {
      if (line.qty > line.remaining) {
        throw new BadRequestException(
          `Item ${line.row.ITEM_ID}: cannot dispense ${line.qty} (only ${line.remaining} remaining)`,
        );
      }
    }

    await this.prisma.$transaction(async (tx) => {
      for (const line of lines) {
        let remaining = line.qty;
        const batches = await tx.drugBatches.findMany({
          where: {
            DRUG_ID: line.row.DRUG_ID,
            STATUS: 'Available',
            QTY_AVAILABLE: { gt: 0 },
          },
          orderBy: [{ EXPIRY_DATE: 'asc' }, { BATCH_ID: 'asc' }],
        });
        const availableTotal = batches.reduce((s, b) => s + b.QTY_AVAILABLE, 0);
        if (availableTotal < remaining) {
          throw new BadRequestException(
            `Insufficient stock for ${line.row.DRUG_NAME}: need ${remaining}, available ${availableTotal}. Receive stock (GRN) or adjust inventory before dispensing.`,
          );
        }
        for (const batch of batches) {
          if (remaining <= 0) break;
          const take = Math.min(batch.QTY_AVAILABLE, remaining);
          remaining -= take;
          await tx.drugBatches.update({
            where: { BATCH_ID: batch.BATCH_ID },
            data: {
              QTY_AVAILABLE: { decrement: take },
              UPDATED_BY_ID: actor?.id ?? null,
              UPDATED_BY: label,
              UPDATED_DATE: now,
            },
          });
        }

        const newQtyDispensed = line.row.QTY_DISPENSED + line.qty;
        await tx.prescriptionItems.update({
          where: { ITEM_ID: line.row.ITEM_ID },
          data: {
            QTY_DISPENSED: newQtyDispensed,
            LINE_STATUS:
              newQtyDispensed >= line.row.QUANTITY ? 'Dispensed' : 'Active',
          },
        });
      }

      const refreshed = await tx.prescriptionItems.findMany({
        where: { PRESCRIPTION_ID: id },
      });
      const internal = refreshed.filter(
        (i) => i.SOURCE === 'Internal Pharmacy' && i.LINE_STATUS !== 'Cancelled',
      );
      const allDone =
        internal.length > 0 &&
        internal.every((i) => i.QTY_DISPENSED >= i.QUANTITY);
      const anyDone = internal.some((i) => i.QTY_DISPENSED > 0);

      await tx.prescriptions.update({
        where: { PRESCRIPTION_ID: id },
        data: {
          STATUS: allDone
            ? 'Dispensed'
            : anyDone
              ? 'Partially Dispensed'
              : existing.STATUS,
          ...(dto.pharmacyNotes !== undefined
            ? { PHARMACY_NOTES: dto.pharmacyNotes }
            : {}),
          UPDATED_BY_ID: actor?.id ?? null,
          UPDATED_BY: label,
          UPDATED_DATE: now,
        },
      });
    });

    const after = await this.prisma.prescriptions.findUnique({
      where: { PRESCRIPTION_ID: id },
      include: ITEM_INCLUDE,
    });
    if (!after) throw new NotFoundException('Prescription not found');
    const snapshot = toResponse(after);

    await this.audit.log({
      type: 'pharmacy:dispense',
      entity: 'prescriptions',
      entityId: id,
      personId: existing.PERSON_ID,
      userId: actor?.id,
      createdBy: label,
      item: `Dispensed ${snapshot.rxNo}: ${lines
        .map((l) => `${l.row.DRUG_NAME} × ${l.qty}`)
        .join(', ')}`,
      oldValue: toResponse(existing),
      newValue: snapshot,
    });

    return this.findById(id);
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
