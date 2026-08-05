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
  ApprovalDecisionDto,
  CreateDepartmentDto,
  CreateMasterServiceDto,
  CreateServicePayerDto,
  SetServicePricingDto,
  UpdateMasterServiceDto,
  UpdateServicePayerDto,
} from './dto/service-catalog.dto';
import {
  REGISTRATION_CHARGE_DEFINITIONS,
  type RegistrationChargesResult,
} from '../records/registration-charge.constants';

function actorLabel(actor?: AuthUser): string {
  if (!actor) return 'SYSTEM';
  const name = [actor.firstName, actor.lastName].filter(Boolean).join(' ');
  return name || actor.email || 'SYSTEM';
}

function dec(n: number | string | Prisma.Decimal | null | undefined): number | null {
  if (n == null) return null;
  return Number(n);
}

const SERVICE_INCLUDE = {
  category: true,
  department: true,
  bookingSettings: true,
  payerPrices: {
    where: { STATUS: 'Active', EFFECTIVE_TO: null },
    include: { payer: true },
    orderBy: { PAYER_PRICE_ID: 'asc' as const },
  },
  approvals: {
    orderBy: { CREATED_DATE: 'desc' as const },
    take: 20,
  },
} satisfies Prisma.MasterServicesInclude;

type MasterServiceRow = Prisma.MasterServicesGetPayload<{
  include: typeof SERVICE_INCLUDE;
}>;

function normalizeHhMm(value: string | undefined, fallback: string): string {
  if (!value?.trim()) return fallback;
  const v = value.trim();
  if (!/^\d{2}:\d{2}$/.test(v)) {
    throw new BadRequestException(`Invalid time format (expected HH:mm): ${v}`);
  }
  return v;
}

function resolveDeliveryMode(
  mode: string | undefined,
  onlineBookable: boolean,
): string {
  if (mode && ['PHYSICAL', 'ONLINE', 'BOTH'].includes(mode)) return mode;
  return onlineBookable ? 'BOTH' : 'PHYSICAL';
}

