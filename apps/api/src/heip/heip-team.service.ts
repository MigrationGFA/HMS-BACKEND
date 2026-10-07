import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import type { AuthUser } from '../auth/types/auth-user.type';
import { HeipReturnDto, HeipTeamSummaryDto } from './dto/heip.dto';
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

@Injectable()
export class HeipTeamService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  private async requireLinkedEmployee(user: AuthUser) {
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

  /** Departments where actor is head or deputy. */
  private async hodDepartmentIds(employeeId: number): Promise<number[]> {
    const rows = await this.prisma.hrDepartmentHeads.findMany({
      where: {
        OR: [
          { HEAD_EMPLOYEE_ID: employeeId },
          { DEPUTY_EMPLOYEE_ID: employeeId },
        ],
      },
      select: { DEPARTMENT_ID: true },
    });
    return rows.map((r) => r.DEPARTMENT_ID);
  }

  private async assertHodForReport(
    actorEmployeeId: number,
    report: { DEPARTMENT_ID: number | null; EMPLOYEE_ID: number },
  ) {
    if (report.DEPARTMENT_ID == null) {
      throw new ForbiddenException('Report has no department');
    }
    const depts = await this.hodDepartmentIds(actorEmployeeId);
    if (!depts.includes(report.DEPARTMENT_ID)) {
      throw new ForbiddenException('Not HOD/deputy for this department');
    }
    if (report.EMPLOYEE_ID === actorEmployeeId) {
      throw new ForbiddenException('Cannot review your own report as HOD');
    }
  }

  private mapReport(row: {
    REPORT_ID: number;
    TEMPLATE_ID: number;
    EMPLOYEE_ID: number;
    DEPARTMENT_ID: number | null;
    REPORT_DATE: Date;
    SHIFT: string | null;
    STATUS: string;
    LATE: boolean;
    SUBMITTED_AT: Date | null;
    APPROVED_BY: string | null;
  }) {
    return {
      reportId: row.REPORT_ID,
      templateId: row.TEMPLATE_ID,
      employeeId: row.EMPLOYEE_ID,
      departmentId: row.DEPARTMENT_ID,
      reportDate: toDateOnlyIso(row.REPORT_DATE),
      shift: row.SHIFT,
      status: row.STATUS,
      late: row.LATE,
      submittedAt: row.SUBMITTED_AT?.toISOString() ?? null,
      approvedBy: row.APPROVED_BY,
    };
  }

  async queue(user: AuthUser, dateIso?: string) {
    const actor = await this.requireLinkedEmployee(user);
    const depts = await this.hodDepartmentIds(actor.EMPLOYEE_ID);
    if (!depts.length) {
      return {
        isHod: false,
        items: [],
        message: 'You are not assigned as HOD/deputy for any department.',
      };
    }

    const reportDate = dateIso
      ? parseDateOnlyUtc(dateIso)
      : parseDateOnlyUtc(toDateOnlyIso(new Date()));

    const rows = await this.prisma.heipReports.findMany({
      where: {
        DEPARTMENT_ID: { in: depts },
        REPORT_DATE: reportDate,
        STATUS: 'Submitted',
      },
      orderBy: [{ SUBMITTED_AT: 'asc' }, { REPORT_ID: 'asc' }],
      include: {
        values: {
          select: {
            FIELD_KEY: true,
            METRIC_KEY: true,
            VALUE_NUMBER: true,
            VALUE_TEXT: true,
          },
        },
      },
    });

    const empIds = [...new Set(rows.map((r) => r.EMPLOYEE_ID))];
    const emps = await this.prisma.hrEmployees.findMany({
      where: { EMPLOYEE_ID: { in: empIds } },
      select: {
        EMPLOYEE_ID: true,
        FIRST_NAME: true,
        LAST_NAME: true,
        EMPLOYEE_NO: true,
        DESIGNATION: true,
      },
    });
    const empMap = new Map(emps.map((e) => [e.EMPLOYEE_ID, e]));

    return {
      isHod: true,
      departmentIds: depts,
      reportDate: toDateOnlyIso(reportDate),
      items: rows.map((r) => {
        const emp = empMap.get(r.EMPLOYEE_ID);
        return {
          ...this.mapReport(r),
          employeeName: emp
            ? `${emp.FIRST_NAME} ${emp.LAST_NAME}`
            : null,
          employeeNo: emp?.EMPLOYEE_NO ?? null,
          designation: emp?.DESIGNATION ?? null,
          valuePreview: r.values.slice(0, 5).map((v) => ({
            fieldKey: v.FIELD_KEY,
            metricKey: v.METRIC_KEY,
            valueNumber: decimalOrNull(v.VALUE_NUMBER),
            valueText: v.VALUE_TEXT,
          })),
        };
      }),
    };
  }

