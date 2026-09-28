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
  CreateScmGrnDto,
  CreateScmPoDto,
  CreateScmSupplierDto,
  ScmListQueryDto,
  UpdateScmPoDto,
  UpdateScmSupplierDto,
} from './dto/scm.dto';

function actorLabel(user: AuthUser): string {
  return (
    [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email
  );
}

function pagination(page?: number, limit?: number) {
  const p = Math.max(page ?? 1, 1);
  const l = Math.min(Math.max(limit ?? 50, 1), 200);
  return { page: p, limit: l, skip: (p - 1) * l };
}

function padId(id: number): string {
  return String(id).padStart(5, '0');
}

@Injectable()
export class ScmService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async getDashboard() {
    const [openPos, pendingApproval, grnsThisMonth, activeSuppliers] =
      await Promise.all([
        this.prisma.scmPurchaseOrders.count({
          where: { STATUS: { notIn: ['Completed', 'Cancelled'] } },
        }),
        this.prisma.scmPurchaseOrders.count({
          where: { APPROVAL_STATUS: 'Pending' },
        }),
        this.prisma.scmGrns.count({
          where: {
            RECEIVED_DATE: {
              gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
            },
          },
        }),
        this.prisma.scmSuppliers.count({ where: { STATUS: 'Active' } }),
      ]);

    return {
      asOf: new Date().toISOString(),
      openPurchaseOrders: openPos,
      pendingApproval,
      grnsThisMonth,
      activeSuppliers,
    };
  }

  async listSuppliers(query: ScmListQueryDto) {
    const { page, limit, skip } = pagination(query.page, query.limit);
    const where: Prisma.ScmSuppliersWhereInput = {
      STATUS: query.status ?? undefined,
      ...(query.q
        ? { NAME: { contains: query.q, mode: 'insensitive' } }
        : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.scmSuppliers.findMany({
        where,
        orderBy: { NAME: 'asc' },
        skip,
        take: limit,
      }),
      this.prisma.scmSuppliers.count({ where }),
    ]);

    return {
      items: rows.map((s) => ({
        supplierId: s.SUPPLIER_ID,
        name: s.NAME,
        phone: s.PHONE,
        email: s.EMAIL,
        status: s.STATUS,
      })),
      meta: { page, limit, total },
    };
  }

  async createSupplier(dto: CreateScmSupplierDto, user: AuthUser) {
    const row = await this.prisma.scmSuppliers.create({
      data: {
        NAME: dto.name.trim(),
        CONTACT_PERSON: dto.contactPerson?.trim() ?? null,
        PHONE: dto.phone?.trim() ?? null,
        EMAIL: dto.email?.trim() ?? null,
        ADDRESS: dto.address?.trim() ?? null,
        NOTES: dto.notes?.trim() ?? null,
        CREATED_BY_ID: user.id,
        CREATED_BY: actorLabel(user),
      },
    });
    return { supplierId: row.SUPPLIER_ID, name: row.NAME };
  }

  async updateSupplier(
    id: number,
    dto: UpdateScmSupplierDto,
    user: AuthUser,
  ) {
    const existing = await this.prisma.scmSuppliers.findUnique({
      where: { SUPPLIER_ID: id },
    });
    if (!existing) throw new NotFoundException('Supplier not found');

    const updated = await this.prisma.scmSuppliers.update({
      where: { SUPPLIER_ID: id },
      data: {
        ...(dto.name != null ? { NAME: dto.name.trim() } : {}),
        ...(dto.contactPerson !== undefined
          ? { CONTACT_PERSON: dto.contactPerson?.trim() ?? null }
          : {}),
        ...(dto.phone !== undefined ? { PHONE: dto.phone?.trim() ?? null } : {}),
        ...(dto.email !== undefined ? { EMAIL: dto.email?.trim() ?? null } : {}),
        ...(dto.address !== undefined
          ? { ADDRESS: dto.address?.trim() ?? null }
          : {}),
        ...(dto.notes !== undefined ? { NOTES: dto.notes?.trim() ?? null } : {}),
        ...(dto.status != null ? { STATUS: dto.status } : {}),
        UPDATED_BY_ID: user.id,
        UPDATED_BY: actorLabel(user),
        UPDATED_DATE: new Date(),
      },
    });
    return { supplierId: updated.SUPPLIER_ID, status: updated.STATUS };
  }

  async softDeleteSupplier(id: number, user: AuthUser) {
    return this.updateSupplier(id, { status: 'Inactive' }, user);
  }

  async listPurchaseOrders(query: ScmListQueryDto) {
    const { page, limit, skip } = pagination(query.page, query.limit);
    const where: Prisma.ScmPurchaseOrdersWhereInput = {
      ...(query.status ? { STATUS: query.status } : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.scmPurchaseOrders.findMany({
        where,
        include: { supplier: true, lines: true },
        orderBy: { CREATED_DATE: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.scmPurchaseOrders.count({ where }),
    ]);

    return {
      items: rows.map((po) => ({
        poId: po.PO_ID,
        poNo: po.PO_NO,
        supplierName: po.supplier.NAME,
        total: Number(po.TOTAL),
        approvalStatus: po.APPROVAL_STATUS,
        status: po.STATUS,
        lineCount: po.lines.length,
        createdAt: po.CREATED_DATE.toISOString(),
      })),
      meta: { page, limit, total },
    };
  }

  async createPurchaseOrder(dto: CreateScmPoDto, user: AuthUser) {
    const supplier = await this.prisma.scmSuppliers.findUnique({
      where: { SUPPLIER_ID: dto.supplierId },
    });
    if (!supplier || supplier.STATUS !== 'Active') {
      throw new BadRequestException('Supplier is not active');
    }

    const total = dto.lines.reduce(
      (sum, l) => sum + l.qty * l.unitCost,
      0,
    );
    const year = new Date().getFullYear();
    const label = actorLabel(user);

    const po = await this.prisma.$transaction(async (tx) => {
      const header = await tx.scmPurchaseOrders.create({
        data: {
          PO_NO: `SCM-PO-${year}-PENDING`,
          SUPPLIER_ID: dto.supplierId,
          TOTAL: total,
          EXPECTED_DATE: dto.expectedDate
            ? new Date(`${dto.expectedDate.slice(0, 10)}T00:00:00.000Z`)
            : null,
          NOTES: dto.notes?.trim() ?? null,
          CREATED_BY_ID: user.id,
          CREATED_BY: label,
        },
      });

      const withNo = await tx.scmPurchaseOrders.update({
        where: { PO_ID: header.PO_ID },
        data: { PO_NO: `SCM-PO-${year}-${padId(header.PO_ID)}` },
      });

      for (const line of dto.lines) {
        await tx.scmPoLines.create({
          data: {
            PO_ID: withNo.PO_ID,
            ITEM_ID: line.itemId,
            QTY: line.qty,
            UNIT_COST: line.unitCost,
          },
        });
      }

      return withNo;
    });

    return { poId: po.PO_ID, poNo: po.PO_NO, total };
  }

  async updatePurchaseOrder(id: number, dto: UpdateScmPoDto, user: AuthUser) {
    const po = await this.prisma.scmPurchaseOrders.findUnique({
      where: { PO_ID: id },
      include: { lines: true },
    });
    if (!po) throw new NotFoundException('Purchase order not found');
    if (po.APPROVAL_STATUS === 'Approved') {
      throw new BadRequestException('Approved POs cannot be edited');
    }

    let total = Number(po.TOTAL);
    if (dto.lines) {
      total = dto.lines.reduce((sum, l) => sum + l.qty * l.unitCost, 0);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.scmPurchaseOrders.update({
        where: { PO_ID: id },
        data: {
          ...(dto.expectedDate !== undefined
            ? {
                EXPECTED_DATE: dto.expectedDate
                  ? new Date(`${dto.expectedDate.slice(0, 10)}T00:00:00.000Z`)
                  : null,
              }
            : {}),
          ...(dto.notes !== undefined ? { NOTES: dto.notes?.trim() ?? null } : {}),
          TOTAL: total,
          UPDATED_BY_ID: user.id,
          UPDATED_BY: actorLabel(user),
          UPDATED_DATE: new Date(),
        },
      });

      if (dto.lines) {
        await tx.scmPoLines.deleteMany({ where: { PO_ID: id } });
        for (const line of dto.lines) {
          await tx.scmPoLines.create({
            data: {
              PO_ID: id,
              ITEM_ID: line.itemId,
              QTY: line.qty,
              UNIT_COST: line.unitCost,
            },
          });
        }
      }
    });

    return { poId: id, total };
  }

  async approvePurchaseOrder(id: number, user: AuthUser) {
    const po = await this.prisma.scmPurchaseOrders.findUnique({
      where: { PO_ID: id },
    });
    if (!po) throw new NotFoundException('Purchase order not found');
    if (po.APPROVAL_STATUS !== 'Pending') {
      throw new BadRequestException('PO is not pending approval');
    }

    const label = actorLabel(user);
    await this.prisma.scmPurchaseOrders.update({
      where: { PO_ID: id },
      data: {
        APPROVAL_STATUS: 'Approved',
        STATUS: 'Approved',
        APPROVED_BY_ID: user.id,
        APPROVED_BY: label,
        APPROVED_AT: new Date(),
        UPDATED_DATE: new Date(),
      },
    });

    return { poId: id, approvalStatus: 'Approved' };
  }

  async cancelPurchaseOrder(id: number, user: AuthUser) {
    const po = await this.prisma.scmPurchaseOrders.findUnique({
      where: { PO_ID: id },
    });
    if (!po) throw new NotFoundException('Purchase order not found');
    if (po.STATUS === 'Completed') {
      throw new BadRequestException('Completed PO cannot be cancelled');
    }

    await this.prisma.scmPurchaseOrders.update({
      where: { PO_ID: id },
      data: {
        STATUS: 'Cancelled',
        APPROVAL_STATUS:
          po.APPROVAL_STATUS === 'Pending' ? 'Rejected' : po.APPROVAL_STATUS,
        UPDATED_BY_ID: user.id,
        UPDATED_BY: actorLabel(user),
        UPDATED_DATE: new Date(),
      },
    });

    return { poId: id, status: 'Cancelled' };
  }

  async createGrn(dto: CreateScmGrnDto, user: AuthUser) {
    const year = new Date().getFullYear();
    const label = actorLabel(user);

    const grn = await this.prisma.$transaction(async (tx) => {
      const header = await tx.scmGrns.create({
        data: {
          GRN_NO: `SCM-GRN-${year}-PENDING`,
          PO_ID: dto.poId ?? null,
          LOCATION_ID: dto.locationId,
          RECEIVED_BY_ID: user.id,
          RECEIVED_BY: label,
          NOTES: dto.notes?.trim() ?? null,
          CREATED_BY_ID: user.id,
          CREATED_BY: label,
        },
      });

      const withNo = await tx.scmGrns.update({
        where: { GRN_ID: header.GRN_ID },
        data: { GRN_NO: `SCM-GRN-${year}-${padId(header.GRN_ID)}` },
      });

      for (const line of dto.lines) {
        const qtyDamaged = line.qtyDamaged ?? 0;
        const qtyAccepted = line.qtyReceived - qtyDamaged;
        if (qtyAccepted < 0) {
          throw new BadRequestException('Damaged qty exceeds received qty');
        }

        let batchId: number | null = null;
        if (qtyAccepted > 0) {
          const batch = await tx.storeBatches.create({
            data: {
              ITEM_ID: line.itemId,
              LOCATION_ID: dto.locationId,
              BATCH_NO: line.batchNo.trim(),
              EXPIRY_DATE: line.expiryDate
                ? new Date(`${line.expiryDate.slice(0, 10)}T00:00:00.000Z`)
                : null,
              QTY_RECEIVED: qtyAccepted,
              QTY_AVAILABLE: qtyAccepted,
              UNIT_COST: line.unitCost ?? null,
              CREATED_BY_ID: user.id,
              CREATED_BY: label,
            },
          });
          batchId = batch.BATCH_ID;

          await tx.storeMovements.create({
            data: {
              ITEM_ID: line.itemId,
              BATCH_ID: batch.BATCH_ID,
              LOCATION_ID: dto.locationId,
              KIND: 'In',
              QTY: qtyAccepted,
              REF_TYPE: 'grn',
              REF_ID: withNo.GRN_ID,
              ACTOR_ID: user.id,
              ACTOR_LABEL: label,
            },
          });
        }

        await tx.scmGrnLines.create({
          data: {
            GRN_ID: withNo.GRN_ID,
            ITEM_ID: line.itemId,
            PO_LINE_ID: line.poLineId ?? null,
            BATCH_NO: line.batchNo.trim(),
            EXPIRY_DATE: line.expiryDate
              ? new Date(`${line.expiryDate.slice(0, 10)}T00:00:00.000Z`)
              : null,
            QTY_RECEIVED: line.qtyReceived,
            QTY_DAMAGED: qtyDamaged,
            QTY_ACCEPTED: qtyAccepted,
            UNIT_COST: line.unitCost ?? null,
            BATCH_ID: batchId,
          },
        });

        if (line.poLineId && qtyAccepted > 0) {
          await tx.scmPoLines.update({
            where: { LINE_ID: line.poLineId },
            data: { QTY_RECEIVED: { increment: qtyAccepted } },
          });
        }
      }

      if (dto.poId) {
        const poLines = await tx.scmPoLines.findMany({
          where: { PO_ID: dto.poId },
        });
        const fullyReceived = poLines.every((l) => l.QTY_RECEIVED >= l.QTY);
        await tx.scmPurchaseOrders.update({
          where: { PO_ID: dto.poId },
          data: {
            STATUS: fullyReceived ? 'Completed' : 'PartiallyReceived',
          },
        });
      }

      return withNo;
    });

    await this.audit.log({
      type: 'scm:grn:create',
      entity: 'SCM_GRNS',
      entityId: grn.GRN_ID,
      userId: user.id,
      createdBy: label,
    });

    return { grnId: grn.GRN_ID, grnNo: grn.GRN_NO };
  }

  async listGrns(query: ScmListQueryDto) {
    const { page, limit, skip } = pagination(query.page, query.limit);
    const [rows, total] = await Promise.all([
      this.prisma.scmGrns.findMany({
        include: { location: true, lines: true },
        orderBy: { RECEIVED_DATE: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.scmGrns.count(),
    ]);

    return {
      items: rows.map((g) => ({
        grnId: g.GRN_ID,
        grnNo: g.GRN_NO,
        locationName: g.location.NAME,
        lineCount: g.lines.length,
        receivedDate: g.RECEIVED_DATE.toISOString(),
      })),
      meta: { page, limit, total },
    };
  }
}
