import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import type { AuthUser } from '../auth/types/auth-user.type';

export type SupplierDrugRef = {
  drugId: number;
  name: string;
};

export type SupplierResponse = {
  supplierId: number;
  name: string;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  /** IDs of catalog drugs this supplier supplies (source of truth). */
  drugIds: number[];
  /** Joined drug names for display — never stored on the supplier row. */
  drugs: SupplierDrugRef[];
  performance: number;
  status: string;
  notes: string | null;
  createdBy: string | null;
  createdAt: string | null;
};

type SupplierRow = {
  SUPPLIER_ID: number;
  NAME: string;
  CONTACT_PERSON: string | null;
  PHONE: string | null;
  EMAIL: string | null;
  ADDRESS: string | null;
  PERFORMANCE: number;
  STATUS: string;
  NOTES: string | null;
  CREATED_BY: string | null;
  CREATED_DATE: Date | null;
  suppliedDrugs?: { DRUG_ID: number; drug: { NAME: string; STRENGTH: string | null } }[];
};

const SUPPLIED_DRUGS_INCLUDE = {
  suppliedDrugs: {
    select: {
      DRUG_ID: true,
      drug: { select: { NAME: true, STRENGTH: true } },
    },
  },
} as const;

function actorLabel(actor?: AuthUser): string {
  if (!actor) return 'SYSTEM';
  const name = [actor.firstName, actor.lastName].filter(Boolean).join(' ');
  return name || actor.email;
}

function toResponse(row: SupplierRow): SupplierResponse {
  const supplied = row.suppliedDrugs ?? [];
  return {
    supplierId: row.SUPPLIER_ID,
    name: row.NAME,
    contactPerson: row.CONTACT_PERSON,
    phone: row.PHONE,
    email: row.EMAIL,
    address: row.ADDRESS,
    drugIds: supplied.map((s) => s.DRUG_ID),
    drugs: supplied.map((s) => ({
      drugId: s.DRUG_ID,
      name: [s.drug.NAME, s.drug.STRENGTH].filter(Boolean).join(' '),
    })),
    performance: row.PERFORMANCE,
    status: row.STATUS,
    notes: row.NOTES,
    createdBy: row.CREATED_BY,
    createdAt: row.CREATED_DATE?.toISOString() ?? null,
  };
}

