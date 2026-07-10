import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type AuditLogInput = {
  type: string;
  item?: string;
  entity?: string;
  entityId?: string | number;
  personId?: number | null;
  userId?: number | null;
  branchId?: number | null;
  status?: string;
  createdBy?: string;
  newValue?: unknown;
  oldValue?: unknown;
};

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(input: AuditLogInput) {
    return this.prisma.audits.create({
      data: {
        AUDIT_TYPE: input.type,
        ITEM: input.item ?? input.type,
        ENTITY: input.entity ?? null,
        ENTITY_ID: input.entityId != null ? String(input.entityId) : null,
        PERSON_ID: input.personId ?? null,
        USER_ID: input.userId ?? null,
        BRANCH_ID: input.branchId ?? null,
        STATUS: input.status ?? 'Success',
        CREATED_BY: input.createdBy ?? 'SYSTEM',
        CREATE_DATE: new Date(),
        NEW_VALUE:
          input.newValue === undefined
            ? null
            : typeof input.newValue === 'string'
              ? input.newValue
              : JSON.stringify(input.newValue),
        OLD_VALUE:
          input.oldValue === undefined
            ? null
            : typeof input.oldValue === 'string'
              ? input.oldValue
              : JSON.stringify(input.oldValue),
      },
    });
  }

  async list(params?: {
    type?: string;
    personId?: number;
    userId?: number;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(params?.page ?? 1, 1);
    const limit = Math.min(Math.max(params?.limit ?? 50, 1), 200);
    const where = {
      ...(params?.type ? { AUDIT_TYPE: params.type } : {}),
      ...(params?.personId != null ? { PERSON_ID: params.personId } : {}),
      ...(params?.userId != null ? { USER_ID: params.userId } : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.audits.findMany({
        where,
        orderBy: { CREATE_DATE: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.audits.count({ where }),
    ]);

    return {
      items: rows.map((r) => ({
        auditId: r.AUDIT_ID,
        type: r.AUDIT_TYPE,
        item: r.ITEM,
        entity: r.ENTITY,
        entityId: r.ENTITY_ID,
        status: r.STATUS,
        personId: r.PERSON_ID,
        userId: r.USER_ID,
        createdBy: r.CREATED_BY,
        createdAt: r.CREATE_DATE?.toISOString() ?? null,
        newValue: r.NEW_VALUE,
        oldValue: r.OLD_VALUE,
      })),
      meta: { page, limit, total },
    };
  }
}
