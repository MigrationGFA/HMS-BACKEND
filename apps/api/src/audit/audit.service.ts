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
      ...(params?.type
        ? params.type.endsWith('*')
          ? { AUDIT_TYPE: { startsWith: params.type.slice(0, -1) } }
          : params.type.endsWith(':')
            ? { AUDIT_TYPE: { startsWith: params.type } }
            : { AUDIT_TYPE: params.type }
        : {}),
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

  async stats(params?: { timezoneOffsetMinutes?: number }) {
    const offsetMin = params?.timezoneOffsetMinutes ?? 60;
    const now = new Date();
    const localMs = now.getTime() + offsetMin * 60_000;
    const local = new Date(localMs);
    const startLocal = new Date(
      Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()),
    );
    const startOfDay = new Date(startLocal.getTime() - offsetMin * 60_000);
    const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);
    const today = { CREATE_DATE: { gte: startOfDay, lt: endOfDay } };

    const [total, todayCount, emergencyOverrides, noteEdits, prescriptionChanges, flagged] =
      await Promise.all([
        this.prisma.audits.count(),
        this.prisma.audits.count({ where: today }),
        this.prisma.audits.count({
          where: { AUDIT_TYPE: { startsWith: 'emergency:' } },
        }),
        this.prisma.audits.count({
          where: { AUDIT_TYPE: { startsWith: 'clinical-note:' } },
        }),
        this.prisma.audits.count({
          where: { AUDIT_TYPE: { startsWith: 'prescription:' } },
        }),
        this.prisma.audits.count({
          where: {
            OR: [
              { STATUS: { equals: 'Flagged' } },
              { STATUS: { equals: 'Suspicious' } },
              { STATUS: { contains: 'fail', mode: 'insensitive' } },
            ],
          },
        }),
      ]);

    return {
      asOf: now.toISOString(),
      total,
      today: todayCount,
      emergencyOverrides,
      noteEdits,
      prescriptionChanges,
      flagged,
    };
  }
}
