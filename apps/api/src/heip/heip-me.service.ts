import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import type { AuthUser } from '../auth/types/auth-user.type';
import { ROLES } from '../common/constants';
import {
  HeipAmendDto,
  HeipDraftDto,
  HeipSubmitDto,
  type HeipFieldSchemaDto,
  type HeipReportValueInputDto,
} from './dto/heip.dto';
import { HeipTemplatesService } from './heip-templates.service';
import {
  HeipAutofillService,
  decimalOrNull,
  parseDateOnlyUtc,
  toDateOnlyIso,
} from './heip-autofill.service';

const SYSTEM_NO_HOD = 'SYSTEM_NO_HOD';

function actorLabel(user: AuthUser): string {
  return (
    [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email
  );
}

function asFields(schema: unknown): HeipFieldSchemaDto[] {
  if (!Array.isArray(schema)) return [];
  return schema as HeipFieldSchemaDto[];
}

function valuesEqual(
  a: number | string | boolean | null | undefined,
  b: number | string | boolean | null | undefined,
): boolean {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  if (typeof a === 'number' || typeof b === 'number') {
    return Number(a) === Number(b);
  }
  return String(a) === String(b);
}

@Injectable()
export class HeipMeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly templates: HeipTemplatesService,
    private readonly autofill: HeipAutofillService,
  ) {}

  /** Resolve linked employee or throw (same rule as HrSelfService). */
  async requireLinkedEmployee(user: AuthUser) {
    const row = await this.prisma.users.findUnique({
      where: { USER_ID: user.id },
      select: { EMPLOYEE_ID: true },
    });
    if (row?.EMPLOYEE_ID == null) {
      throw new ForbiddenException(
        'Your user account is not linked to an employee record. Ask HR to link your account.',
      );
    }
    const employee = await this.prisma.hrEmployees.findUnique({
      where: { EMPLOYEE_ID: row.EMPLOYEE_ID },
    });
    if (!employee) {
      throw new ForbiddenException(
        'Your user account is not linked to an employee record. Ask HR to link your account.',
      );
    }
    return employee;
  }

  private mapReport(row: {
    REPORT_ID: number;
    TEMPLATE_ID: number;
    TEMPLATE_VERSION_ID: number;
    EMPLOYEE_ID: number;
    USER_ID: number | null;
    DEPARTMENT_ID: number | null;
    REPORT_DATE: Date;
    SHIFT: string | null;
    STATUS: string;
    LATE: boolean;
    PREVIOUS_REPORT_ID: number | null;
    AMENDMENT_REASON: string | null;
    SUBMITTED_AT: Date | null;
    APPROVED_AT: Date | null;
    APPROVED_BY: string | null;
    APPROVED_BY_ID: number | null;
    RETURN_COMMENT: string | null;
    CREATED_DATE: Date;
  }) {
    return {
      reportId: row.REPORT_ID,
      templateId: row.TEMPLATE_ID,
      templateVersionId: row.TEMPLATE_VERSION_ID,
      employeeId: row.EMPLOYEE_ID,
      userId: row.USER_ID,
      departmentId: row.DEPARTMENT_ID,
      reportDate: toDateOnlyIso(row.REPORT_DATE),
      shift: row.SHIFT,
      status: row.STATUS,
      late: row.LATE,
      previousReportId: row.PREVIOUS_REPORT_ID,
      amendmentReason: row.AMENDMENT_REASON,
      submittedAt: row.SUBMITTED_AT?.toISOString() ?? null,
      approvedAt: row.APPROVED_AT?.toISOString() ?? null,
      approvedBy: row.APPROVED_BY,
      approvedById: row.APPROVED_BY_ID,
      returnComment: row.RETURN_COMMENT,
      createdAt: row.CREATED_DATE.toISOString(),
    };
  }

  private mapValue(row: {
    VALUE_ID: number;
    FIELD_KEY: string;
    METRIC_KEY: string | null;
    VALUE_TEXT: string | null;
    VALUE_NUMBER: Prisma.Decimal | null;
    VALUE_JSON: Prisma.JsonValue | null;
    SYSTEM_VALUE_NUMBER: Prisma.Decimal | null;
    SYSTEM_VALUE_TEXT: string | null;
    OVERRIDE_REASON: string | null;
  }) {
    return {
      valueId: row.VALUE_ID,
      fieldKey: row.FIELD_KEY,
      metricKey: row.METRIC_KEY,
      valueText: row.VALUE_TEXT,
      valueNumber: decimalOrNull(row.VALUE_NUMBER),
      valueJson: row.VALUE_JSON,
      systemValueNumber: decimalOrNull(row.SYSTEM_VALUE_NUMBER),
      systemValueText: row.SYSTEM_VALUE_TEXT,
      overrideReason: row.OVERRIDE_REASON,
    };
  }

  async getToday(user: AuthUser, shift?: string) {
    const employee = await this.requireLinkedEmployee(user);
    const reportDate = parseDateOnlyUtc(toDateOnlyIso(new Date()));
    const resolved = await this.templates.resolveForEmployee(
      employee,
      user.roles ?? [],
    );
    if (!resolved) {
      return {
        employeeId: employee.EMPLOYEE_ID,
        departmentId: employee.DEPARTMENT_ID,
        reportDate: toDateOnlyIso(reportDate),
        shift: shift ?? null,
        template: null,
        version: null,
        autofill: [],
        report: null,
        message: 'Your department template is not published yet.',
      };
    }

    const shiftNorm =
      resolved.template.frequency === 'shift'
        ? (shift?.trim() || null)
        : null;

    const existing = await this.prisma.heipReports.findFirst({
      where: {
        EMPLOYEE_ID: employee.EMPLOYEE_ID,
        TEMPLATE_ID: resolved.template.templateId,
        REPORT_DATE: reportDate,
        SHIFT: shiftNorm,
        STATUS: { in: ['Draft', 'Submitted', 'Returned', 'Approved'] },
        PREVIOUS_REPORT_ID: null,
      },
      include: { values: true },
      orderBy: { REPORT_ID: 'desc' },
    });

    // Prefer latest open (non-approved amendment chain tip)
    const open = await this.prisma.heipReports.findFirst({
      where: {
        EMPLOYEE_ID: employee.EMPLOYEE_ID,
        TEMPLATE_ID: resolved.template.templateId,
        REPORT_DATE: reportDate,
        SHIFT: shiftNorm,
        STATUS: { in: ['Draft', 'Submitted', 'Returned'] },
      },
      include: { values: true },
      orderBy: { REPORT_ID: 'desc' },
    });

    const report = open ?? existing;

    const autofill = await this.autofill.stampFields(
      resolved.version.fields,
      {
        userId: user.id,
        employeeId: employee.EMPLOYEE_ID,
        departmentId: employee.DEPARTMENT_ID,
        reportDate,
      },
    );

    return {
      employeeId: employee.EMPLOYEE_ID,
      departmentId: employee.DEPARTMENT_ID,
      reportDate: toDateOnlyIso(reportDate),
      shift: shiftNorm,
      template: resolved.template,
      version: resolved.version,
      match: resolved.match,
      autofill,
      report: report
        ? {
            ...this.mapReport(report),
            values: report.values.map((v) => this.mapValue(v)),
          }
        : null,
      message: null,
    };
  }

  async saveDraft(dto: HeipDraftDto, user: AuthUser) {
    const employee = await this.requireLinkedEmployee(user);
    const { report, fields } = await this.resolveWritableReport(
      employee,
      user,
      dto,
      false,
    );
    this.validateOverrides(fields, dto.values);
    const label = actorLabel(user);
    await this.upsertValues(report.REPORT_ID, fields, dto.values);

    const updated = await this.prisma.heipReports.update({
      where: { REPORT_ID: report.REPORT_ID },
      data: {
        UPDATED_BY_ID: user.id,
        UPDATED_BY: label,
        UPDATED_DATE: new Date(),
      },
      include: { values: true },
    });

    await this.prisma.heipReportEvents.create({
      data: {
        REPORT_ID: report.REPORT_ID,
        EVENT_TYPE: 'draft',
        FROM_STATUS: report.STATUS,
        TO_STATUS: updated.STATUS,
        ACTOR_ID: user.id,
        ACTOR_LABEL: label,
      },
    });

    return {
      ...this.mapReport(updated),
      values: updated.values.map((v) => this.mapValue(v)),
    };
  }

  async submit(dto: HeipSubmitDto, user: AuthUser) {
    const employee = await this.requireLinkedEmployee(user);
    const { report, fields, version } = await this.resolveWritableReport(
      employee,
      user,
      dto,
      true,
    );
    if (!['Draft', 'Returned'].includes(report.STATUS)) {
      throw new ConflictException(
        `Cannot submit report in status ${report.STATUS}`,
      );
    }

    this.validateRequired(fields, dto.values);
    this.validateOverrides(fields, dto.values);

    const label = actorLabel(user);
    const now = new Date();
    await this.upsertValues(report.REPORT_ID, fields, dto.values);

    const routing = await this.resolveSubmitRouting(employee);
    const toStatus = routing.autoApprove ? 'Approved' : 'Submitted';

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.heipReports.update({
        where: { REPORT_ID: report.REPORT_ID },
        data: {
          STATUS: toStatus,
          SUBMITTED_AT: now,
          RETURN_COMMENT: null,
          ...(routing.autoApprove
            ? {
                APPROVED_AT: now,
                APPROVED_BY: SYSTEM_NO_HOD,
                APPROVED_BY_ID: null,
              }
            : {}),
          UPDATED_BY_ID: user.id,
          UPDATED_BY: label,
          UPDATED_DATE: now,
        },
        include: { values: true },
      });

      await tx.heipReportEvents.create({
        data: {
          REPORT_ID: report.REPORT_ID,
          EVENT_TYPE: 'submit',
          FROM_STATUS: report.STATUS,
          TO_STATUS: toStatus,
          COMMENT: routing.autoApprove
            ? `Auto-approved (${routing.reason})`
            : null,
          ACTOR_ID: user.id,
          ACTOR_LABEL: label,
        },
      });

      if (routing.autoApprove) {
        await tx.heipReportEvents.create({
          data: {
            REPORT_ID: report.REPORT_ID,
            EVENT_TYPE: 'approve',
            FROM_STATUS: 'Submitted',
            TO_STATUS: 'Approved',
            COMMENT: routing.reason,
            ACTOR_LABEL: SYSTEM_NO_HOD,
          },
        });
      }

      return row;
    });

    const criticals = this.detectCriticals(fields, dto.values);
    if (criticals.length) {
      await this.createRedFlagsAndNotify(
        updated,
        employee,
        criticals,
        label,
      );
    }

    if (!routing.autoApprove && routing.hodUserIds.length) {
      for (const hodUserId of routing.hodUserIds) {
        await this.notifySafe(hodUserId, {
          type: 'heip:report:submitted',
          title: `HEIP report awaiting review`,
          body: `${label} submitted a daily report`,
          linkPath: '/account/heip/team',
          entity: 'HEIP_REPORTS',
          entityId: updated.REPORT_ID,
        });
      }
    }

    await this.audit.log({
      type: 'heip:report:submit',
      entity: 'HEIP_REPORTS',
      entityId: updated.REPORT_ID,
      userId: user.id,
      createdBy: label,
      newValue: {
        status: toStatus,
        autoApprove: routing.autoApprove,
        criticals: criticals.map((c) => c.fieldKey),
        versionId: version.versionId,
      },
    });

    return {
      ...this.mapReport(updated),
      values: updated.values.map((v) => this.mapValue(v)),
      autoApproved: routing.autoApprove,
      criticalCount: criticals.length,
    };
  }

  async listHistory(user: AuthUser) {
    const employee = await this.requireLinkedEmployee(user);
    const rows = await this.prisma.heipReports.findMany({
      where: { EMPLOYEE_ID: employee.EMPLOYEE_ID },
      orderBy: [{ REPORT_DATE: 'desc' }, { REPORT_ID: 'desc' }],
      take: 100,
    });
    return { items: rows.map((r) => this.mapReport(r)) };
  }

  async getMyReport(reportId: number, user: AuthUser) {
    const employee = await this.requireLinkedEmployee(user);
    const row = await this.prisma.heipReports.findUnique({
      where: { REPORT_ID: reportId },
      include: {
        values: true,
        events: { orderBy: { CREATED_DATE: 'asc' } },
        templateVersion: true,
      },
    });
    if (!row) throw new NotFoundException('Report not found');
    if (row.EMPLOYEE_ID !== employee.EMPLOYEE_ID) {
      throw new ForbiddenException('Not your report');
    }
    return {
      ...this.mapReport(row),
      values: row.values.map((v) => this.mapValue(v)),
      fields: asFields(row.templateVersion.FIELD_SCHEMA),
      events: row.events.map((e) => ({
        eventId: e.EVENT_ID,
        eventType: e.EVENT_TYPE,
        fromStatus: e.FROM_STATUS,
        toStatus: e.TO_STATUS,
        comment: e.COMMENT,
        actorLabel: e.ACTOR_LABEL,
        createdAt: e.CREATED_DATE.toISOString(),
      })),
    };
  }

  /**
   * After Approved: create a new report version linked to previous; requires
   * re-approval (starts as Draft with values prefilled).
   */
  async amend(reportId: number, dto: HeipAmendDto, user: AuthUser) {
    const employee = await this.requireLinkedEmployee(user);
    const existing = await this.prisma.heipReports.findUnique({
      where: { REPORT_ID: reportId },
      include: { templateVersion: true },
    });
    if (!existing) throw new NotFoundException('Report not found');
    if (existing.EMPLOYEE_ID !== employee.EMPLOYEE_ID) {
      throw new ForbiddenException('Not your report');
    }
    if (existing.STATUS !== 'Approved') {
      throw new ConflictException('Only Approved reports can be amended');
    }
    if (!dto.reason?.trim()) {
      throw new BadRequestException('Amendment reason is required');
    }

    const openChild = await this.prisma.heipReports.findFirst({
      where: {
        PREVIOUS_REPORT_ID: reportId,
        STATUS: { in: ['Draft', 'Submitted', 'Returned'] },
      },
    });
    if (openChild) {
      throw new ConflictException(
        'An amendment is already in progress for this report',
      );
    }

    const fields = asFields(existing.templateVersion.FIELD_SCHEMA);
    this.validateOverrides(fields, dto.values);
    const label = actorLabel(user);
    const now = new Date();

    const created = await this.prisma.$transaction(async (tx) => {
      const row = await tx.heipReports.create({
        data: {
          TEMPLATE_ID: existing.TEMPLATE_ID,
          TEMPLATE_VERSION_ID: existing.TEMPLATE_VERSION_ID,
          EMPLOYEE_ID: employee.EMPLOYEE_ID,
          USER_ID: user.id,
          DEPARTMENT_ID: employee.DEPARTMENT_ID,
          REPORT_DATE: existing.REPORT_DATE,
          SHIFT: existing.SHIFT,
          STATUS: 'Draft',
          PREVIOUS_REPORT_ID: reportId,
          AMENDMENT_REASON: dto.reason.trim(),
          CREATED_BY_ID: user.id,
          CREATED_BY: label,
        },
      });

      await this.upsertValuesTx(tx, row.REPORT_ID, fields, dto.values);

      await tx.heipReportEvents.create({
        data: {
          REPORT_ID: row.REPORT_ID,
          EVENT_TYPE: 'amend',
          FROM_STATUS: 'Approved',
          TO_STATUS: 'Draft',
          COMMENT: dto.reason.trim(),
          ACTOR_ID: user.id,
          ACTOR_LABEL: label,
        },
      });

      return tx.heipReports.findUniqueOrThrow({
        where: { REPORT_ID: row.REPORT_ID },
        include: { values: true },
      });
    });

    await this.audit.log({
      type: 'heip:report:amend',
      entity: 'HEIP_REPORTS',
      entityId: created.REPORT_ID,
      userId: user.id,
      createdBy: label,
      newValue: {
        previousReportId: reportId,
        reason: dto.reason.trim(),
        at: now.toISOString(),
      },
    });

    return {
      ...this.mapReport(created),
      values: created.values.map((v) => this.mapValue(v)),
    };
  }

  // ── internals ──────────────────────────────────────────────

  private async resolveWritableReport(
    employee: {
      EMPLOYEE_ID: number;
      DEPARTMENT_ID: number | null;
      DESIGNATION: string | null;
    },
    user: AuthUser,
    dto: HeipDraftDto,
    forSubmit: boolean,
  ) {
    const reportDate = dto.reportDate
      ? parseDateOnlyUtc(dto.reportDate)
      : parseDateOnlyUtc(toDateOnlyIso(new Date()));

    if (dto.reportId) {
      const existing = await this.prisma.heipReports.findUnique({
        where: { REPORT_ID: dto.reportId },
        include: { templateVersion: true },
      });
      if (!existing) throw new NotFoundException('Report not found');
      if (existing.EMPLOYEE_ID !== employee.EMPLOYEE_ID) {
        throw new ForbiddenException('Not your report');
      }
      if (!['Draft', 'Returned'].includes(existing.STATUS) && forSubmit) {
        throw new ConflictException(
          `Cannot write report in status ${existing.STATUS}`,
        );
      }
      if (!['Draft', 'Returned'].includes(existing.STATUS) && !forSubmit) {
        throw new ConflictException(
          `Cannot draft report in status ${existing.STATUS}`,
        );
      }
      return {
        report: existing,
        fields: asFields(existing.templateVersion.FIELD_SCHEMA),
        version: {
          versionId: existing.TEMPLATE_VERSION_ID,
          fields: asFields(existing.templateVersion.FIELD_SCHEMA),
        },
      };
    }

    const resolved = await this.templates.resolveForEmployee(
      employee,
      user.roles ?? [],
    );
    if (!resolved) {
      throw new BadRequestException(
        'Your department template is not published yet.',
      );
    }
    if (
      dto.templateId &&
      dto.templateId !== resolved.template.templateId
    ) {
      throw new BadRequestException('Template does not match resolved template');
    }

    const shiftNorm =
      resolved.template.frequency === 'shift'
        ? (dto.shift?.trim() || null)
        : null;

    let report = await this.prisma.heipReports.findFirst({
      where: {
        EMPLOYEE_ID: employee.EMPLOYEE_ID,
        TEMPLATE_ID: resolved.template.templateId,
        REPORT_DATE: reportDate,
        SHIFT: shiftNorm,
        STATUS: { in: ['Draft', 'Returned'] },
      },
      include: { templateVersion: true },
      orderBy: { REPORT_ID: 'desc' },
    });

    if (!report) {
      const submitted = await this.prisma.heipReports.findFirst({
        where: {
          EMPLOYEE_ID: employee.EMPLOYEE_ID,
          TEMPLATE_ID: resolved.template.templateId,
          REPORT_DATE: reportDate,
          SHIFT: shiftNorm,
          STATUS: { in: ['Submitted', 'Approved'] },
        },
      });
      if (submitted && forSubmit) {
        throw new ConflictException(
          'A report for this date/shift already exists; amend if Approved',
        );
      }
      if (submitted && !forSubmit && submitted.STATUS === 'Submitted') {
        throw new ConflictException('Report already submitted');
      }

      const label = actorLabel(user);
      report = await this.prisma.heipReports.create({
        data: {
          TEMPLATE_ID: resolved.template.templateId,
          TEMPLATE_VERSION_ID: resolved.version.versionId,
          EMPLOYEE_ID: employee.EMPLOYEE_ID,
          USER_ID: user.id,
          DEPARTMENT_ID: employee.DEPARTMENT_ID,
          REPORT_DATE: reportDate,
          SHIFT: shiftNorm,
          STATUS: 'Draft',
          CREATED_BY_ID: user.id,
          CREATED_BY: label,
        },
        include: { templateVersion: true },
      });
    }

    return {
      report,
      fields: asFields(report.templateVersion.FIELD_SCHEMA),
      version: resolved.version,
    };
  }

  private validateRequired(
    fields: HeipFieldSchemaDto[],
    values: HeipReportValueInputDto[],
  ) {
    const byKey = new Map(values.map((v) => [v.fieldKey, v]));
    for (const f of fields) {
      if (!f.required) continue;
      const v = byKey.get(f.key);
      if (!v) {
        throw new BadRequestException(`Required field missing: ${f.key}`);
      }
      const empty =
        (v.valueNumber == null || Number.isNaN(v.valueNumber)) &&
        (v.valueText == null || String(v.valueText).trim() === '') &&
        v.valueJson == null;
      if (empty) {
        throw new BadRequestException(`Required field empty: ${f.key}`);
      }
      if (f.min != null && v.valueNumber != null && v.valueNumber < f.min) {
        throw new BadRequestException(`${f.key} below minimum ${f.min}`);
      }
      if (f.max != null && v.valueNumber != null && v.valueNumber > f.max) {
        throw new BadRequestException(`${f.key} above maximum ${f.max}`);
      }
    }
  }

  /** Override of system value without reason → BadRequest */
  validateOverrides(
    fields: HeipFieldSchemaDto[],
    values: HeipReportValueInputDto[],
  ): void {
    const fieldByKey = new Map(fields.map((f) => [f.key, f]));
    for (const v of values) {
      const field = fieldByKey.get(v.fieldKey);
      if (!field?.autoFillSource) continue;
      const sysNum = v.systemValueNumber;
      if (sysNum == null && v.systemValueText == null) continue;
      const entered =
        v.valueNumber != null
          ? v.valueNumber
          : v.valueText != null
            ? v.valueText
            : null;
      const system =
        sysNum != null
          ? sysNum
          : v.systemValueText != null
            ? v.systemValueText
            : null;
      if (!valuesEqual(entered, system)) {
        if (!v.overrideReason?.trim()) {
          throw new BadRequestException(
            `Override reason required for field ${v.fieldKey}`,
          );
        }
      }
    }
  }

  detectCriticals(
    fields: HeipFieldSchemaDto[],
    values: HeipReportValueInputDto[],
  ): Array<{
    fieldKey: string;
    metricKey: string | null;
    op: string;
    triggerValue: string | null;
    observed: string;
  }> {
    const byKey = new Map(values.map((v) => [v.fieldKey, v]));
    const hits: Array<{
      fieldKey: string;
      metricKey: string | null;
      op: string;
      triggerValue: string | null;
      observed: string;
    }> = [];

    for (const f of fields) {
      if (!f.critical) continue;
      const v = byKey.get(f.key);
      if (!v) continue;
      const num = v.valueNumber;
      const text = v.valueText;
      const boolish =
        typeof text === 'string' &&
        ['true', 'yes', '1', 'y'].includes(text.trim().toLowerCase());

      let triggered = false;
      if (f.critical.op === 'gt') {
        const threshold = Number(f.critical.value ?? 0);
        triggered = num != null && num > threshold;
      } else if (f.critical.op === 'eq') {
        if (typeof f.critical.value === 'boolean') {
          triggered =
            (num === 1 || boolish || text === 'true') === f.critical.value ||
            valuesEqual(num ?? text, f.critical.value);
        } else {
          triggered = valuesEqual(num ?? text, f.critical.value);
        }
      } else if (f.critical.op === 'truthy') {
        triggered =
          (num != null && num !== 0) ||
          boolish ||
          (text != null && text.trim() !== '' && text !== 'false' && text !== '0');
      }

      if (triggered) {
        hits.push({
          fieldKey: f.key,
          metricKey: f.metricKey ?? null,
          op: f.critical.op,
          triggerValue:
            f.critical.value != null ? String(f.critical.value) : null,
          observed: String(num ?? text ?? true),
        });
      }
    }
    return hits;
  }

  private async resolveSubmitRouting(employee: {
    EMPLOYEE_ID: number;
    DEPARTMENT_ID: number | null;
  }): Promise<{
    autoApprove: boolean;
    reason: string;
    hodUserIds: number[];
  }> {
    if (employee.DEPARTMENT_ID == null) {
      return {
        autoApprove: true,
        reason: 'No department — SYSTEM_NO_HOD',
        hodUserIds: [],
      };
    }

    const head = await this.prisma.hrDepartmentHeads.findUnique({
      where: { DEPARTMENT_ID: employee.DEPARTMENT_ID },
    });

    if (!head) {
      return {
        autoApprove: true,
        reason: 'No HOD assigned — SYSTEM_NO_HOD',
        hodUserIds: [],
      };
    }

    const isHodOrDeputy =
      head.HEAD_EMPLOYEE_ID === employee.EMPLOYEE_ID ||
      head.DEPUTY_EMPLOYEE_ID === employee.EMPLOYEE_ID;

    if (isHodOrDeputy) {
      return {
        autoApprove: true,
        reason: 'Submitter is HOD/deputy — SYSTEM_NO_HOD',
        hodUserIds: [],
      };
    }

    const hodEmployeeIds = [
      head.HEAD_EMPLOYEE_ID,
      ...(head.DEPUTY_EMPLOYEE_ID ? [head.DEPUTY_EMPLOYEE_ID] : []),
    ];
    const hodEmployees = await this.prisma.hrEmployees.findMany({
      where: { EMPLOYEE_ID: { in: hodEmployeeIds } },
      select: { USER_ID: true },
    });
    const hodUserIds = hodEmployees
      .map((e) => e.USER_ID)
      .filter((id): id is number => id != null);

    return { autoApprove: false, reason: '', hodUserIds };
  }

  private async createRedFlagsAndNotify(
    report: {
      REPORT_ID: number;
      DEPARTMENT_ID: number | null;
      EMPLOYEE_ID: number;
    },
    employee: { FIRST_NAME: string; LAST_NAME: string },
    criticals: Array<{
      fieldKey: string;
      metricKey: string | null;
      op: string;
      triggerValue: string | null;
      observed: string;
    }>,
    actor: string,
  ) {
    for (const c of criticals) {
      await this.prisma.heipRedFlags.create({
        data: {
          REPORT_ID: report.REPORT_ID,
          FIELD_KEY: c.fieldKey,
          METRIC_KEY: c.metricKey,
          TRIGGER_OP: c.op,
          TRIGGER_VALUE: c.triggerValue,
          OBSERVED_VALUE: c.observed,
          DEPARTMENT_ID: report.DEPARTMENT_ID,
          EMPLOYEE_ID: report.EMPLOYEE_ID,
        },
      });
    }

    const title = `HEIP red flag: ${criticals.map((c) => c.fieldKey).join(', ')}`;
    const body = `${employee.FIRST_NAME} ${employee.LAST_NAME} submitted critical values`;

    const cmdUsers = await this.prisma.users.findMany({
      where: {
        OR: [ROLES.CMD, ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.BOARD].map(
          (name) => ({
            role: { ROLE_NAME: { equals: name, mode: 'insensitive' as const } },
          }),
        ),
      },
      select: { USER_ID: true },
      take: 100,
    });

    for (const u of cmdUsers) {
      await this.notifySafe(u.USER_ID, {
        type: 'heip:redflag',
        title,
        body,
        linkPath: '/dashboard/cmd/heip',
        entity: 'HEIP_REPORTS',
        entityId: report.REPORT_ID,
      });
    }

    if (report.DEPARTMENT_ID != null) {
      const head = await this.prisma.hrDepartmentHeads.findUnique({
        where: { DEPARTMENT_ID: report.DEPARTMENT_ID },
      });
      if (head) {
        const hods = await this.prisma.hrEmployees.findMany({
          where: {
            EMPLOYEE_ID: {
              in: [
                head.HEAD_EMPLOYEE_ID,
                ...(head.DEPUTY_EMPLOYEE_ID
                  ? [head.DEPUTY_EMPLOYEE_ID]
                  : []),
              ],
            },
          },
          select: { USER_ID: true },
        });
        for (const h of hods) {
          if (h.USER_ID) {
            await this.notifySafe(h.USER_ID, {
              type: 'heip:redflag',
              title,
              body: `${body} (notify on submit)`,
              linkPath: '/account/heip/team',
              entity: 'HEIP_REPORTS',
              entityId: report.REPORT_ID,
            });
          }
        }
      }
    }

    await this.audit.log({
      type: 'heip:redflag:create',
      entity: 'HEIP_RED_FLAGS',
      entityId: report.REPORT_ID,
      createdBy: actor,
      newValue: { fields: criticals.map((c) => c.fieldKey) },
    });
  }

  private async notifySafe(
    userId: number,
    input: {
      type: string;
      title: string;
      body: string;
      linkPath?: string;
      entity?: string;
      entityId?: number;
    },
  ) {
    try {
      await this.notifications.createForUser({
        userId,
        type: input.type,
        title: input.title,
        body: input.body,
        linkPath: input.linkPath,
        entity: input.entity,
        entityId: input.entityId,
      });
    } catch {
      // best-effort
    }
  }

  private async upsertValues(
    reportId: number,
    fields: HeipFieldSchemaDto[],
    values: HeipReportValueInputDto[],
  ) {
    await this.upsertValuesTx(this.prisma, reportId, fields, values);
  }

  private async upsertValuesTx(
    tx: Prisma.TransactionClient | PrismaService,
    reportId: number,
    fields: HeipFieldSchemaDto[],
    values: HeipReportValueInputDto[],
  ) {
    const fieldByKey = new Map(fields.map((f) => [f.key, f]));
    for (const v of values) {
      const field = fieldByKey.get(v.fieldKey);
      await tx.heipReportValues.upsert({
        where: {
          REPORT_ID_FIELD_KEY: {
            REPORT_ID: reportId,
            FIELD_KEY: v.fieldKey,
          },
        },
        create: {
          REPORT_ID: reportId,
          FIELD_KEY: v.fieldKey,
          METRIC_KEY: field?.metricKey ?? null,
          VALUE_TEXT: v.valueText ?? null,
          VALUE_NUMBER:
            v.valueNumber != null
              ? new Prisma.Decimal(v.valueNumber)
              : null,
          VALUE_JSON:
            v.valueJson !== undefined
              ? (v.valueJson as Prisma.InputJsonValue)
              : Prisma.JsonNull,
          SYSTEM_VALUE_NUMBER:
            v.systemValueNumber != null
              ? new Prisma.Decimal(v.systemValueNumber)
              : null,
          SYSTEM_VALUE_TEXT: v.systemValueText ?? null,
          OVERRIDE_REASON: v.overrideReason?.trim() || null,
        },
        update: {
          METRIC_KEY: field?.metricKey ?? null,
          VALUE_TEXT: v.valueText ?? null,
          VALUE_NUMBER:
            v.valueNumber != null
              ? new Prisma.Decimal(v.valueNumber)
              : null,
          VALUE_JSON:
            v.valueJson !== undefined
              ? (v.valueJson as Prisma.InputJsonValue)
              : undefined,
          SYSTEM_VALUE_NUMBER:
            v.systemValueNumber != null
              ? new Prisma.Decimal(v.systemValueNumber)
              : null,
          SYSTEM_VALUE_TEXT: v.systemValueText ?? null,
          OVERRIDE_REASON: v.overrideReason?.trim() || null,
          UPDATED_DATE: new Date(),
        },
      });
    }
  }
}
