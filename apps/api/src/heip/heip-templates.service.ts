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
import {
  CreateHeipTemplateDto,
  SaveHeipTemplateVersionDto,
  UpdateHeipTemplateDto,
  type HeipFieldSchemaDto,
} from './dto/heip.dto';

function actorLabel(user: AuthUser): string {
  return (
    [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email
  );
}

function asFieldArray(schema: unknown): HeipFieldSchemaDto[] {
  if (!Array.isArray(schema)) return [];
  return schema as HeipFieldSchemaDto[];
}

@Injectable()
export class HeipTemplatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private mapTemplate(row: {
    TEMPLATE_ID: number;
    CODE: string;
    NAME: string;
    DEPARTMENT_ID: number | null;
    ROLE_NAME: string | null;
    FREQUENCY: string;
    DEADLINE_HOUR: number;
    DEADLINE_GRACE_HOURS: number;
    IS_ACTIVE: boolean;
    CREATED_DATE: Date;
    UPDATED_DATE: Date | null;
  }) {
    return {
      templateId: row.TEMPLATE_ID,
      code: row.CODE,
      name: row.NAME,
      departmentId: row.DEPARTMENT_ID,
      roleName: row.ROLE_NAME,
      frequency: row.FREQUENCY,
      deadlineHour: row.DEADLINE_HOUR,
      deadlineGraceHours: row.DEADLINE_GRACE_HOURS,
      isActive: row.IS_ACTIVE,
      createdAt: row.CREATED_DATE.toISOString(),
      updatedAt: row.UPDATED_DATE?.toISOString() ?? null,
    };
  }

  private mapVersion(row: {
    VERSION_ID: number;
    TEMPLATE_ID: number;
    VERSION_NO: number;
    FIELD_SCHEMA: Prisma.JsonValue;
    STATUS: string;
    PUBLISHED_AT: Date | null;
    PUBLISHED_BY: string | null;
    CREATED_DATE: Date;
  }) {
    return {
      versionId: row.VERSION_ID,
      templateId: row.TEMPLATE_ID,
      versionNo: row.VERSION_NO,
      fields: asFieldArray(row.FIELD_SCHEMA),
      status: row.STATUS,
      publishedAt: row.PUBLISHED_AT?.toISOString() ?? null,
      publishedBy: row.PUBLISHED_BY,
      createdAt: row.CREATED_DATE.toISOString(),
    };
  }

  async listTemplates(): Promise<{ items: ReturnType<HeipTemplatesService['mapTemplate']>[] }> {
    const rows = await this.prisma.heipReportTemplates.findMany({
      orderBy: [{ NAME: 'asc' }],
    });
    return { items: rows.map((r) => this.mapTemplate(r)) };
  }

  async getTemplate(id: number) {
    const row = await this.prisma.heipReportTemplates.findUnique({
      where: { TEMPLATE_ID: id },
      include: {
        versions: { orderBy: { VERSION_NO: 'desc' } },
      },
    });
    if (!row) throw new NotFoundException('HEIP template not found');
    return {
      ...this.mapTemplate(row),
      versions: row.versions.map((v) => this.mapVersion(v)),
    };
  }

  async createTemplate(dto: CreateHeipTemplateDto, user: AuthUser) {
    const code = dto.code.trim().toUpperCase();
    const existing = await this.prisma.heipReportTemplates.findUnique({
      where: { CODE: code },
    });
    if (existing) throw new ConflictException(`Template code ${code} exists`);

    const label = actorLabel(user);
    const row = await this.prisma.heipReportTemplates.create({
      data: {
        CODE: code,
        NAME: dto.name.trim(),
        DEPARTMENT_ID: dto.departmentId ?? null,
        ROLE_NAME: dto.roleName?.trim() || null,
        FREQUENCY: dto.frequency ?? 'daily',
        DEADLINE_HOUR: dto.deadlineHour ?? 10,
        DEADLINE_GRACE_HOURS: dto.deadlineGraceHours ?? 2,
        IS_ACTIVE: true,
        CREATED_BY_ID: user.id,
        CREATED_BY: label,
      },
    });

    await this.audit.log({
      type: 'heip:template:create',
      entity: 'HEIP_REPORT_TEMPLATES',
      entityId: row.TEMPLATE_ID,
      userId: user.id,
      createdBy: label,
    });

    return this.mapTemplate(row);
  }

  async updateTemplate(
    id: number,
    dto: UpdateHeipTemplateDto,
    user: AuthUser,
  ) {
    const existing = await this.prisma.heipReportTemplates.findUnique({
      where: { TEMPLATE_ID: id },
    });
    if (!existing) throw new NotFoundException('HEIP template not found');

    const label = actorLabel(user);
    const row = await this.prisma.heipReportTemplates.update({
      where: { TEMPLATE_ID: id },
      data: {
        ...(dto.name != null ? { NAME: dto.name.trim() } : {}),
        ...(dto.departmentId !== undefined
          ? { DEPARTMENT_ID: dto.departmentId }
          : {}),
        ...(dto.roleName !== undefined
          ? { ROLE_NAME: dto.roleName?.trim() || null }
          : {}),
        ...(dto.frequency != null ? { FREQUENCY: dto.frequency } : {}),
        ...(dto.deadlineHour != null
          ? { DEADLINE_HOUR: dto.deadlineHour }
          : {}),
        ...(dto.deadlineGraceHours != null
          ? { DEADLINE_GRACE_HOURS: dto.deadlineGraceHours }
          : {}),
        ...(dto.isActive != null ? { IS_ACTIVE: dto.isActive } : {}),
        UPDATED_BY_ID: user.id,
        UPDATED_BY: label,
        UPDATED_DATE: new Date(),
      },
    });

    await this.audit.log({
      type: 'heip:template:update',
      entity: 'HEIP_REPORT_TEMPLATES',
      entityId: id,
      userId: user.id,
      createdBy: label,
    });

    return this.mapTemplate(row);
  }

  async saveDraftVersion(
    templateId: number,
    dto: SaveHeipTemplateVersionDto,
    user: AuthUser,
  ) {
    const template = await this.prisma.heipReportTemplates.findUnique({
      where: { TEMPLATE_ID: templateId },
    });
    if (!template) throw new NotFoundException('HEIP template not found');
    this.validateFieldKeys(dto.fields);

    const label = actorLabel(user);
    const latest = await this.prisma.heipTemplateVersions.findFirst({
      where: { TEMPLATE_ID: templateId },
      orderBy: { VERSION_NO: 'desc' },
    });

    let row;
    if (latest && latest.STATUS === 'Draft') {
      row = await this.prisma.heipTemplateVersions.update({
        where: { VERSION_ID: latest.VERSION_ID },
        data: {
          FIELD_SCHEMA: dto.fields as unknown as Prisma.InputJsonValue,
          UPDATED_BY_ID: user.id,
          UPDATED_BY: label,
          UPDATED_DATE: new Date(),
        },
      });
    } else {
      const nextNo = (latest?.VERSION_NO ?? 0) + 1;
      row = await this.prisma.heipTemplateVersions.create({
        data: {
          TEMPLATE_ID: templateId,
          VERSION_NO: nextNo,
          FIELD_SCHEMA: dto.fields as unknown as Prisma.InputJsonValue,
          STATUS: 'Draft',
          CREATED_BY_ID: user.id,
          CREATED_BY: label,
        },
      });
    }

    await this.audit.log({
      type: 'heip:template:version-save',
      entity: 'HEIP_TEMPLATE_VERSIONS',
      entityId: row.VERSION_ID,
      userId: user.id,
      createdBy: label,
    });

    return this.mapVersion(row);
  }

  async publish(templateId: number, user: AuthUser) {
    const draft = await this.prisma.heipTemplateVersions.findFirst({
      where: { TEMPLATE_ID: templateId, STATUS: 'Draft' },
      orderBy: { VERSION_NO: 'desc' },
    });
    if (!draft) {
      throw new BadRequestException('No draft version to publish');
    }
    const fields = asFieldArray(draft.FIELD_SCHEMA);
    if (!fields.length) {
      throw new BadRequestException('Cannot publish empty field schema');
    }

    const label = actorLabel(user);
    const now = new Date();
    const row = await this.prisma.heipTemplateVersions.update({
      where: { VERSION_ID: draft.VERSION_ID },
      data: {
        STATUS: 'Published',
        PUBLISHED_AT: now,
        PUBLISHED_BY_ID: user.id,
        PUBLISHED_BY: label,
        UPDATED_BY_ID: user.id,
        UPDATED_BY: label,
        UPDATED_DATE: now,
      },
    });

    await this.audit.log({
      type: 'heip:template:publish',
      entity: 'HEIP_TEMPLATE_VERSIONS',
      entityId: row.VERSION_ID,
      userId: user.id,
      createdBy: label,
    });

    return this.mapVersion(row);
  }

  /**
   * Resolve published template for an employee: dept+role → dept default → general.
   */
  async resolveForEmployee(employee: {
    DEPARTMENT_ID: number | null;
    DESIGNATION: string | null;
  }, roleHints: string[] = []) {
    const deptId = employee.DEPARTMENT_ID;
    const roleCandidates = [
      ...roleHints.map((r) => r.toUpperCase()),
      ...(employee.DESIGNATION
        ? [employee.DESIGNATION.toUpperCase()]
        : []),
    ];

    const publishedInclude = {
      versions: {
        where: { STATUS: 'Published' },
        orderBy: { VERSION_NO: 'desc' as const },
        take: 1,
      },
    };

    if (deptId != null && roleCandidates.length) {
      for (const role of roleCandidates) {
        const hit = await this.prisma.heipReportTemplates.findFirst({
          where: {
            IS_ACTIVE: true,
            DEPARTMENT_ID: deptId,
            ROLE_NAME: { equals: role, mode: 'insensitive' },
          },
          include: publishedInclude,
        });
        if (hit?.versions[0]) {
          return {
            template: this.mapTemplate(hit),
            version: this.mapVersion(hit.versions[0]),
            match: 'dept+role' as const,
          };
        }
      }
    }

    if (deptId != null) {
      const hit = await this.prisma.heipReportTemplates.findFirst({
        where: {
          IS_ACTIVE: true,
          DEPARTMENT_ID: deptId,
          ROLE_NAME: null,
        },
        include: publishedInclude,
      });
      if (hit?.versions[0]) {
        return {
          template: this.mapTemplate(hit),
          version: this.mapVersion(hit.versions[0]),
          match: 'dept' as const,
        };
      }
    }

    const general = await this.prisma.heipReportTemplates.findFirst({
      where: {
        IS_ACTIVE: true,
        DEPARTMENT_ID: null,
        ROLE_NAME: null,
      },
      include: publishedInclude,
    });
    if (general?.versions[0]) {
      return {
        template: this.mapTemplate(general),
        version: this.mapVersion(general.versions[0]),
        match: 'general' as const,
      };
    }

    return null;
  }

  async resolveMine(user: AuthUser) {
    const link = await this.prisma.users.findUnique({
      where: { USER_ID: user.id },
      select: { EMPLOYEE_ID: true },
    });
    if (link?.EMPLOYEE_ID == null) {
      return {
        linked: false as const,
        template: null,
        message:
          'Your user account is not linked to an employee record. Ask HR to link your account.',
      };
    }
    const employee = await this.prisma.hrEmployees.findUnique({
      where: { EMPLOYEE_ID: link.EMPLOYEE_ID },
    });
    if (!employee) {
      return {
        linked: false as const,
        template: null,
        message:
          'Your user account is not linked to an employee record. Ask HR to link your account.',
      };
    }

    const resolved = await this.resolveForEmployee(employee, user.roles ?? []);
    if (!resolved) {
      return {
        linked: true as const,
        employeeId: employee.EMPLOYEE_ID,
        departmentId: employee.DEPARTMENT_ID,
        template: null,
        message: 'Your department template is not published yet.',
      };
    }

    return {
      linked: true as const,
      employeeId: employee.EMPLOYEE_ID,
      departmentId: employee.DEPARTMENT_ID,
      ...resolved,
      message: null,
    };
  }

  private validateFieldKeys(fields: HeipFieldSchemaDto[]) {
    const keys = new Set<string>();
    for (const f of fields) {
      if (!f.key?.trim()) {
        throw new BadRequestException('Each field needs a key');
      }
      if (keys.has(f.key)) {
        throw new BadRequestException(`Duplicate field key: ${f.key}`);
      }
      keys.add(f.key);
    }
  }
}