@Injectable()
export class ServiceCatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private toBookingSettings(row: MasterServiceRow) {
    const s = row.bookingSettings;
    return {
      onlineBookable: s?.ONLINE_BOOKABLE ?? row.ONLINE_BOOKABLE,
      deliveryMode: s?.DELIVERY_MODE ?? (row.ONLINE_BOOKABLE ? 'BOTH' : 'PHYSICAL'),
      durationMinutes: s?.DURATION_MINUTES ?? row.DURATION_MINUTES ?? 30,
      dayStart: s?.DAY_START ?? '08:00',
      dayEnd: s?.DAY_END ?? '17:00',
    };
  }

  private toServiceResponse(row: MasterServiceRow) {
    const bookingSettings = this.toBookingSettings(row);
    return {
      serviceId: row.SERVICE_ID,
      serviceCode: row.SERVICE_CODE,
      categoryId: row.CATEGORY_ID,
      categoryCode: row.category.CODE,
      categoryName: row.category.NAME,
      departmentId: row.DEPARTMENT_ID,
      departmentCode: row.department.CODE,
      departmentName: row.department.NAME,
      name: row.NAME,
      description: row.DESCRIPTION,
      durationMinutes: bookingSettings.durationMinutes,
      generalPrice: dec(row.GENERAL_PRICE),
      staffPrice: dec(row.STAFF_PRICE),
      onlineBookable: bookingSettings.onlineBookable,
      appointmentRequired: row.APPOINTMENT_REQUIRED,
      requiresDoctorOrder: row.REQUIRES_DOCTOR_ORDER,
      insuranceEligible: row.INSURANCE_ELIGIBLE,
      ageRestriction: row.AGE_RESTRICTION,
      genderRestriction: row.GENDER_RESTRICTION,
      status: row.STATUS,
      createdBy: row.CREATED_BY,
      createdAt: row.CREATED_DATE?.toISOString() ?? null,
      updatedBy: row.UPDATED_BY,
      updatedAt: row.UPDATED_DATE?.toISOString() ?? null,
      bookingSettings,
      payerPrices: row.payerPrices.map((p) => ({
        payerPriceId: p.PAYER_PRICE_ID,
        payerId: p.PAYER_ID,
        payerType: p.payer.PAYER_TYPE,
        payerCode: p.payer.CODE,
        payerName: p.payer.NAME,
        amount: Number(p.AMOUNT),
        effectiveFrom: p.EFFECTIVE_FROM.toISOString(),
        status: p.STATUS,
      })),
      recentApprovals: row.approvals.map((a) => ({
        approvalId: a.APPROVAL_ID,
        action: a.ACTION,
        actorLabel: a.ACTOR_LABEL,
        notes: a.NOTES,
        priceSnapshot: a.PRICE_SNAPSHOT,
        createdAt: a.CREATED_DATE.toISOString(),
      })),
    };
  }

  async listCategories() {
    const rows = await this.prisma.serviceCategories.findMany({
      where: { STATUS: 'Active' },
      orderBy: { NAME: 'asc' },
    });
    return {
      items: rows.map((r) => ({
        categoryId: r.CATEGORY_ID,
        code: r.CODE,
        name: r.NAME,
        status: r.STATUS,
      })),
    };
  }

  async listDepartments(params?: { status?: string; q?: string }) {
    const where: Prisma.DepartmentsWhereInput = {
      ...(params?.status ? { STATUS: params.status } : {}),
      ...(params?.q
        ? {
            OR: [
              { NAME: { contains: params.q, mode: 'insensitive' } },
              { CODE: { contains: params.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const rows = await this.prisma.departments.findMany({
      where,
      orderBy: { NAME: 'asc' },
    });
    return {
      items: rows.map((r) => ({
        departmentId: r.DEPARTMENT_ID,
        name: r.NAME,
        code: r.CODE,
        status: r.STATUS,
      })),
    };
  }

  async createDepartment(dto: CreateDepartmentDto, actor?: AuthUser) {
    const code = dto.code?.trim().toUpperCase() || null;
    if (code) {
      const existing = await this.prisma.departments.findUnique({
        where: { CODE: code },
      });
      if (existing) {
        throw new BadRequestException(`Department code already exists: ${code}`);
      }
    }
    const now = new Date();
    const label = actorLabel(actor);
    const row = await this.prisma.departments.create({
      data: {
        NAME: dto.name.trim(),
        CODE: code,
        STATUS: 'Active',
        CREATED_BY: label,
        CREATED_DATE: now,
        UPDATED_BY: label,
        UPDATED_DATE: now,
      },
    });
    await this.audit.log({
      type: 'service:department-create',
      entity: 'departments',
      entityId: row.DEPARTMENT_ID,
      userId: actor?.id,
      createdBy: label,
      item: `Department created: ${row.NAME}`,
      newValue: { departmentId: row.DEPARTMENT_ID, name: row.NAME, code: row.CODE },
    });
    return {
      departmentId: row.DEPARTMENT_ID,
      name: row.NAME,
      code: row.CODE,
      status: row.STATUS,
    };
  }

  async listServices(params: {
    categoryId?: number;
    departmentId?: number;
    status?: string;
    q?: string;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(params.page ?? 1, 1);
    const limit = Math.min(Math.max(params.limit ?? 50, 1), 200);
    const where: Prisma.MasterServicesWhereInput = {
      ...(params.categoryId != null ? { CATEGORY_ID: params.categoryId } : {}),
      ...(params.departmentId != null
        ? { DEPARTMENT_ID: params.departmentId }
        : {}),
      ...(params.status ? { STATUS: params.status } : {}),
      ...(params.q
        ? {
            OR: [
              { NAME: { contains: params.q, mode: 'insensitive' } },
              { SERVICE_CODE: { contains: params.q, mode: 'insensitive' } },
              { DESCRIPTION: { contains: params.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.masterServices.count({ where }),
      this.prisma.masterServices.findMany({
        where,
        include: SERVICE_INCLUDE,
        orderBy: [{ STATUS: 'asc' }, { NAME: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      items: rows.map((r) => this.toServiceResponse(r)),
      meta: { total, page, limit, pageCount: Math.ceil(total / limit) || 1 },
    };
  }

  async listOrderable(params?: {
    categoryId?: number;
    departmentId?: number;
    q?: string;
  }) {
    return this.listServices({
      ...params,
      status: 'ACTIVE',
      page: 1,
      limit: 500,
    });
  }

  /**
   * Public landing catalog: ACTIVE + ONLINE_BOOKABLE only.
   * Omits staff/payer pricing internals.
   */
  async listBookable(params?: { q?: string; categoryId?: number }) {
    const where: Prisma.MasterServicesWhereInput = {
      STATUS: 'ACTIVE',
      ONLINE_BOOKABLE: true,
      ...(params?.categoryId != null ? { CATEGORY_ID: params.categoryId } : {}),
      ...(params?.q
        ? {
            OR: [
              { NAME: { contains: params.q, mode: 'insensitive' } },
              { SERVICE_CODE: { contains: params.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const rows = await this.prisma.masterServices.findMany({
      where,
      include: {
        category: true,
        department: true,
        bookingSettings: true,
      },
      orderBy: [{ NAME: 'asc' }],
      take: 500,
    });

    return {
      items: rows.map((r) => {
        const settings = r.bookingSettings;
        return {
          serviceId: r.SERVICE_ID,
          serviceCode: r.SERVICE_CODE,
          name: r.NAME,
          categoryName: r.category.NAME,
          categoryCode: r.category.CODE,
          departmentName: r.department.NAME,
          departmentCode: r.department.CODE,
          generalPrice: dec(r.GENERAL_PRICE),
          durationMinutes:
            settings?.DURATION_MINUTES ?? r.DURATION_MINUTES ?? 30,
          deliveryMode:
            settings?.DELIVERY_MODE ??
            (r.ONLINE_BOOKABLE ? 'BOTH' : 'PHYSICAL'),
          dayStart: settings?.DAY_START ?? '08:00',
          dayEnd: settings?.DAY_END ?? '17:00',
          appointmentRequired: r.APPOINTMENT_REQUIRED,
        };
      }),
    };
  }

  async findById(id: number) {
    const row = await this.prisma.masterServices.findUnique({
      where: { SERVICE_ID: id },
      include: SERVICE_INCLUDE,
    });
    if (!row) throw new NotFoundException('Service not found');
    return this.toServiceResponse(row);
  }

  private async nextServiceCode(categoryCode: string): Promise<string> {
    const prefix = `SVC-${categoryCode.slice(0, 8).toUpperCase()}-`;
    const latest = await this.prisma.masterServices.findFirst({
      where: { SERVICE_CODE: { startsWith: prefix } },
      orderBy: { SERVICE_CODE: 'desc' },
      select: { SERVICE_CODE: true },
    });
    let seq = 1;
    if (latest?.SERVICE_CODE) {
      const tail = latest.SERVICE_CODE.slice(prefix.length);
      const n = Number.parseInt(tail, 10);
      if (!Number.isNaN(n)) seq = n + 1;
    }
    return `${prefix}${String(seq).padStart(4, '0')}`;
  }

  async createService(dto: CreateMasterServiceDto, actor?: AuthUser) {
    const category = await this.prisma.serviceCategories.findUnique({
      where: { CATEGORY_ID: dto.categoryId },
    });
    if (!category || category.STATUS !== 'Active') {
      throw new BadRequestException('Invalid or inactive category');
    }
    const department = await this.prisma.departments.findUnique({
      where: { DEPARTMENT_ID: dto.departmentId },
    });
    if (!department || department.STATUS !== 'Active') {
      throw new BadRequestException('Invalid or inactive department');
    }

    const now = new Date();
    const label = actorLabel(actor);
    const serviceCode = await this.nextServiceCode(category.CODE);
    const onlineBookable = dto.onlineBookable ?? false;
    const durationMinutes = dto.durationMinutes ?? 30;
    const deliveryMode = resolveDeliveryMode(dto.deliveryMode, onlineBookable);
    const dayStart = normalizeHhMm(dto.dayStart, '08:00');
    const dayEnd = normalizeHhMm(dto.dayEnd, '17:00');

    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.masterServices.create({
        data: {
          SERVICE_CODE: serviceCode,
          CATEGORY_ID: dto.categoryId,
          DEPARTMENT_ID: dto.departmentId,
          NAME: dto.name.trim(),
          DESCRIPTION: dto.description?.trim() ?? null,
          DURATION_MINUTES: durationMinutes,
          ONLINE_BOOKABLE: onlineBookable,
          APPOINTMENT_REQUIRED: dto.appointmentRequired ?? false,
          REQUIRES_DOCTOR_ORDER: dto.requiresDoctorOrder ?? true,
          INSURANCE_ELIGIBLE: dto.insuranceEligible ?? true,
          AGE_RESTRICTION: dto.ageRestriction?.trim() ?? null,
          GENDER_RESTRICTION: dto.genderRestriction?.trim() ?? null,
          STATUS: 'PENDING_PRICING',
          CREATED_BY_ID: actor?.id ?? null,
          CREATED_BY: label,
          CREATED_DATE: now,
          UPDATED_BY_ID: actor?.id ?? null,
          UPDATED_BY: label,
          UPDATED_DATE: now,
          bookingSettings: {
            create: {
              ONLINE_BOOKABLE: onlineBookable,
              DELIVERY_MODE: deliveryMode,
              DURATION_MINUTES: durationMinutes,
              DAY_START: dayStart,
              DAY_END: dayEnd,
              CREATED_BY: label,
              CREATED_DATE: now,
              UPDATED_BY: label,
              UPDATED_DATE: now,
            },
          },
        },
        include: SERVICE_INCLUDE,
      });
      return created;
    });

    const response = this.toServiceResponse(row);
    await this.audit.log({
      type: 'service:create',
      entity: 'master_services',
      entityId: row.SERVICE_ID,
      userId: actor?.id,
      createdBy: label,
      item: `Service created (no price): ${row.SERVICE_CODE}`,
      newValue: response,
    });
    return response;
  }

  async updateService(
    id: number,
    dto: UpdateMasterServiceDto,
    actor?: AuthUser,
  ) {
    const existing = await this.prisma.masterServices.findUnique({
      where: { SERVICE_ID: id },
    });
    if (!existing) throw new NotFoundException('Service not found');

    if (dto.categoryId != null) {
      const category = await this.prisma.serviceCategories.findUnique({
        where: { CATEGORY_ID: dto.categoryId },
      });
      if (!category || category.STATUS !== 'Active') {
        throw new BadRequestException('Invalid or inactive category');
      }
    }
    if (dto.departmentId != null) {
      const department = await this.prisma.departments.findUnique({
        where: { DEPARTMENT_ID: dto.departmentId },
      });
      if (!department || department.STATUS !== 'Active') {
        throw new BadRequestException('Invalid or inactive department');
      }
    }

    const now = new Date();
    const label = actorLabel(actor);
    const settingsTouch =
      dto.onlineBookable != null ||
      dto.deliveryMode != null ||
      dto.durationMinutes !== undefined ||
      dto.dayStart != null ||
      dto.dayEnd != null;

    const row = await this.prisma.$transaction(async (tx) => {
      let onlineBookable = existing.ONLINE_BOOKABLE;
      let durationMinutes = existing.DURATION_MINUTES ?? 30;
      if (dto.onlineBookable != null) onlineBookable = dto.onlineBookable;
      if (dto.durationMinutes !== undefined) {
        durationMinutes = dto.durationMinutes ?? 30;
      }
      const deliveryMode = resolveDeliveryMode(
        dto.deliveryMode,
        onlineBookable,
      );
      const dayStart = normalizeHhMm(dto.dayStart, '08:00');
      const dayEnd = normalizeHhMm(dto.dayEnd, '17:00');

      if (settingsTouch) {
        await tx.serviceBookingSettings.upsert({
          where: { SERVICE_ID: id },
          create: {
            SERVICE_ID: id,
            ONLINE_BOOKABLE: onlineBookable,
            DELIVERY_MODE: deliveryMode,
            DURATION_MINUTES: durationMinutes,
            DAY_START: dayStart,
            DAY_END: dayEnd,
            CREATED_BY: label,
            CREATED_DATE: now,
            UPDATED_BY: label,
            UPDATED_DATE: now,
          },
          update: {
            ...(dto.onlineBookable != null
              ? { ONLINE_BOOKABLE: dto.onlineBookable }
              : {}),
            ...(dto.deliveryMode != null
              ? { DELIVERY_MODE: deliveryMode }
              : {}),
            ...(dto.durationMinutes !== undefined
              ? { DURATION_MINUTES: durationMinutes }
              : {}),
            ...(dto.dayStart != null ? { DAY_START: dayStart } : {}),
            ...(dto.dayEnd != null ? { DAY_END: dayEnd } : {}),
            UPDATED_BY: label,
            UPDATED_DATE: now,
          },
        });
      }

      return tx.masterServices.update({
        where: { SERVICE_ID: id },
        data: {
          ...(dto.categoryId != null ? { CATEGORY_ID: dto.categoryId } : {}),
          ...(dto.departmentId != null
            ? { DEPARTMENT_ID: dto.departmentId }
            : {}),
          ...(dto.name != null ? { NAME: dto.name.trim() } : {}),
          ...(dto.description !== undefined
            ? { DESCRIPTION: dto.description?.trim() ?? null }
            : {}),
          ...(dto.durationMinutes !== undefined
            ? { DURATION_MINUTES: durationMinutes }
            : {}),
          ...(dto.onlineBookable != null
            ? { ONLINE_BOOKABLE: onlineBookable }
            : {}),
          ...(dto.appointmentRequired != null
            ? { APPOINTMENT_REQUIRED: dto.appointmentRequired }
            : {}),
          ...(dto.requiresDoctorOrder != null
            ? { REQUIRES_DOCTOR_ORDER: dto.requiresDoctorOrder }
            : {}),
          ...(dto.insuranceEligible != null
            ? { INSURANCE_ELIGIBLE: dto.insuranceEligible }
            : {}),
          ...(dto.ageRestriction !== undefined
            ? { AGE_RESTRICTION: dto.ageRestriction?.trim() ?? null }
            : {}),
          ...(dto.genderRestriction !== undefined
            ? { GENDER_RESTRICTION: dto.genderRestriction?.trim() ?? null }
            : {}),
          ...(dto.status != null ? { STATUS: dto.status } : {}),
          UPDATED_BY_ID: actor?.id ?? null,
          UPDATED_BY: label,
          UPDATED_DATE: now,
        },
        include: SERVICE_INCLUDE,
      });
    });

    const response = this.toServiceResponse(row);
    await this.audit.log({
      type: 'service:update',
      entity: 'master_services',
      entityId: id,
      userId: actor?.id,
      createdBy: label,
      item: `Service metadata updated: ${row.SERVICE_CODE}`,
      oldValue: { status: existing.STATUS, name: existing.NAME },
      newValue: response,
    });
    return response;
  }

  private async syncDomainUnitPrices(
    tx: Prisma.TransactionClient,
    serviceId: number,
    generalPrice: number,
  ) {
    await tx.labTests.updateMany({
      where: { SERVICE_ID: serviceId },
      data: { UNIT_PRICE: generalPrice },
    });
    await tx.imagingStudies.updateMany({
      where: { SERVICE_ID: serviceId },
      data: { UNIT_PRICE: generalPrice },
    });
    await tx.admissionBillingItems.updateMany({
      where: { SERVICE_ID: serviceId },
      data: { UNIT_PRICE: generalPrice },
    });
  }

  private async priceSnapshot(serviceId: number) {
    const row = await this.prisma.masterServices.findUnique({
      where: { SERVICE_ID: serviceId },
      include: {
        payerPrices: {
          where: { STATUS: 'Active', EFFECTIVE_TO: null },
          include: { payer: true },
        },
      },
    });
    if (!row) return null;
    return {
      generalPrice: dec(row.GENERAL_PRICE),
      staffPrice: dec(row.STAFF_PRICE),
      payerPrices: row.payerPrices.map((p) => ({
        payerId: p.PAYER_ID,
        payerCode: p.payer.CODE,
        amount: Number(p.AMOUNT),
      })),
    };
  }

  async setPricing(
    id: number,
    dto: SetServicePricingDto,
    actor?: AuthUser,
  ) {
    const existing = await this.prisma.masterServices.findUnique({
      where: { SERVICE_ID: id },
    });
    if (!existing) throw new NotFoundException('Service not found');
    if (existing.STATUS === 'INACTIVE') {
      throw new BadRequestException('Cannot price an inactive service');
    }

    const submit = dto.submitForApproval !== false;
    const now = new Date();
    const label = actorLabel(actor);

    if (dto.payerPrices?.length) {
      const payerIds = [...new Set(dto.payerPrices.map((p) => p.payerId))];
      const payers = await this.prisma.servicePayers.findMany({
        where: { PAYER_ID: { in: payerIds }, STATUS: 'Active' },
      });
      if (payers.length !== payerIds.length) {
        throw new BadRequestException('One or more payers are invalid or inactive');
      }
    }

    const row = await this.prisma.$transaction(async (tx) => {
      if (dto.payerPrices?.length) {
        for (const pp of dto.payerPrices) {
          await tx.servicePayerPrices.updateMany({
            where: {
              SERVICE_ID: id,
              PAYER_ID: pp.payerId,
              STATUS: 'Active',
              EFFECTIVE_TO: null,
            },
            data: {
              STATUS: 'Superseded',
              EFFECTIVE_TO: now,
              UPDATED_BY_ID: actor?.id ?? null,
              UPDATED_BY: label,
              UPDATED_DATE: now,
            },
          });
          await tx.servicePayerPrices.create({
            data: {
              SERVICE_ID: id,
              PAYER_ID: pp.payerId,
              AMOUNT: pp.amount,
              EFFECTIVE_FROM: now,
              STATUS: 'Active',
              CREATED_BY_ID: actor?.id ?? null,
              CREATED_BY: label,
              CREATED_DATE: now,
            },
          });
        }
      }

      await tx.masterServices.update({
        where: { SERVICE_ID: id },
        data: {
          GENERAL_PRICE: dto.generalPrice,
          STAFF_PRICE:
            dto.staffPrice === undefined ? existing.STAFF_PRICE : dto.staffPrice,
          STATUS: submit ? 'PENDING_APPROVAL' : 'PENDING_PRICING',
          UPDATED_BY_ID: actor?.id ?? null,
          UPDATED_BY: label,
          UPDATED_DATE: now,
        },
      });

      await this.syncDomainUnitPrices(tx, id, dto.generalPrice);

      const snapshot = {
        generalPrice: dto.generalPrice,
        staffPrice:
          dto.staffPrice === undefined
            ? dec(existing.STAFF_PRICE)
            : dto.staffPrice,
        payerPrices: dto.payerPrices ?? [],
      };

      await tx.servicePriceApprovals.create({
        data: {
          SERVICE_ID: id,
          ACTION: 'SUBMIT_PRICING',
          ACTOR_USER_ID: actor?.id ?? null,
          ACTOR_LABEL: label,
          NOTES: submit ? 'Pricing submitted for approval' : 'Pricing saved',
          PRICE_SNAPSHOT: snapshot as unknown as Prisma.InputJsonValue,
          CREATED_DATE: now,
        },
      });

      return tx.masterServices.findUniqueOrThrow({
        where: { SERVICE_ID: id },
        include: SERVICE_INCLUDE,
      });
    });

    const response = this.toServiceResponse(row);
    await this.audit.log({
      type: 'service:pricing',
      entity: 'master_services',
      entityId: id,
      userId: actor?.id,
      createdBy: label,
      item: `Service pricing set: ${existing.SERVICE_CODE}`,
      newValue: response,
    });
    return response;
  }

  async submitApproval(id: number, actor?: AuthUser) {
    const existing = await this.prisma.masterServices.findUnique({
      where: { SERVICE_ID: id },
    });
    if (!existing) throw new NotFoundException('Service not found');
    if (existing.GENERAL_PRICE == null) {
      throw new BadRequestException('Set general price before submitting for approval');
    }
    if (
      !['PENDING_PRICING', 'DRAFT', 'REJECTED', 'ACTIVE'].includes(existing.STATUS)
    ) {
      throw new BadRequestException(
        `Cannot submit from status ${existing.STATUS}`,
      );
    }

    const now = new Date();
    const label = actorLabel(actor);
    const snapshot = await this.priceSnapshot(id);

    const row = await this.prisma.$transaction(async (tx) => {
      await tx.servicePriceApprovals.create({
        data: {
          SERVICE_ID: id,
          ACTION: 'SUBMIT_PRICING',
          ACTOR_USER_ID: actor?.id ?? null,
          ACTOR_LABEL: label,
          NOTES: 'Submitted for IT approval',
          PRICE_SNAPSHOT: snapshot as unknown as Prisma.InputJsonValue,
          CREATED_DATE: now,
        },
      });
      return tx.masterServices.update({
        where: { SERVICE_ID: id },
        data: {
          STATUS: 'PENDING_APPROVAL',
          UPDATED_BY_ID: actor?.id ?? null,
          UPDATED_BY: label,
          UPDATED_DATE: now,
        },
        include: SERVICE_INCLUDE,
      });
    });

    const response = this.toServiceResponse(row);
    await this.audit.log({
      type: 'service:submit-approval',
      entity: 'master_services',
      entityId: id,
      userId: actor?.id,
      createdBy: label,
      item: `Service submitted for approval: ${existing.SERVICE_CODE}`,
      newValue: response,
    });
    return response;
  }

  async approve(id: number, dto: ApprovalDecisionDto, actor?: AuthUser) {
    const existing = await this.prisma.masterServices.findUnique({
      where: { SERVICE_ID: id },
    });
    if (!existing) throw new NotFoundException('Service not found');
    if (existing.STATUS !== 'PENDING_APPROVAL') {
      throw new BadRequestException(
        `Only PENDING_APPROVAL services can be approved (current: ${existing.STATUS})`,
      );
    }
    if (existing.GENERAL_PRICE == null) {
      throw new BadRequestException('Service has no general price');
    }

    const now = new Date();
    const label = actorLabel(actor);
    const snapshot = await this.priceSnapshot(id);

    const row = await this.prisma.$transaction(async (tx) => {
      await tx.servicePriceApprovals.create({
        data: {
          SERVICE_ID: id,
          ACTION: 'APPROVE',
          ACTOR_USER_ID: actor?.id ?? null,
          ACTOR_LABEL: label,
          NOTES: dto.notes?.trim() ?? null,
          PRICE_SNAPSHOT: snapshot as unknown as Prisma.InputJsonValue,
          CREATED_DATE: now,
        },
      });
      const updated = await tx.masterServices.update({
        where: { SERVICE_ID: id },
        data: {
          STATUS: 'ACTIVE',
          UPDATED_BY_ID: actor?.id ?? null,
          UPDATED_BY: label,
          UPDATED_DATE: now,
        },
        include: SERVICE_INCLUDE,
      });
      await this.syncDomainUnitPrices(tx, id, Number(existing.GENERAL_PRICE));
      return updated;
    });

    const response = this.toServiceResponse(row);
    await this.audit.log({
      type: 'service:approve',
      entity: 'master_services',
      entityId: id,
      userId: actor?.id,
      createdBy: label,
      item: `Service approved ACTIVE: ${existing.SERVICE_CODE}`,
      newValue: response,
    });
    return response;
  }

  async reject(id: number, dto: ApprovalDecisionDto, actor?: AuthUser) {
    const existing = await this.prisma.masterServices.findUnique({
      where: { SERVICE_ID: id },
    });
    if (!existing) throw new NotFoundException('Service not found');
    if (existing.STATUS !== 'PENDING_APPROVAL') {
      throw new BadRequestException(
        `Only PENDING_APPROVAL services can be rejected (current: ${existing.STATUS})`,
      );
    }

    const now = new Date();
    const label = actorLabel(actor);
    const snapshot = await this.priceSnapshot(id);

    const row = await this.prisma.$transaction(async (tx) => {
      await tx.servicePriceApprovals.create({
        data: {
          SERVICE_ID: id,
          ACTION: 'REJECT',
          ACTOR_USER_ID: actor?.id ?? null,
          ACTOR_LABEL: label,
          NOTES: dto.notes?.trim() || 'Rejected',
          PRICE_SNAPSHOT: snapshot as unknown as Prisma.InputJsonValue,
          CREATED_DATE: now,
        },
      });
      return tx.masterServices.update({
        where: { SERVICE_ID: id },
        data: {
          STATUS: 'REJECTED',
          UPDATED_BY_ID: actor?.id ?? null,
          UPDATED_BY: label,
          UPDATED_DATE: now,
        },
        include: SERVICE_INCLUDE,
      });
    });

    const response = this.toServiceResponse(row);
    await this.audit.log({
      type: 'service:reject',
      entity: 'master_services',
      entityId: id,
      userId: actor?.id,
      createdBy: label,
      item: `Service rejected: ${existing.SERVICE_CODE}`,
      newValue: response,
    });
    return response;
  }

  async listPayers(params?: { payerType?: string; status?: string }) {
    const rows = await this.prisma.servicePayers.findMany({
      where: {
        ...(params?.payerType ? { PAYER_TYPE: params.payerType } : {}),
        ...(params?.status ? { STATUS: params.status } : {}),
      },
      orderBy: [{ PAYER_TYPE: 'asc' }, { NAME: 'asc' }],
    });
    return {
      items: rows.map((r) => ({
        payerId: r.PAYER_ID,
        payerType: r.PAYER_TYPE,
        code: r.CODE,
        name: r.NAME,
        status: r.STATUS,
      })),
    };
  }

  async createPayer(dto: CreateServicePayerDto, actor?: AuthUser) {
    const code = dto.code.trim().toUpperCase();
    const existing = await this.prisma.servicePayers.findUnique({
      where: { CODE: code },
    });
    if (existing) {
      throw new BadRequestException(`Payer code already exists: ${code}`);
    }
    const now = new Date();
    const label = actorLabel(actor);
    const row = await this.prisma.servicePayers.create({
      data: {
        PAYER_TYPE: dto.payerType,
        CODE: code,
        NAME: dto.name.trim(),
        STATUS: 'Active',
        CREATED_BY: label,
        CREATED_DATE: now,
        UPDATED_BY: label,
        UPDATED_DATE: now,
      },
    });
    await this.audit.log({
      type: 'service:payer-create',
      entity: 'service_payers',
      entityId: row.PAYER_ID,
      userId: actor?.id,
      createdBy: label,
      item: `Service payer created: ${row.CODE}`,
      newValue: {
        payerId: row.PAYER_ID,
        payerType: row.PAYER_TYPE,
        code: row.CODE,
        name: row.NAME,
      },
    });
    return {
      payerId: row.PAYER_ID,
      payerType: row.PAYER_TYPE,
      code: row.CODE,
      name: row.NAME,
      status: row.STATUS,
    };
  }

  async updatePayer(
    id: number,
    dto: UpdateServicePayerDto,
    actor?: AuthUser,
  ) {
    const existing = await this.prisma.servicePayers.findUnique({
      where: { PAYER_ID: id },
    });
    if (!existing) throw new NotFoundException('Payer not found');
    const now = new Date();
    const label = actorLabel(actor);
    const row = await this.prisma.servicePayers.update({
      where: { PAYER_ID: id },
      data: {
        ...(dto.name != null ? { NAME: dto.name.trim() } : {}),
        ...(dto.status != null ? { STATUS: dto.status } : {}),
        UPDATED_BY: label,
        UPDATED_DATE: now,
      },
    });
    return {
      payerId: row.PAYER_ID,
      payerType: row.PAYER_TYPE,
      code: row.CODE,
      name: row.NAME,
      status: row.STATUS,
    };
  }

  /**
   * Resolve billable amount for a master service.
   * Order: active payer price (by payerId) → STAFF → GENERAL → error.
   */
  async resolvePrice(
    serviceId: number,
    params?: { payerType?: string; payerId?: number },
  ) {
    const service = await this.prisma.masterServices.findUnique({
      where: { SERVICE_ID: serviceId },
    });
    if (!service) throw new NotFoundException('Service not found');

    const payerType = params?.payerType?.toUpperCase();
    let payerId = params?.payerId;

    if (payerId != null) {
      const payerPrice = await this.prisma.servicePayerPrices.findFirst({
        where: {
          SERVICE_ID: serviceId,
          PAYER_ID: payerId,
          STATUS: 'Active',
          EFFECTIVE_TO: null,
        },
        include: { payer: true },
      });
      if (payerPrice) {
        return {
          serviceId,
          serviceCode: service.SERVICE_CODE,
          amount: Number(payerPrice.AMOUNT),
          source: 'PAYER' as const,
          payerId: payerPrice.PAYER_ID,
          payerType: payerPrice.payer.PAYER_TYPE,
          payerCode: payerPrice.payer.CODE,
        };
      }
    }

    if (
      !payerId &&
      payerType &&
      ['NHIA', 'HMO', 'CORPORATE'].includes(payerType)
    ) {
      const payer = await this.prisma.servicePayers.findFirst({
        where: {
          PAYER_TYPE: payerType,
          STATUS: 'Active',
          ...(payerType === 'NHIA' ? { CODE: 'NHIA-DEFAULT' } : {}),
        },
        orderBy: { PAYER_ID: 'asc' },
      });
      if (payer) {
        payerId = payer.PAYER_ID;
        const payerPrice = await this.prisma.servicePayerPrices.findFirst({
          where: {
            SERVICE_ID: serviceId,
            PAYER_ID: payer.PAYER_ID,
            STATUS: 'Active',
            EFFECTIVE_TO: null,
          },
        });
        if (payerPrice) {
          return {
            serviceId,
            serviceCode: service.SERVICE_CODE,
            amount: Number(payerPrice.AMOUNT),
            source: 'PAYER' as const,
            payerId: payer.PAYER_ID,
            payerType: payer.PAYER_TYPE,
            payerCode: payer.CODE,
          };
        }
      }
    }

    if (payerType === 'STAFF') {
      if (service.STAFF_PRICE == null) {
        throw new BadRequestException('Staff price not set for this service');
      }
      return {
        serviceId,
        serviceCode: service.SERVICE_CODE,
        amount: Number(service.STAFF_PRICE),
        source: 'STAFF' as const,
        payerId: null,
        payerType: 'STAFF',
        payerCode: null,
      };
    }

    if (service.GENERAL_PRICE == null) {
      throw new BadRequestException('Service is not priced (GENERAL_PRICE null)');
    }
    return {
      serviceId,
      serviceCode: service.SERVICE_CODE,
      amount: Number(service.GENERAL_PRICE),
      source: 'GENERAL' as const,
      payerId: null,
      payerType: payerType ?? 'GENERAL',
      payerCode: null,
    };
  }

  /** Lookup an ACTIVE master service by stable SERVICE_CODE. */
  async findActiveByCode(serviceCode: string) {
    const row = await this.prisma.masterServices.findUnique({
      where: { SERVICE_CODE: serviceCode },
    });
    if (!row || row.STATUS !== 'ACTIVE') {
      throw new NotFoundException(
        `Active service not found for code: ${serviceCode}`,
      );
    }
    return row;
  }

  /**
   * Resolve first-time registration charge bundle from Master Services catalog.
   * Used by Records Patient Entry Engine — not editable by front desk staff.
   */
  async resolveRegistrationCharges(params?: {
    payerType?: string;
    payerId?: number;
  }): Promise<RegistrationChargesResult> {
    const items: RegistrationChargesResult['items'] = [];
    const amounts: Record<'regFee' | 'cardFee' | 'consultFee', number> = {
      regFee: 0,
      cardFee: 0,
      consultFee: 0,
    };

    for (const def of REGISTRATION_CHARGE_DEFINITIONS) {
      const service = await this.findActiveByCode(def.code);
      const resolved = await this.resolvePrice(service.SERVICE_ID, {
        payerType: params?.payerType,
        payerId: params?.payerId,
      });
      amounts[def.field] = resolved.amount;
      items.push({
        code: def.code,
        label: def.label,
        amount: resolved.amount,
        serviceId: resolved.serviceId,
        source: resolved.source,
      });
    }

    const total = amounts.regFee + amounts.cardFee + amounts.consultFee;
    return {
      regFee: amounts.regFee,
      cardFee: amounts.cardFee,
      consultFee: amounts.consultFee,
      total,
      items,
    };
  }
}