@Injectable()
export class SuppliersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Throws 400 if any of the given drug IDs is not in the catalog. */
  private async assertDrugsExist(drugIds: number[]): Promise<void> {
    if (drugIds.length === 0) return;
    const found = await this.prisma.drugs.findMany({
      where: { DRUG_ID: { in: drugIds } },
      select: { DRUG_ID: true },
    });
    const foundIds = new Set(found.map((d) => d.DRUG_ID));
    const missing = drugIds.filter((id) => !foundIds.has(id));
    if (missing.length > 0) {
      throw new BadRequestException(
        `Unknown drug id(s): ${missing.join(', ')} — add the drug to the catalog first`,
      );
    }
  }

  async create(dto: CreateSupplierDto, actor?: AuthUser): Promise<SupplierResponse> {
    const name = dto.name.trim();
    const duplicate = await this.prisma.suppliers.findFirst({
      where: { NAME: { equals: name, mode: 'insensitive' }, STATUS: 'Active' },
    });
    if (duplicate) {
      throw new ConflictException({
        message: 'A supplier with this name already exists',
        existingSupplierId: duplicate.SUPPLIER_ID,
      });
    }

    const drugIds = [...new Set(dto.drugIds ?? [])];
    await this.assertDrugsExist(drugIds);

    const created = await this.prisma.suppliers.create({
      data: {
        NAME: name,
        CONTACT_PERSON: dto.contactPerson ?? null,
        PHONE: dto.phone ?? null,
        EMAIL: dto.email ?? null,
        ADDRESS: dto.address ?? null,
        PERFORMANCE: dto.performance ?? 0,
        NOTES: dto.notes ?? null,
        STATUS: 'Active',
        CREATED_BY_ID: actor?.id ?? null,
        CREATED_BY: actorLabel(actor),
        CREATED_DATE: new Date(),
        ...(drugIds.length
          ? { suppliedDrugs: { create: drugIds.map((id) => ({ DRUG_ID: id })) } }
          : {}),
      },
      include: SUPPLIED_DRUGS_INCLUDE,
    });

    const response = toResponse(created);

    await this.audit.log({
      type: 'supplier:create',
      entity: 'suppliers',
      entityId: created.SUPPLIER_ID,
      userId: actor?.id,
      createdBy: actorLabel(actor),
      item: `Supplier added: ${created.NAME} (${response.drugIds.length} drugs)`,
      newValue: response,
    });

    return response;
  }

  async list(params?: {
    q?: string;
    status?: string;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(params?.page ?? 1, 1);
    const limit = Math.min(Math.max(params?.limit ?? 50, 1), 100);
    const status = params?.status && params.status !== 'all' ? params.status : undefined;

    const where = {
      ...(status ? { STATUS: status } : {}),
      ...(params?.q
        ? {
            OR: [
              { NAME: { contains: params.q, mode: 'insensitive' as const } },
              { CONTACT_PERSON: { contains: params.q, mode: 'insensitive' as const } },
              { EMAIL: { contains: params.q, mode: 'insensitive' as const } },
              {
                suppliedDrugs: {
                  some: {
                    drug: { NAME: { contains: params.q, mode: 'insensitive' as const } },
                  },
                },
              },
            ],
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.suppliers.findMany({
        where,
        include: SUPPLIED_DRUGS_INCLUDE,
        orderBy: { NAME: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.suppliers.count({ where }),
    ]);

    return { items: rows.map(toResponse), meta: { page, limit, total } };
  }

  async findById(id: number): Promise<SupplierResponse> {
    const row = await this.prisma.suppliers.findUnique({
      where: { SUPPLIER_ID: id },
      include: SUPPLIED_DRUGS_INCLUDE,
    });
    if (!row) throw new NotFoundException('Supplier not found');
    return toResponse(row);
  }

  async update(
    id: number,
    dto: UpdateSupplierDto,
    actor?: AuthUser,
  ): Promise<SupplierResponse> {
    const existing = await this.prisma.suppliers.findUnique({
      where: { SUPPLIER_ID: id },
      include: SUPPLIED_DRUGS_INCLUDE,
    });
    if (!existing) throw new NotFoundException('Supplier not found');

    const drugIds =
      dto.drugIds !== undefined ? [...new Set(dto.drugIds)] : undefined;
    if (drugIds !== undefined) await this.assertDrugsExist(drugIds);

    const updated = await this.prisma.suppliers.update({
      where: { SUPPLIER_ID: id },
      data: {
        ...(dto.name !== undefined ? { NAME: dto.name.trim() } : {}),
        ...(dto.contactPerson !== undefined ? { CONTACT_PERSON: dto.contactPerson } : {}),
        ...(dto.phone !== undefined ? { PHONE: dto.phone } : {}),
        ...(dto.email !== undefined ? { EMAIL: dto.email } : {}),
        ...(dto.address !== undefined ? { ADDRESS: dto.address } : {}),
        ...(dto.performance !== undefined ? { PERFORMANCE: dto.performance } : {}),
        ...(dto.notes !== undefined ? { NOTES: dto.notes } : {}),
        ...(dto.status !== undefined ? { STATUS: dto.status } : {}),
        ...(drugIds !== undefined
          ? {
              suppliedDrugs: {
                deleteMany: {},
                create: drugIds.map((drugId) => ({ DRUG_ID: drugId })),
              },
            }
          : {}),
        UPDATED_BY_ID: actor?.id ?? null,
        UPDATED_BY: actorLabel(actor),
        UPDATED_DATE: new Date(),
      },
      include: SUPPLIED_DRUGS_INCLUDE,
    });

    await this.audit.log({
      type: 'supplier:update',
      entity: 'suppliers',
      entityId: id,
      userId: actor?.id,
      createdBy: actorLabel(actor),
      item: `Supplier updated: ${updated.NAME}`,
      oldValue: toResponse(existing),
      newValue: toResponse(updated),
    });

    return toResponse(updated);
  }
}
