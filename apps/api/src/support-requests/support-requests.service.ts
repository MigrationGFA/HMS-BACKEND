import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../auth/types/auth-user.type';
import {
  permissionsForRoles,
  PERMISSIONS,
} from '../common/constants';
import {
  CreateSupportRequestDto,
  UpdateSupportRequestDto,
} from './dto/support-request.dto';

function actorLabel(user: AuthUser): string {
  return [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email;
}

function roleLabel(user: AuthUser): string {
  return user.roles?.[0] ?? 'Staff';
}

@Injectable()
export class SupportRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private canManageAll(user: AuthUser): boolean {
    return permissionsForRoles(user.roles).has(PERMISSIONS.SUPPORT_UPDATE);
  }

  private notDeleted(): Prisma.SupportRequestsWhereInput {
    return { NOT: { DELETED_FLAG: 'Y' } };
  }

  private async nextRequestNo(): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `SR-${year}-`;
    const latest = await this.prisma.supportRequests.findFirst({
      where: { REQUEST_NO: { startsWith: prefix } },
      orderBy: { REQUEST_NO: 'desc' },
      select: { REQUEST_NO: true },
    });
    let next = 1;
    if (latest?.REQUEST_NO) {
      const n = Number(latest.REQUEST_NO.slice(prefix.length));
      if (Number.isFinite(n) && n >= next) next = n + 1;
    }
    return `${prefix}${String(next).padStart(4, '0')}`;
  }

  private mapRow(row: {
    REQUEST_ID: number;
    REQUEST_NO: string;
    USER_ID: number;
    STAFF_NAME: string;
    ROLE_LABEL: string | null;
    ISSUE_TYPE: string;
    DESCRIPTION: string;
    MODULE: string | null;
    STATUS: string;
    RESOLVED_NOTE: string | null;
    RESOLVED_AT: Date | null;
    RESOLVED_BY: string | null;
    RESOLVED_BY_ID: number | null;
    CREATED_BY: string | null;
    CREATED_DATE: Date | null;
    UPDATED_BY: string | null;
    UPDATED_DATE: Date | null;
  }) {
    return {
      requestId: row.REQUEST_ID,
      requestNo: row.REQUEST_NO,
      userId: row.USER_ID,
      staffName: row.STAFF_NAME,
      roleLabel: row.ROLE_LABEL,
      issueType: row.ISSUE_TYPE,
      description: row.DESCRIPTION,
      module: row.MODULE,
      status: row.STATUS,
      resolvedNote: row.RESOLVED_NOTE,
      resolvedAt: row.RESOLVED_AT?.toISOString() ?? null,
      resolvedBy: row.RESOLVED_BY,
      resolvedById: row.RESOLVED_BY_ID,
      createdBy: row.CREATED_BY,
      createdAt: row.CREATED_DATE?.toISOString() ?? null,
      updatedBy: row.UPDATED_BY,
      updatedAt: row.UPDATED_DATE?.toISOString() ?? null,
    };
  }

  async create(dto: CreateSupportRequestDto, user: AuthUser) {
    const label = actorLabel(user);
    const requestNo = await this.nextRequestNo();
    const now = new Date();

    const row = await this.prisma.supportRequests.create({
      data: {
        REQUEST_NO: requestNo,
        USER_ID: user.id,
        STAFF_NAME: label,
        ROLE_LABEL: roleLabel(user),
        ISSUE_TYPE: dto.issueType,
        DESCRIPTION: dto.description.trim(),
        MODULE: dto.module ?? null,
        STATUS: 'Open',
        CREATED_BY_ID: user.id,
        CREATED_BY: label,
        CREATED_DATE: now,
        DELETED_FLAG: 'N',
      },
    });

    await this.audit.log({
      type: 'support:create',
      item: requestNo,
      entity: 'SupportRequest',
      entityId: row.REQUEST_ID,
      userId: user.id,
      createdBy: label,
      newValue: {
        requestNo,
        issueType: dto.issueType,
        module: dto.module ?? null,
      },
    });

    return this.mapRow(row);
  }

  async list(
    params: {
      mine?: string;
      status?: string;
      q?: string;
      page?: number;
      limit?: number;
    },
    user: AuthUser,
  ) {
    const page = Math.max(params.page ?? 1, 1);
    const limit = Math.min(Math.max(params.limit ?? 50, 1), 200);
    const q = params.q?.trim();
    const manageAll = this.canManageAll(user);
    // HR/admin (support:update): all tickets unless mine=true
    // Everyone else: own tickets only
    const scopeMine = manageAll ? params.mine === 'true' : true;

    const where: Prisma.SupportRequestsWhereInput = {
      ...this.notDeleted(),
      ...(scopeMine ? { USER_ID: user.id } : {}),
      ...(params.status ? { STATUS: params.status } : {}),
      ...(q
        ? {
            OR: [
              { REQUEST_NO: { contains: q, mode: 'insensitive' } },
              { STAFF_NAME: { contains: q, mode: 'insensitive' } },
              { DESCRIPTION: { contains: q, mode: 'insensitive' } },
              { ISSUE_TYPE: { contains: q, mode: 'insensitive' } },
              { MODULE: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.supportRequests.findMany({
        where,
        orderBy: { CREATED_DATE: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.supportRequests.count({ where }),
    ]);

    return {
      items: rows.map((r) => this.mapRow(r)),
      meta: { page, limit, total },
    };
  }

  async findOne(id: number, user: AuthUser) {
    const row = await this.prisma.supportRequests.findFirst({
      where: { REQUEST_ID: id, ...this.notDeleted() },
    });
    if (!row) throw new NotFoundException('Support request not found');
    if (row.USER_ID !== user.id && !this.canManageAll(user)) {
      throw new ForbiddenException('You can only view your own support requests');
    }
    return this.mapRow(row);
  }

  async update(id: number, dto: UpdateSupportRequestDto, user: AuthUser) {
    const existing = await this.prisma.supportRequests.findFirst({
      where: { REQUEST_ID: id, ...this.notDeleted() },
    });
    if (!existing) throw new NotFoundException('Support request not found');

    const label = actorLabel(user);
    const now = new Date();
    const isResolving =
      dto.status === 'Resolved' || dto.status === 'Closed';

    if (
      existing.STATUS === 'Closed' &&
      dto.status !== 'Closed'
    ) {
      throw new BadRequestException('Closed support requests cannot be reopened via this endpoint');
    }

    const row = await this.prisma.supportRequests.update({
      where: { REQUEST_ID: id },
      data: {
        STATUS: dto.status,
        ...(dto.resolvedNote != null
          ? { RESOLVED_NOTE: dto.resolvedNote.trim() || null }
          : {}),
        ...(isResolving
          ? {
              RESOLVED_AT: now,
              RESOLVED_BY: label,
              RESOLVED_BY_ID: user.id,
            }
          : {}),
        UPDATED_BY_ID: user.id,
        UPDATED_BY: label,
        UPDATED_DATE: now,
      },
    });

    await this.audit.log({
      type: 'support:update',
      item: existing.REQUEST_NO,
      entity: 'SupportRequest',
      entityId: id,
      userId: user.id,
      createdBy: label,
      oldValue: { status: existing.STATUS },
      newValue: {
        status: dto.status,
        resolvedNote: dto.resolvedNote ?? null,
      },
    });

    return this.mapRow(row);
  }
}
