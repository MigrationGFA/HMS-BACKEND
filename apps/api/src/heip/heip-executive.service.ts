import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../auth/types/auth-user.type';
import { HeipAckRedFlagDto } from './dto/heip.dto';
import { HeipDeadlineService } from './heip-deadline.service';
import {
  decimalOrNull,
  parseDateOnlyUtc,
  toDateOnlyIso,
} from './heip-autofill.service';

function actorLabel(user: AuthUser): string {
  return (
    [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email
  );
}

function asFields(schema: unknown): unknown[] {
  if (!Array.isArray(schema)) return [];
  return schema;
}

/**
 * H2: CMD sees Submitted (Pending HOD) as well as Approved.
 * Aggregation includes both for glance metrics unless noted otherwise.
 */
const VISIBLE_STATUSES = ['Submitted', 'Approved'] as const;

@Injectable()
export class HeipExecutiveService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly deadlines: HeipDeadlineService,
  ) {}

  async overview(dateIso?: string) {
    const reportDate = dateIso
      ? parseDateOnlyUtc(dateIso)
      : parseDateOnlyUtc(toDateOnlyIso(new Date()));

    const reports = await this.prisma.heipReports.findMany({
      where: { REPORT_DATE: reportDate },
      select: {
        REPORT_ID: true,
        DEPARTMENT_ID: true,
        STATUS: true,
        LATE: true,
        EMPLOYEE_ID: true,
      },
    });

    const byDept = new Map<
      number | 'none',
      {
        departmentId: number | null;
        draft: number;
        submitted: number;
        returned: number;
        approved: number;
        missed: number;
        late: number;
      }
    >();

    const bump = (
      deptId: number | null,
      status: string,
      late: boolean,
    ) => {
      const key = deptId ?? 'none';
      let row = byDept.get(key);
      if (!row) {
        row = {
          departmentId: deptId,
          draft: 0,
          submitted: 0,
          returned: 0,
          approved: 0,
          missed: 0,
          late: 0,
        };
        byDept.set(key, row);
      }
      const s = status.toLowerCase();
      if (s === 'draft') row.draft += 1;
      else if (s === 'submitted') row.submitted += 1;
      else if (s === 'returned') row.returned += 1;
      else if (s === 'approved') row.approved += 1;
      else if (s === 'missed') row.missed += 1;
      if (late) row.late += 1;
    };

    for (const r of reports) bump(r.DEPARTMENT_ID, r.STATUS, r.LATE);

    const unackedFlags = await this.prisma.heipRedFlags.count({
      where: { ACKED_AT: null },
    });

    const metricTotals = await this.prisma.heipReportValues.groupBy({
      by: ['METRIC_KEY'],
      where: {
        METRIC_KEY: { not: null },
        report: {
          REPORT_DATE: reportDate,
          STATUS: { in: [...VISIBLE_STATUSES] },
        },
        VALUE_NUMBER: { not: null },
      },
      _sum: { VALUE_NUMBER: true },
      _count: { VALUE_ID: true },
    });

    const expected = reports.length;
    const compliant =
      reports.filter((r) =>
        ['Submitted', 'Approved'].includes(r.STATUS),
      ).length;
    const compliancePct =
      expected > 0 ? Math.round((compliant / expected) * 1000) / 10 : null;

    return {
      reportDate: toDateOnlyIso(reportDate),
      compliancePct,
      totals: {
        reports: expected,
        draft: reports.filter((r) => r.STATUS === 'Draft').length,
        submitted: reports.filter((r) => r.STATUS === 'Submitted').length,
        approved: reports.filter((r) => r.STATUS === 'Approved').length,
        returned: reports.filter((r) => r.STATUS === 'Returned').length,
        missed: reports.filter((r) => r.STATUS === 'Missed').length,
        late: reports.filter((r) => r.LATE).length,
      },
      redFlagUnacked: unackedFlags,
      departments: [...byDept.values()],
      keyMetrics: metricTotals
        .filter((m) => m.METRIC_KEY)
        .map((m) => ({
          metricKey: m.METRIC_KEY!,
          sum: decimalOrNull(m._sum.VALUE_NUMBER) ?? 0,
          count: m._count.VALUE_ID,
        })),
    };
  }

  async metrics(params: {
    from: string;
    to: string;
    metricKey?: string;
    departmentId?: number;
  }) {
    const from = parseDateOnlyUtc(params.from);
    const to = parseDateOnlyUtc(params.to);

    const where: Prisma.HeipReportValuesWhereInput = {
      METRIC_KEY: params.metricKey
        ? params.metricKey
        : { not: null },
      VALUE_NUMBER: { not: null },
      report: {
        REPORT_DATE: { gte: from, lte: to },
        STATUS: { in: [...VISIBLE_STATUSES] },
        ...(params.departmentId != null
          ? { DEPARTMENT_ID: params.departmentId }
          : {}),
      },
    };

    const rows = await this.prisma.heipReportValues.findMany({
      where,
      select: {
        METRIC_KEY: true,
        VALUE_NUMBER: true,
        report: { select: { REPORT_DATE: true, DEPARTMENT_ID: true } },
      },
    });

    const series = new Map<
      string,
      { date: string; metricKey: string; sum: number; count: number }
    >();
    for (const r of rows) {
      if (!r.METRIC_KEY || r.VALUE_NUMBER == null) continue;
      const date = toDateOnlyIso(r.report.REPORT_DATE);
      const key = `${date}|${r.METRIC_KEY}`;
      const cur = series.get(key) ?? {
        date,
        metricKey: r.METRIC_KEY,
        sum: 0,
        count: 0,
      };
      cur.sum += Number(r.VALUE_NUMBER);
      cur.count += 1;
      series.set(key, cur);
    }

    return {
      from: toDateOnlyIso(from),
      to: toDateOnlyIso(to),
      items: [...series.values()].sort((a, b) =>
        a.date === b.date
          ? a.metricKey.localeCompare(b.metricKey)
          : a.date.localeCompare(b.date),
      ),
    };
  }

  async departmentDrillDown(departmentId: number, dateIso?: string) {
    const reportDate = dateIso
      ? parseDateOnlyUtc(dateIso)
      : parseDateOnlyUtc(toDateOnlyIso(new Date()));

    const summary = await this.prisma.heipDepartmentSummaries.findUnique({
      where: {
        DEPARTMENT_ID_REPORT_DATE: {
          DEPARTMENT_ID: departmentId,
          REPORT_DATE: reportDate,
        },
      },
    });

    const reports = await this.prisma.heipReports.findMany({
      where: {
        DEPARTMENT_ID: departmentId,
        REPORT_DATE: reportDate,
        STATUS: { in: ['Submitted', 'Returned', 'Approved', 'Missed', 'Draft'] },
      },
      orderBy: [{ STATUS: 'asc' }, { REPORT_ID: 'asc' }],
      include: {
        values: {
          where: { METRIC_KEY: { not: null } },
          select: {
            FIELD_KEY: true,
            METRIC_KEY: true,
            VALUE_NUMBER: true,
            SYSTEM_VALUE_NUMBER: true,
          },
        },
      },
    });

    const empIds = [...new Set(reports.map((r) => r.EMPLOYEE_ID))];
    const emps = await this.prisma.hrEmployees.findMany({
      where: { EMPLOYEE_ID: { in: empIds } },
      select: {
        EMPLOYEE_ID: true,
        FIRST_NAME: true,
        LAST_NAME: true,
        EMPLOYEE_NO: true,
      },
    });
    const empMap = new Map(emps.map((e) => [e.EMPLOYEE_ID, e]));

    return {
      departmentId,
      reportDate: toDateOnlyIso(reportDate),
      summary: summary
        ? {
            summaryId: summary.SUMMARY_ID,
            body: summary.BODY,
            updatedAt: (
              summary.UPDATED_DATE ?? summary.CREATED_DATE
            ).toISOString(),
          }
        : null,
      reports: reports.map((r) => {
        const emp = empMap.get(r.EMPLOYEE_ID);
        return {
          reportId: r.REPORT_ID,
          employeeId: r.EMPLOYEE_ID,
          employeeName: emp
            ? `${emp.FIRST_NAME} ${emp.LAST_NAME}`
            : null,
          employeeNo: emp?.EMPLOYEE_NO ?? null,
          status: r.STATUS,
          late: r.LATE,
          shift: r.SHIFT,
          pendingHod: r.STATUS === 'Submitted',
          metrics: r.values.map((v) => ({
            fieldKey: v.FIELD_KEY,
            metricKey: v.METRIC_KEY,
            valueNumber: decimalOrNull(v.VALUE_NUMBER),
            systemValueNumber: decimalOrNull(v.SYSTEM_VALUE_NUMBER),
          })),
        };
      }),
    };
  }

  async getReport(reportId: number) {
    const row = await this.prisma.heipReports.findUnique({
      where: { REPORT_ID: reportId },
      include: {
        values: true,
        events: { orderBy: { CREATED_DATE: 'asc' } },
        templateVersion: true,
        template: true,
        redFlags: true,
      },
    });
    if (!row) throw new NotFoundException('Report not found');

    const emp = await this.prisma.hrEmployees.findUnique({
      where: { EMPLOYEE_ID: row.EMPLOYEE_ID },
      select: {
        FIRST_NAME: true,
        LAST_NAME: true,
        EMPLOYEE_NO: true,
        DESIGNATION: true,
      },
    });

    return {
      reportId: row.REPORT_ID,
      templateId: row.TEMPLATE_ID,
      templateName: row.template.NAME,
      templateVersionId: row.TEMPLATE_VERSION_ID,
      employeeId: row.EMPLOYEE_ID,
      employeeName: emp
        ? `${emp.FIRST_NAME} ${emp.LAST_NAME}`
        : null,
      employeeNo: emp?.EMPLOYEE_NO ?? null,
      designation: emp?.DESIGNATION ?? null,
      departmentId: row.DEPARTMENT_ID,
      reportDate: toDateOnlyIso(row.REPORT_DATE),
      shift: row.SHIFT,
      status: row.STATUS,
      pendingHod: row.STATUS === 'Submitted',
      late: row.LATE,
      previousReportId: row.PREVIOUS_REPORT_ID,
      amendmentReason: row.AMENDMENT_REASON,
      submittedAt: row.SUBMITTED_AT?.toISOString() ?? null,
      approvedAt: row.APPROVED_AT?.toISOString() ?? null,
      approvedBy: row.APPROVED_BY,
      returnComment: row.RETURN_COMMENT,
      fields: asFields(row.templateVersion.FIELD_SCHEMA),
      values: row.values.map((v) => ({
        fieldKey: v.FIELD_KEY,
        metricKey: v.METRIC_KEY,
        valueText: v.VALUE_TEXT,
        valueNumber: decimalOrNull(v.VALUE_NUMBER),
        valueJson: v.VALUE_JSON,
        systemValueNumber: decimalOrNull(v.SYSTEM_VALUE_NUMBER),
        systemValueText: v.SYSTEM_VALUE_TEXT,
        overrideReason: v.OVERRIDE_REASON,
      })),
      events: row.events.map((e) => ({
        eventId: e.EVENT_ID,
        eventType: e.EVENT_TYPE,
        fromStatus: e.FROM_STATUS,
        toStatus: e.TO_STATUS,
        comment: e.COMMENT,
        actorLabel: e.ACTOR_LABEL,
        createdAt: e.CREATED_DATE.toISOString(),
      })),
      redFlags: row.redFlags.map((f) => ({
        flagId: f.FLAG_ID,
        fieldKey: f.FIELD_KEY,
        metricKey: f.METRIC_KEY,
        observedValue: f.OBSERVED_VALUE,
        ackedAt: f.ACKED_AT?.toISOString() ?? null,
      })),
    };
  }

  async listRedFlags(acked?: boolean) {
    const where: Prisma.HeipRedFlagsWhereInput =
      acked === true
        ? { ACKED_AT: { not: null } }
        : acked === false
          ? { ACKED_AT: null }
          : {};

    const rows = await this.prisma.heipRedFlags.findMany({
      where,
      orderBy: { CREATED_DATE: 'desc' },
      take: 200,
      include: {
        report: {
          select: {
            REPORT_ID: true,
            REPORT_DATE: true,
            DEPARTMENT_ID: true,
            EMPLOYEE_ID: true,
            STATUS: true,
          },
        },
      },
    });

    return {
      items: rows.map((f) => ({
        flagId: f.FLAG_ID,
        reportId: f.REPORT_ID,
        fieldKey: f.FIELD_KEY,
        metricKey: f.METRIC_KEY,
        triggerOp: f.TRIGGER_OP,
        triggerValue: f.TRIGGER_VALUE,
        observedValue: f.OBSERVED_VALUE,
        departmentId: f.DEPARTMENT_ID,
        employeeId: f.EMPLOYEE_ID,
        reportDate: toDateOnlyIso(f.report.REPORT_DATE),
        reportStatus: f.report.STATUS,
        ackedAt: f.ACKED_AT?.toISOString() ?? null,
        ackedBy: f.ACKED_BY,
        ackNote: f.ACK_NOTE,
        createdAt: f.CREATED_DATE.toISOString(),
      })),
    };
  }

  async ackRedFlag(flagId: number, dto: HeipAckRedFlagDto, user: AuthUser) {
    const existing = await this.prisma.heipRedFlags.findUnique({
      where: { FLAG_ID: flagId },
    });
    if (!existing) throw new NotFoundException('Red flag not found');
    if (existing.ACKED_AT) {
      throw new ConflictException('Red flag already acknowledged');
    }

    const label = actorLabel(user);
    const now = new Date();
    const row = await this.prisma.heipRedFlags.update({
      where: { FLAG_ID: flagId },
      data: {
        ACKED_AT: now,
        ACKED_BY_ID: user.id,
        ACKED_BY: label,
        ACK_NOTE: dto.note?.trim() || null,
      },
    });

    await this.audit.log({
      type: 'heip:redflag:ack',
      entity: 'HEIP_RED_FLAGS',
      entityId: flagId,
      userId: user.id,
      createdBy: label,
    });

    return {
      flagId: row.FLAG_ID,
      ackedAt: row.ACKED_AT!.toISOString(),
      ackedBy: row.ACKED_BY,
      ackNote: row.ACK_NOTE,
    };
  }

  async compliance(dateIso?: string) {
    const reportDate = dateIso
      ? parseDateOnlyUtc(dateIso)
      : parseDateOnlyUtc(toDateOnlyIso(new Date()));

    const reports = await this.prisma.heipReports.findMany({
      where: { REPORT_DATE: reportDate },
      select: {
        REPORT_ID: true,
        EMPLOYEE_ID: true,
        DEPARTMENT_ID: true,
        STATUS: true,
        LATE: true,
        SUBMITTED_AT: true,
        APPROVED_AT: true,
        APPROVED_BY: true,
      },
    });

    const late = reports.filter((r) => r.LATE);
    const missed = reports.filter((r) => r.STATUS === 'Missed');
    const pendingHod = reports.filter((r) => r.STATUS === 'Submitted');

    const turnaroundHours: number[] = [];
    for (const r of reports) {
      if (r.SUBMITTED_AT && r.APPROVED_AT && r.APPROVED_BY !== 'SYSTEM_NO_HOD') {
        turnaroundHours.push(
          (r.APPROVED_AT.getTime() - r.SUBMITTED_AT.getTime()) / 3600_000,
        );
      }
    }
    const avgHodHours =
      turnaroundHours.length > 0
        ? Math.round(
            (turnaroundHours.reduce((a, b) => a + b, 0) /
              turnaroundHours.length) *
              10,
          ) / 10
        : null;

    return {
      reportDate: toDateOnlyIso(reportDate),
      late: late.map((r) => ({
        reportId: r.REPORT_ID,
        employeeId: r.EMPLOYEE_ID,
        departmentId: r.DEPARTMENT_ID,
        status: r.STATUS,
      })),
      missed: missed.map((r) => ({
        reportId: r.REPORT_ID,
        employeeId: r.EMPLOYEE_ID,
        departmentId: r.DEPARTMENT_ID,
      })),
      pendingHod: pendingHod.map((r) => ({
        reportId: r.REPORT_ID,
        employeeId: r.EMPLOYEE_ID,
        departmentId: r.DEPARTMENT_ID,
        submittedAt: r.SUBMITTED_AT?.toISOString() ?? null,
      })),
      avgHodTurnaroundHours: avgHodHours,
    };
  }

  async runDeadlines(dateIso: string | undefined, user: AuthUser) {
    const result = await this.deadlines.markLateAndMissed(dateIso);
    await this.audit.log({
      type: 'heip:deadline:manual',
      entity: 'HEIP_REPORTS',
      userId: user.id,
      createdBy: actorLabel(user),
      newValue: result,
    });
    return result;
  }
}