  async approve(reportId: number, user: AuthUser) {
    const actor = await this.requireLinkedEmployee(user);
    const existing = await this.prisma.heipReports.findUnique({
      where: { REPORT_ID: reportId },
    });
    if (!existing) throw new NotFoundException('Report not found');
    if (existing.STATUS !== 'Submitted') {
      throw new ConflictException('Report is not awaiting HOD approval');
    }
    await this.assertHodForReport(actor.EMPLOYEE_ID, existing);

    const label = actorLabel(user);
    const now = new Date();
    const row = await this.prisma.heipReports.update({
      where: { REPORT_ID: reportId },
      data: {
        STATUS: 'Approved',
        APPROVED_AT: now,
        APPROVED_BY_ID: user.id,
        APPROVED_BY: label,
        UPDATED_BY_ID: user.id,
        UPDATED_BY: label,
        UPDATED_DATE: now,
      },
    });

    await this.prisma.heipReportEvents.create({
      data: {
        REPORT_ID: reportId,
        EVENT_TYPE: 'approve',
        FROM_STATUS: 'Submitted',
        TO_STATUS: 'Approved',
        ACTOR_ID: user.id,
        ACTOR_LABEL: label,
      },
    });

    await this.audit.log({
      type: 'heip:report:approve',
      entity: 'HEIP_REPORTS',
      entityId: reportId,
      userId: user.id,
      createdBy: label,
    });

    const submitter = await this.prisma.hrEmployees.findUnique({
      where: { EMPLOYEE_ID: existing.EMPLOYEE_ID },
      select: { USER_ID: true },
    });
    if (submitter?.USER_ID) {
      try {
        await this.notifications.createForUser({
          userId: submitter.USER_ID,
          type: 'heip:report:approved',
          title: `HEIP report #${reportId} approved`,
          body: 'Your daily report was approved by HOD',
          linkPath: '/account/heip/history',
          entity: 'HEIP_REPORTS',
          entityId: reportId,
        });
      } catch {
        /* best-effort */
      }
    }

    return this.mapReport(row);
  }

  async returnReport(reportId: number, dto: HeipReturnDto, user: AuthUser) {
    if (!dto.comment?.trim()) {
      throw new BadRequestException('Return comment is required');
    }
    const actor = await this.requireLinkedEmployee(user);
    const existing = await this.prisma.heipReports.findUnique({
      where: { REPORT_ID: reportId },
    });
    if (!existing) throw new NotFoundException('Report not found');
    if (existing.STATUS !== 'Submitted') {
      throw new ConflictException('Report is not awaiting HOD approval');
    }
    await this.assertHodForReport(actor.EMPLOYEE_ID, existing);

    const label = actorLabel(user);
    const now = new Date();
    const row = await this.prisma.heipReports.update({
      where: { REPORT_ID: reportId },
      data: {
        STATUS: 'Returned',
        RETURN_COMMENT: dto.comment.trim(),
        UPDATED_BY_ID: user.id,
        UPDATED_BY: label,
        UPDATED_DATE: now,
      },
    });

    await this.prisma.heipReportEvents.create({
      data: {
        REPORT_ID: reportId,
        EVENT_TYPE: 'return',
        FROM_STATUS: 'Submitted',
        TO_STATUS: 'Returned',
        COMMENT: dto.comment.trim(),
        ACTOR_ID: user.id,
        ACTOR_LABEL: label,
      },
    });

    await this.audit.log({
      type: 'heip:report:return',
      entity: 'HEIP_REPORTS',
      entityId: reportId,
      userId: user.id,
      createdBy: label,
    });

    const submitter = await this.prisma.hrEmployees.findUnique({
      where: { EMPLOYEE_ID: existing.EMPLOYEE_ID },
      select: { USER_ID: true },
    });
    if (submitter?.USER_ID) {
      try {
        await this.notifications.createForUser({
          userId: submitter.USER_ID,
          type: 'heip:report:returned',
          title: `HEIP report #${reportId} returned`,
          body: dto.comment.trim(),
          linkPath: '/account/heip',
          entity: 'HEIP_REPORTS',
          entityId: reportId,
        });
      } catch {
        /* best-effort */
      }
    }

    return this.mapReport(row);
  }

  async upsertSummary(dto: HeipTeamSummaryDto, user: AuthUser) {
    const actor = await this.requireLinkedEmployee(user);
    const depts = await this.hodDepartmentIds(actor.EMPLOYEE_ID);
    if (!depts.includes(dto.departmentId)) {
      throw new ForbiddenException('Not HOD/deputy for this department');
    }
    if (!dto.body?.trim()) {
      throw new BadRequestException('Summary body is required');
    }

    const reportDate = parseDateOnlyUtc(dto.reportDate);
    const label = actorLabel(user);
    const now = new Date();

    const row = await this.prisma.heipDepartmentSummaries.upsert({
      where: {
        DEPARTMENT_ID_REPORT_DATE: {
          DEPARTMENT_ID: dto.departmentId,
          REPORT_DATE: reportDate,
        },
      },
      create: {
        DEPARTMENT_ID: dto.departmentId,
        REPORT_DATE: reportDate,
        BODY: dto.body.trim(),
        AUTHOR_EMPLOYEE_ID: actor.EMPLOYEE_ID,
        AUTHOR_USER_ID: user.id,
        CREATED_BY_ID: user.id,
        CREATED_BY: label,
      },
      update: {
        BODY: dto.body.trim(),
        AUTHOR_EMPLOYEE_ID: actor.EMPLOYEE_ID,
        AUTHOR_USER_ID: user.id,
        UPDATED_BY_ID: user.id,
        UPDATED_BY: label,
        UPDATED_DATE: now,
      },
    });

    await this.audit.log({
      type: 'heip:summary:upsert',
      entity: 'HEIP_DEPARTMENT_SUMMARIES',
      entityId: row.SUMMARY_ID,
      userId: user.id,
      createdBy: label,
    });

    return {
      summaryId: row.SUMMARY_ID,
      departmentId: row.DEPARTMENT_ID,
      reportDate: toDateOnlyIso(row.REPORT_DATE),
      body: row.BODY,
      updatedAt: (row.UPDATED_DATE ?? row.CREATED_DATE).toISOString(),
    };
  }
}
