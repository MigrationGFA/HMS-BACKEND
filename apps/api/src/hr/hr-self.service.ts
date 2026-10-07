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
import { EmailService } from '../notifications/email.service';
import type { AuthUser } from '../auth/types/auth-user.type';
import {
  normalizeRoleName,
  ROLES,
} from '../common/constants';
import {
  CreateSelfLeaveDto,
  HodRejectLeaveDto,
  SelfAttendanceQueryDto,
  UpdateSelfProfileDto,
} from './dto/hr-self.dto';
import {
  ACTIVE_LEAVE_STATUSES,
  countWorkingDays,
  datesOverlap,
  eachWorkingDay,
  leaveYearBounds,
  parseDateOnlyUtc,
  toDateOnlyIso,
} from './leave-rules';

function actorLabel(user: AuthUser): string {
  return (
    [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email
  );
}

function dateOnly(d: Date | null | undefined): string | null {
  return d ? toDateOnlyIso(d) : null;
}

function decimalToNumber(
  value: Prisma.Decimal | null | undefined,
): number | null {
  if (value == null) return null;
  return Number(value);
}

@Injectable()
export class HrSelfService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly email: EmailService,
  ) {}

  /** Resolve linked employee or throw a clear link-needed error. */
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

  private mapEmployeeBrief(row: {
    EMPLOYEE_ID: number;
    EMPLOYEE_NO: string;
    FIRST_NAME: string;
    LAST_NAME: string;
    EMAIL: string | null;
    PHONE: string | null;
    DEPARTMENT_ID: number | null;
    DEPARTMENT_NAME: string | null;
    DESIGNATION: string | null;
    STATUS: string;
    NEXT_OF_KIN: string | null;
    NEXT_OF_KIN_PHONE: string | null;
    EMERGENCY_CONTACT: string | null;
    EMERGENCY_PHONE: string | null;
  }) {
    return {
      employeeId: row.EMPLOYEE_ID,
      employeeNo: row.EMPLOYEE_NO,
      firstName: row.FIRST_NAME,
      lastName: row.LAST_NAME,
      email: row.EMAIL,
      phone: row.PHONE,
      departmentId: row.DEPARTMENT_ID,
      departmentName: row.DEPARTMENT_NAME,
      designation: row.DESIGNATION,
      status: row.STATUS,
      nextOfKin: row.NEXT_OF_KIN,
      nextOfKinPhone: row.NEXT_OF_KIN_PHONE,
      emergencyContact: row.EMERGENCY_CONTACT,
      emergencyPhone: row.EMERGENCY_PHONE,
    };
  }

  private mapLeave(row: {
    LEAVE_ID: number;
    EMPLOYEE_ID: number;
    LEAVE_TYPE_ID: number | null;
    LEAVE_TYPE: string;
    START_DATE: Date;
    END_DATE: Date;
    DAYS: Prisma.Decimal;
    REASON: string | null;
    STATUS: string;
    APPROVED_BY_ID: number | null;
    APPROVED_BY: string | null;
    APPROVED_AT: Date | null;
    DECISION_NOTE: string | null;
    HOD_DECISION_BY_ID: number | null;
    HOD_DECISION_BY: string | null;
    HOD_DECISION_AT: Date | null;
    HOD_NOTE: string | null;
    APPROVER_EMPLOYEE_ID: number | null;
    CREATED_BY: string | null;
    CREATED_DATE: Date;
    UPDATED_BY: string | null;
    UPDATED_DATE: Date | null;
  }) {
    return {
      leaveId: row.LEAVE_ID,
      employeeId: row.EMPLOYEE_ID,
      leaveTypeId: row.LEAVE_TYPE_ID,
      leaveType: row.LEAVE_TYPE,
      startDate: dateOnly(row.START_DATE),
      endDate: dateOnly(row.END_DATE),
      days: Number(row.DAYS),
      reason: row.REASON,
      status: row.STATUS,
      approvedById: row.APPROVED_BY_ID,
      approvedBy: row.APPROVED_BY,
      approvedAt: row.APPROVED_AT?.toISOString() ?? null,
      decisionNote: row.DECISION_NOTE,
      hodDecisionById: row.HOD_DECISION_BY_ID,
      hodDecisionBy: row.HOD_DECISION_BY,
      hodDecisionAt: row.HOD_DECISION_AT?.toISOString() ?? null,
      hodNote: row.HOD_NOTE,
      approverEmployeeId: row.APPROVER_EMPLOYEE_ID,
      createdBy: row.CREATED_BY,
      createdAt: row.CREATED_DATE.toISOString(),
      updatedBy: row.UPDATED_BY,
      updatedAt: row.UPDATED_DATE?.toISOString() ?? null,
    };
  }

  private async holidayIsosInRange(start: Date, end: Date): Promise<string[]> {
    const rows = await this.prisma.hrPublicHolidays.findMany({
      where: {
        HOLIDAY_DATE: { gte: start, lte: end },
      },
      select: { HOLIDAY_DATE: true },
    });
    return rows.map((r) => toDateOnlyIso(r.HOLIDAY_DATE));
  }

  private async isHodOrDeputy(employeeId: number): Promise<{
    isHod: boolean;
    departmentIds: number[];
  }> {
    const rows = await this.prisma.hrDepartmentHeads.findMany({
      where: {
        OR: [
          { HEAD_EMPLOYEE_ID: employeeId },
          { DEPUTY_EMPLOYEE_ID: employeeId },
        ],
      },
      select: { DEPARTMENT_ID: true },
    });
    return {
      isHod: rows.length > 0,
      departmentIds: rows.map((r) => r.DEPARTMENT_ID),
    };
  }

  private async resolveInitialStatus(
    employee: { EMPLOYEE_ID: number; DEPARTMENT_ID: number | null },
  ): Promise<'PendingHod' | 'PendingHr'> {
    if (employee.DEPARTMENT_ID == null) return 'PendingHr';
    const head = await this.prisma.hrDepartmentHeads.findUnique({
      where: { DEPARTMENT_ID: employee.DEPARTMENT_ID },
    });
    if (!head) return 'PendingHr';
    if (
      head.HEAD_EMPLOYEE_ID === employee.EMPLOYEE_ID ||
      head.DEPUTY_EMPLOYEE_ID === employee.EMPLOYEE_ID
    ) {
      return 'PendingHr';
    }
    return 'PendingHod';
  }

  async getBalancesForEmployee(employeeId: number, asOf: Date = new Date()) {
    const { yearStart, yearEnd } = leaveYearBounds(asOf);
    const types = await this.prisma.hrLeaveTypes.findMany({
      where: { IS_ACTIVE: true },
      orderBy: { NAME: 'asc' },
    });
    const requests = await this.prisma.hrLeaveRequests.findMany({
      where: {
        EMPLOYEE_ID: employeeId,
        STATUS: { in: [...ACTIVE_LEAVE_STATUSES] },
        START_DATE: { gte: yearStart, lte: yearEnd },
      },
      select: {
        LEAVE_TYPE_ID: true,
        LEAVE_TYPE: true,
        DAYS: true,
        STATUS: true,
      },
    });

    return types.map((t) => {
      const matching = requests.filter(
        (r) =>
          r.LEAVE_TYPE_ID === t.LEAVE_TYPE_ID ||
          (!r.LEAVE_TYPE_ID &&
            r.LEAVE_TYPE.toLowerCase() === t.NAME.toLowerCase()),
      );
      const approved = matching
        .filter((r) => r.STATUS === 'Approved')
        .reduce((s, r) => s + Number(r.DAYS), 0);
      const pending = matching
        .filter((r) => r.STATUS === 'PendingHod' || r.STATUS === 'PendingHr')
        .reduce((s, r) => s + Number(r.DAYS), 0);
      const used = approved + pending;
      return {
        leaveTypeId: t.LEAVE_TYPE_ID,
        code: t.CODE,
        name: t.NAME,
        daysPerYear: t.DAYS_PER_YEAR,
        approved,
        pending,
        remaining:
          t.DAYS_PER_YEAR === 0
            ? null
            : Math.max(0, t.DAYS_PER_YEAR - used),
      };
    });
  }

  private async assertNoOverlap(
    employeeId: number,
    start: Date,
    end: Date,
    excludeLeaveId?: number,
  ): Promise<void> {
    const existing = await this.prisma.hrLeaveRequests.findMany({
      where: {
        EMPLOYEE_ID: employeeId,
        STATUS: { in: [...ACTIVE_LEAVE_STATUSES] },
        ...(excludeLeaveId != null
          ? { NOT: { LEAVE_ID: excludeLeaveId } }
          : {}),
      },
      select: {
        LEAVE_ID: true,
        START_DATE: true,
        END_DATE: true,
        STATUS: true,
      },
    });
    for (const row of existing) {
      if (datesOverlap(start, end, row.START_DATE, row.END_DATE)) {
        throw new ConflictException(
          `Leave dates overlap existing request #${row.LEAVE_ID} (${row.STATUS})`,
        );
      }
    }
  }

  private async assertBalance(
    employeeId: number,
    leaveTypeId: number | null,
    leaveTypeName: string,
    days: number,
    asOf: Date,
  ): Promise<void> {
    let type = leaveTypeId
      ? await this.prisma.hrLeaveTypes.findUnique({
          where: { LEAVE_TYPE_ID: leaveTypeId },
        })
      : await this.prisma.hrLeaveTypes.findFirst({
          where: { NAME: { equals: leaveTypeName, mode: 'insensitive' } },
        });
    if (!type) {
      type = await this.prisma.hrLeaveTypes.findFirst({
        where: { CODE: { equals: leaveTypeName.toUpperCase(), mode: 'insensitive' } },
      });
    }
    if (!type || type.DAYS_PER_YEAR === 0) return;

    const balances = await this.getBalancesForEmployee(employeeId, asOf);
    const bal = balances.find((b) => b.leaveTypeId === type!.LEAVE_TYPE_ID);
    const remaining = bal?.remaining ?? type.DAYS_PER_YEAR;
    if (remaining != null && days > remaining) {
      throw new BadRequestException(
        `Insufficient leave balance for ${type.NAME}: requested ${days}, remaining ${remaining}`,
      );
    }
  }

  private canSelfApproveLeave(user: AuthUser): boolean {
    return user.roles.some((r) => {
      const n = normalizeRoleName(r);
      return (
        n === ROLES.SUPER_ADMIN || n === ROLES.ADMIN || n === ROLES.CMD
      );
    });
  }

  private async notifyUserSafe(
    userId: number | null | undefined,
    payload: {
      type: string;
      title: string;
      body?: string;
      linkPath?: string;
      entityId?: number;
    },
  ): Promise<void> {
    if (userId == null) return;
    try {
      await this.notifications.createForUser({
        userId,
        type: payload.type,
        title: payload.title,
        body: payload.body ?? null,
        linkPath: payload.linkPath ?? '/account/hr/leave',
        entity: 'HR_LEAVE_REQUESTS',
        entityId: payload.entityId ?? null,
      });
    } catch {
      // never block leave mutations on notify failure
    }
  }

  private async emailUserSafe(
    userId: number | null | undefined,
    subject: string,
    body: string,
  ): Promise<void> {
    if (userId == null) return;
    try {
      const u = await this.prisma.users.findUnique({
        where: { USER_ID: userId },
        select: { EMAIL_ADDRESS: true },
      });
      if (!u?.EMAIL_ADDRESS) return;
      await this.email.send({
        to: u.EMAIL_ADDRESS,
        subject,
        html: `<p>${body}</p>`,
        text: body,
      });
    } catch {
      // optional channel
    }
  }

  private async notifyHodForDepartment(
    departmentId: number,
    payload: {
      type: string;
      title: string;
      body?: string;
      entityId?: number;
    },
  ): Promise<void> {
    const head = await this.prisma.hrDepartmentHeads.findUnique({
      where: { DEPARTMENT_ID: departmentId },
    });
    if (!head) return;
    const empIds = [head.HEAD_EMPLOYEE_ID, head.DEPUTY_EMPLOYEE_ID].filter(
      (id): id is number => id != null,
    );
    const emps = await this.prisma.hrEmployees.findMany({
      where: { EMPLOYEE_ID: { in: empIds } },
      select: { USER_ID: true },
    });
    for (const e of emps) {
      await this.notifyUserSafe(e.USER_ID, {
        ...payload,
        linkPath: '/account/hr/team',
      });
    }
  }

  private async notifyHrRole(payload: {
    type: string;
    title: string;
    body?: string;
    entityId?: number;
  }): Promise<void> {
    const users = await this.prisma.users.findMany({
      where: { role: { ROLE_NAME: { equals: ROLES.HR, mode: 'insensitive' } } },
      select: { USER_ID: true },
      take: 50,
    });
    for (const u of users) {
      await this.notifyUserSafe(u.USER_ID, {
        ...payload,
        linkPath: '/dashboard/hr/leave',
      });
    }
  }

  async getSummary(user: AuthUser) {
    const employee = await this.requireLinkedEmployee(user);
    const balances = await this.getBalancesForEmployee(employee.EMPLOYEE_ID);
    const pendingCount = await this.prisma.hrLeaveRequests.count({
      where: {
        EMPLOYEE_ID: employee.EMPLOYEE_ID,
        STATUS: { in: ['PendingHod', 'PendingHr'] },
      },
    });

    const now = new Date();
    const monthStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    );
    const monthEnd = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999),
    );
    const attendanceRows = await this.prisma.hrAttendance.findMany({
      where: {
        EMPLOYEE_ID: employee.EMPLOYEE_ID,
        WORK_DATE: { gte: monthStart, lte: monthEnd },
      },
      select: { STATUS: true },
    });
    const attendanceMonth = {
      present: attendanceRows.filter((r) => r.STATUS === 'Present').length,
      late: attendanceRows.filter((r) => r.STATUS === 'Late').length,
      absent: attendanceRows.filter((r) => r.STATUS === 'Absent').length,
      onLeave: attendanceRows.filter((r) => r.STATUS === 'OnLeave').length,
      total: attendanceRows.length,
    };

    const latestAppraisal = await this.prisma.hrAppraisals.findFirst({
      where: { EMPLOYEE_ID: employee.EMPLOYEE_ID, STATUS: 'Final' },
      orderBy: { CREATED_DATE: 'desc' },
    });
    const latestPayslip = await this.prisma.hrPayrollLines.findFirst({
      where: {
        EMPLOYEE_ID: employee.EMPLOYEE_ID,
        run: { STATUS: 'Locked' },
      },
      orderBy: { LINE_ID: 'desc' },
      include: { run: true },
    });

    const hod = await this.isHodOrDeputy(employee.EMPLOYEE_ID);

    return {
      employee: this.mapEmployeeBrief(employee),
      isHod: hod.isHod,
      hodDepartmentIds: hod.departmentIds,
      balances,
      pendingLeaveCount: pendingCount,
      attendanceMonth,
      latestAppraisal: latestAppraisal
        ? {
            appraisalId: latestAppraisal.APPRAISAL_ID,
            periodLabel: latestAppraisal.PERIOD_LABEL,
            performanceScore: latestAppraisal.PERFORMANCE_SCORE,
            band: latestAppraisal.BAND,
            status: latestAppraisal.STATUS,
          }
        : null,
      latestPayslip: latestPayslip
        ? {
            lineId: latestPayslip.LINE_ID,
            periodYear: latestPayslip.run.PERIOD_YEAR,
            periodMonth: latestPayslip.run.PERIOD_MONTH,
            netPay: decimalToNumber(latestPayslip.NET_PAY),
          }
        : null,
    };
  }

  async listMyLeave(user: AuthUser) {
    const employee = await this.requireLinkedEmployee(user);
    const rows = await this.prisma.hrLeaveRequests.findMany({
      where: { EMPLOYEE_ID: employee.EMPLOYEE_ID },
      orderBy: { CREATED_DATE: 'desc' },
    });
    return { items: rows.map((r) => this.mapLeave(r)) };
  }

  async listMyBalances(user: AuthUser) {
    const employee = await this.requireLinkedEmployee(user);
    return { items: await this.getBalancesForEmployee(employee.EMPLOYEE_ID) };
  }

  async createMyLeave(dto: CreateSelfLeaveDto, user: AuthUser) {
    const employee = await this.requireLinkedEmployee(user);
    if (!dto.leaveTypeId && !dto.leaveType) {
      throw new BadRequestException('leaveTypeId or leaveType is required');
    }

    let leaveTypeId = dto.leaveTypeId ?? null;
    let leaveTypeName = dto.leaveType ?? '';

    if (leaveTypeId != null) {
      const t = await this.prisma.hrLeaveTypes.findUnique({
        where: { LEAVE_TYPE_ID: leaveTypeId },
      });
      if (!t || !t.IS_ACTIVE) {
        throw new BadRequestException('Leave type not found or inactive');
      }
      leaveTypeName = t.NAME;
    } else {
      const t = await this.prisma.hrLeaveTypes.findFirst({
        where: {
          OR: [
            { NAME: { equals: leaveTypeName, mode: 'insensitive' } },
            { CODE: { equals: leaveTypeName.toUpperCase() } },
          ],
          IS_ACTIVE: true,
        },
      });
      if (t) {
        leaveTypeId = t.LEAVE_TYPE_ID;
        leaveTypeName = t.NAME;
      }
    }

    const start = parseDateOnlyUtc(dto.startDate);
    const end = parseDateOnlyUtc(dto.endDate);
    if (end.getTime() < start.getTime()) {
      throw new BadRequestException('endDate must be on or after startDate');
    }

    const holidays = await this.holidayIsosInRange(start, end);
    const days = countWorkingDays(start, end, holidays);
    if (days <= 0) {
      throw new BadRequestException(
        'Leave range contains no working days (Mon–Fri excluding public holidays)',
      );
    }

    await this.assertNoOverlap(employee.EMPLOYEE_ID, start, end);
    await this.assertBalance(
      employee.EMPLOYEE_ID,
      leaveTypeId,
      leaveTypeName,
      days,
      start,
    );

    const status = await this.resolveInitialStatus(employee);
    const label = actorLabel(user);
    const now = new Date();

    const row = await this.prisma.hrLeaveRequests.create({
      data: {
        EMPLOYEE_ID: employee.EMPLOYEE_ID,
        LEAVE_TYPE_ID: leaveTypeId,
        LEAVE_TYPE: leaveTypeName,
        START_DATE: start,
        END_DATE: end,
        DAYS: new Prisma.Decimal(days),
        REASON: dto.reason?.trim() ?? null,
        STATUS: status,
        CREATED_BY_ID: user.id,
        CREATED_BY: label,
        CREATED_DATE: now,
      },
    });

    await this.audit.log({
      type: 'hr:leave:create',
      entity: 'HR_LEAVE_REQUESTS',
      entityId: row.LEAVE_ID,
      userId: user.id,
      createdBy: label,
      newValue: { status, days, source: 'self-service' },
    });

    const title = `Leave request #${row.LEAVE_ID} submitted`;
    const body = `${employee.FIRST_NAME} ${employee.LAST_NAME}: ${leaveTypeName} ${toDateOnlyIso(start)}–${toDateOnlyIso(end)} (${days} days)`;
    if (status === 'PendingHod' && employee.DEPARTMENT_ID != null) {
      await this.notifyHodForDepartment(employee.DEPARTMENT_ID, {
        type: 'hr:leave:pending-hod',
        title,
        body,
        entityId: row.LEAVE_ID,
      });
    } else {
      await this.notifyHrRole({
        type: 'hr:leave:pending-hr',
        title,
        body,
        entityId: row.LEAVE_ID,
      });
    }

    return this.mapLeave(row);
  }

  async cancelMyLeave(leaveId: number, user: AuthUser) {
    const employee = await this.requireLinkedEmployee(user);
    const existing = await this.prisma.hrLeaveRequests.findUnique({
      where: { LEAVE_ID: leaveId },
    });
    if (!existing) throw new NotFoundException('Leave request not found');
    if (existing.EMPLOYEE_ID !== employee.EMPLOYEE_ID) {
      throw new ForbiddenException('You can only cancel your own leave');
    }
    if (
      existing.STATUS !== 'PendingHod' &&
      existing.STATUS !== 'PendingHr'
    ) {
      throw new ConflictException(
        'Only PendingHod or PendingHr leave can be cancelled',
      );
    }

    const label = actorLabel(user);
    const now = new Date();
    const row = await this.prisma.hrLeaveRequests.update({
      where: { LEAVE_ID: leaveId },
      data: {
        STATUS: 'Cancelled',
        UPDATED_BY_ID: user.id,
        UPDATED_BY: label,
        UPDATED_DATE: now,
      },
    });

    await this.audit.log({
      type: 'hr:leave:cancel',
      entity: 'HR_LEAVE_REQUESTS',
      entityId: leaveId,
      userId: user.id,
      createdBy: label,
    });

    return this.mapLeave(row);
  }

  async listTeamLeave(user: AuthUser) {
    const employee = await this.requireLinkedEmployee(user);
    const hod = await this.isHodOrDeputy(employee.EMPLOYEE_ID);
    if (!hod.isHod) {
      throw new ForbiddenException('You are not a head of department');
    }

    const deptEmployees = await this.prisma.hrEmployees.findMany({
      where: { DEPARTMENT_ID: { in: hod.departmentIds } },
      select: { EMPLOYEE_ID: true },
    });
    const empIds = deptEmployees.map((e) => e.EMPLOYEE_ID);
    const rows = await this.prisma.hrLeaveRequests.findMany({
      where: {
        EMPLOYEE_ID: { in: empIds },
        STATUS: 'PendingHod',
      },
      orderBy: { CREATED_DATE: 'asc' },
    });

    const items = [];
    for (const row of rows) {
      const balances = await this.getBalancesForEmployee(row.EMPLOYEE_ID, row.START_DATE);
      const othersOff = await this.prisma.hrLeaveRequests.findMany({
        where: {
          EMPLOYEE_ID: {
            in: empIds.filter((id) => id !== row.EMPLOYEE_ID),
          },
          STATUS: { in: [...ACTIVE_LEAVE_STATUSES] },
          START_DATE: { lte: row.END_DATE },
          END_DATE: { gte: row.START_DATE },
        },
        select: {
          LEAVE_ID: true,
          EMPLOYEE_ID: true,
          START_DATE: true,
          END_DATE: true,
          STATUS: true,
        },
      });
      items.push({
        ...this.mapLeave(row),
        balances,
        othersOff: othersOff.map((o) => ({
          leaveId: o.LEAVE_ID,
          employeeId: o.EMPLOYEE_ID,
          startDate: dateOnly(o.START_DATE),
          endDate: dateOnly(o.END_DATE),
          status: o.STATUS,
        })),
      });
    }
    return { items };
  }

  async hodApprove(leaveId: number, user: AuthUser) {
    const actor = await this.requireLinkedEmployee(user);
    const existing = await this.prisma.hrLeaveRequests.findUnique({
      where: { LEAVE_ID: leaveId },
    });
    if (!existing) throw new NotFoundException('Leave request not found');
    if (existing.STATUS !== 'PendingHod') {
      throw new ConflictException('Leave is not awaiting HOD approval');
    }
    if (existing.EMPLOYEE_ID === actor.EMPLOYEE_ID) {
      throw new ForbiddenException('You cannot approve your own leave request');
    }

    const requester = await this.prisma.hrEmployees.findUnique({
      where: { EMPLOYEE_ID: existing.EMPLOYEE_ID },
    });
    if (!requester?.DEPARTMENT_ID) {
      throw new ForbiddenException('Requester has no department for HOD routing');
    }
    const head = await this.prisma.hrDepartmentHeads.findUnique({
      where: { DEPARTMENT_ID: requester.DEPARTMENT_ID },
    });
    if (
      !head ||
      (head.HEAD_EMPLOYEE_ID !== actor.EMPLOYEE_ID &&
        head.DEPUTY_EMPLOYEE_ID !== actor.EMPLOYEE_ID)
    ) {
      throw new ForbiddenException('Not HOD/deputy for this requester department');
    }

    const label = actorLabel(user);
    const now = new Date();
    const row = await this.prisma.hrLeaveRequests.update({
      where: { LEAVE_ID: leaveId },
      data: {
        STATUS: 'PendingHr',
        HOD_DECISION_BY_ID: user.id,
        HOD_DECISION_BY: label,
        HOD_DECISION_AT: now,
        APPROVER_EMPLOYEE_ID: actor.EMPLOYEE_ID,
        UPDATED_BY_ID: user.id,
        UPDATED_BY: label,
        UPDATED_DATE: now,
      },
    });

    await this.audit.log({
      type: 'hr:leave:hod-approve',
      entity: 'HR_LEAVE_REQUESTS',
      entityId: leaveId,
      userId: user.id,
      createdBy: label,
    });

    await this.notifyHrRole({
      type: 'hr:leave:pending-hr',
      title: `Leave #${leaveId} awaiting HR`,
      body: `HOD approved; ready for HR final decision`,
      entityId: leaveId,
    });
    await this.notifyUserSafe(requester.USER_ID, {
      type: 'hr:leave:hod-approved',
      title: `Leave #${leaveId} approved by HOD`,
      body: 'Your leave is now awaiting HR approval',
      entityId: leaveId,
    });

    return this.mapLeave(row);
  }

  async hodReject(leaveId: number, dto: HodRejectLeaveDto, user: AuthUser) {
    const actor = await this.requireLinkedEmployee(user);
    const existing = await this.prisma.hrLeaveRequests.findUnique({
      where: { LEAVE_ID: leaveId },
    });
    if (!existing) throw new NotFoundException('Leave request not found');
    if (existing.STATUS !== 'PendingHod') {
      throw new ConflictException('Leave is not awaiting HOD approval');
    }
    if (existing.EMPLOYEE_ID === actor.EMPLOYEE_ID) {
      throw new ForbiddenException('You cannot reject your own leave request');
    }

    const requester = await this.prisma.hrEmployees.findUnique({
      where: { EMPLOYEE_ID: existing.EMPLOYEE_ID },
    });
    if (!requester?.DEPARTMENT_ID) {
      throw new ForbiddenException('Requester has no department for HOD routing');
    }
    const head = await this.prisma.hrDepartmentHeads.findUnique({
      where: { DEPARTMENT_ID: requester.DEPARTMENT_ID },
    });
    if (
      !head ||
      (head.HEAD_EMPLOYEE_ID !== actor.EMPLOYEE_ID &&
        head.DEPUTY_EMPLOYEE_ID !== actor.EMPLOYEE_ID)
    ) {
      throw new ForbiddenException('Not HOD/deputy for this requester department');
    }

    const label = actorLabel(user);
    const now = new Date();
    const row = await this.prisma.hrLeaveRequests.update({
      where: { LEAVE_ID: leaveId },
      data: {
        STATUS: 'Rejected',
        HOD_DECISION_BY_ID: user.id,
        HOD_DECISION_BY: label,
        HOD_DECISION_AT: now,
        HOD_NOTE: dto.note.trim(),
        APPROVER_EMPLOYEE_ID: actor.EMPLOYEE_ID,
        UPDATED_BY_ID: user.id,
        UPDATED_BY: label,
        UPDATED_DATE: now,
      },
    });

    await this.audit.log({
      type: 'hr:leave:hod-reject',
      entity: 'HR_LEAVE_REQUESTS',
      entityId: leaveId,
      userId: user.id,
      createdBy: label,
    });

    await this.notifyUserSafe(requester.USER_ID, {
      type: 'hr:leave:hod-rejected',
      title: `Leave #${leaveId} rejected by HOD`,
      body: dto.note.trim(),
      entityId: leaveId,
    });
    await this.emailUserSafe(
      requester.USER_ID,
      `Leave #${leaveId} rejected`,
      dto.note.trim(),
    );

    return this.mapLeave(row);
  }

  // ---- Phase 3: attendance, appraisals, payslips, profile ----

  async listMyAttendance(user: AuthUser, query: SelfAttendanceQueryDto) {
    const employee = await this.requireLinkedEmployee(user);
    const now = new Date();
    let year = now.getUTCFullYear();
    let month = now.getUTCMonth() + 1;
    if (query.month) {
      const m = /^(\d{4})-(\d{2})$/.exec(query.month.trim());
      if (!m) throw new BadRequestException('month must be YYYY-MM');
      year = Number(m[1]);
      month = Number(m[2]);
      if (month < 1 || month > 12) {
        throw new BadRequestException('month must be YYYY-MM');
      }
    }
    const start = new Date(Date.UTC(year, month - 1, 1));
    const end = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
    const rows = await this.prisma.hrAttendance.findMany({
      where: {
        EMPLOYEE_ID: employee.EMPLOYEE_ID,
        WORK_DATE: { gte: start, lte: end },
      },
      orderBy: { WORK_DATE: 'asc' },
    });
    const summary = {
      present: rows.filter((r) => r.STATUS === 'Present').length,
      late: rows.filter((r) => r.STATUS === 'Late').length,
      absent: rows.filter((r) => r.STATUS === 'Absent').length,
      onLeave: rows.filter((r) => r.STATUS === 'OnLeave').length,
      earlyLeave: rows.filter((r) => r.STATUS === 'EarlyLeave').length,
      total: rows.length,
    };
    return {
      month: `${year}-${String(month).padStart(2, '0')}`,
      summary,
      items: rows.map((r) => ({
        attendanceId: r.ATTENDANCE_ID,
        workDate: dateOnly(r.WORK_DATE),
        status: r.STATUS,
        checkIn: r.CHECK_IN?.toISOString() ?? null,
        checkOut: r.CHECK_OUT?.toISOString() ?? null,
        shift: r.SHIFT,
        notes: r.NOTES,
      })),
    };
  }

  async listMyAppraisals(user: AuthUser) {
    const employee = await this.requireLinkedEmployee(user);
    const rows = await this.prisma.hrAppraisals.findMany({
      where: { EMPLOYEE_ID: employee.EMPLOYEE_ID, STATUS: 'Final' },
      orderBy: { CREATED_DATE: 'desc' },
    });
    return {
      items: rows.map((r) => ({
        appraisalId: r.APPRAISAL_ID,
        periodLabel: r.PERIOD_LABEL,
        attendanceScore: r.ATTENDANCE_SCORE,
        productivityScore: r.PRODUCTIVITY_SCORE,
        efficiencyScore: r.EFFICIENCY_SCORE,
        complianceScore: r.COMPLIANCE_SCORE,
        performanceScore: r.PERFORMANCE_SCORE,
        band: r.BAND,
        comments: r.COMMENTS,
        status: r.STATUS,
        reviewerName: r.REVIEWER_NAME,
        createdAt: r.CREATED_DATE.toISOString(),
      })),
    };
  }

  async listMyPayslips(user: AuthUser) {
    const employee = await this.requireLinkedEmployee(user);
    const rows = await this.prisma.hrPayrollLines.findMany({
      where: {
        EMPLOYEE_ID: employee.EMPLOYEE_ID,
        run: { STATUS: 'Locked' },
      },
      include: { run: true },
      orderBy: [{ run: { PERIOD_YEAR: 'desc' } }, { run: { PERIOD_MONTH: 'desc' } }],
    });
    return {
      items: rows.map((r) => ({
        lineId: r.LINE_ID,
        runId: r.RUN_ID,
        periodYear: r.run.PERIOD_YEAR,
        periodMonth: r.run.PERIOD_MONTH,
        basic: decimalToNumber(r.BASIC),
        allowances: decimalToNumber(r.ALLOWANCES),
        deductions: decimalToNumber(r.DEDUCTIONS),
        paye: decimalToNumber(r.PAYE),
        pension: decimalToNumber(r.PENSION),
        netPay: decimalToNumber(r.NET_PAY),
        status: r.STATUS,
      })),
    };
  }

  async getMyPayslip(lineId: number, user: AuthUser) {
    const employee = await this.requireLinkedEmployee(user);
    const row = await this.prisma.hrPayrollLines.findUnique({
      where: { LINE_ID: lineId },
      include: { run: true },
    });
    if (!row || row.run.STATUS !== 'Locked') {
      throw new NotFoundException('Payslip not found');
    }
    if (row.EMPLOYEE_ID !== employee.EMPLOYEE_ID) {
      throw new ForbiddenException('You cannot view another employee payslip');
    }
    return {
      lineId: row.LINE_ID,
      runId: row.RUN_ID,
      periodYear: row.run.PERIOD_YEAR,
      periodMonth: row.run.PERIOD_MONTH,
      basic: decimalToNumber(row.BASIC),
      allowances: decimalToNumber(row.ALLOWANCES),
      deductions: decimalToNumber(row.DEDUCTIONS),
      paye: decimalToNumber(row.PAYE),
      pension: decimalToNumber(row.PENSION),
      netPay: decimalToNumber(row.NET_PAY),
      status: row.STATUS,
      lockedAt: row.run.LOCKED_AT?.toISOString() ?? null,
    };
  }

  async getMyProfile(user: AuthUser) {
    const employee = await this.requireLinkedEmployee(user);
    return this.mapEmployeeBrief(employee);
  }

  async updateMyProfile(dto: UpdateSelfProfileDto, user: AuthUser) {
    const employee = await this.requireLinkedEmployee(user);
    const label = actorLabel(user);
    const now = new Date();
    const oldValue = {
      email: employee.EMAIL,
      phone: employee.PHONE,
      nextOfKin: employee.NEXT_OF_KIN,
      nextOfKinPhone: employee.NEXT_OF_KIN_PHONE,
      emergencyContact: employee.EMERGENCY_CONTACT,
      emergencyPhone: employee.EMERGENCY_PHONE,
    };

    const row = await this.prisma.hrEmployees.update({
      where: { EMPLOYEE_ID: employee.EMPLOYEE_ID },
      data: {
        ...(dto.email !== undefined
          ? { EMAIL: dto.email?.trim() ?? null }
          : {}),
        ...(dto.phone !== undefined
          ? { PHONE: dto.phone?.trim() ?? null }
          : {}),
        ...(dto.nextOfKin !== undefined
          ? { NEXT_OF_KIN: dto.nextOfKin?.trim() ?? null }
          : {}),
        ...(dto.nextOfKinPhone !== undefined
          ? { NEXT_OF_KIN_PHONE: dto.nextOfKinPhone?.trim() ?? null }
          : {}),
        ...(dto.emergencyContact !== undefined
          ? { EMERGENCY_CONTACT: dto.emergencyContact?.trim() ?? null }
          : {}),
        ...(dto.emergencyPhone !== undefined
          ? { EMERGENCY_PHONE: dto.emergencyPhone?.trim() ?? null }
          : {}),
        UPDATED_BY_ID: user.id,
        UPDATED_BY: label,
        UPDATED_DATE: now,
      },
    });

    await this.audit.log({
      type: 'hr:self:profile:update',
      entity: 'HR_EMPLOYEES',
      entityId: employee.EMPLOYEE_ID,
      userId: user.id,
      createdBy: label,
      oldValue,
      newValue: {
        email: row.EMAIL,
        phone: row.PHONE,
        nextOfKin: row.NEXT_OF_KIN,
        nextOfKinPhone: row.NEXT_OF_KIN_PHONE,
        emergencyContact: row.EMERGENCY_CONTACT,
        emergencyPhone: row.EMERGENCY_PHONE,
      },
    });

    return this.mapEmployeeBrief(row);
  }

  /**
   * Shared final-approve side effects: employee OnLeave if today in range,
   * upsert attendance OnLeave for each working day.
   */
  async applyFinalApprovalEffects(
    employeeId: number,
    start: Date,
    end: Date,
    actorUserId: number,
    actorLabelStr: string,
  ): Promise<void> {
    const today = new Date();
    const todayUtc = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
    );
    if (todayUtc.getTime() >= start.getTime() && todayUtc.getTime() <= end.getTime()) {
      await this.prisma.hrEmployees.update({
        where: { EMPLOYEE_ID: employeeId },
        data: { STATUS: 'OnLeave' },
      });
    }

    const holidays = await this.holidayIsosInRange(start, end);
    const days = eachWorkingDay(start, end, holidays);
    const now = new Date();
    for (const day of days) {
      await this.prisma.hrAttendance.upsert({
        where: {
          EMPLOYEE_ID_WORK_DATE: {
            EMPLOYEE_ID: employeeId,
            WORK_DATE: day,
          },
        },
        create: {
          EMPLOYEE_ID: employeeId,
          WORK_DATE: day,
          STATUS: 'OnLeave',
          CREATED_BY_ID: actorUserId,
          CREATED_BY: actorLabelStr,
          CREATED_DATE: now,
        },
        update: {
          STATUS: 'OnLeave',
          UPDATED_BY_ID: actorUserId,
          UPDATED_BY: actorLabelStr,
          UPDATED_DATE: now,
        },
      });
    }
  }

  async notifyLeaveOutcome(
    employeeUserId: number | null | undefined,
    leaveId: number,
    approved: boolean,
    note?: string | null,
  ): Promise<void> {
    const title = approved
      ? `Leave #${leaveId} approved`
      : `Leave #${leaveId} rejected`;
    await this.notifyUserSafe(employeeUserId, {
      type: approved ? 'hr:leave:approved' : 'hr:leave:rejected',
      title,
      body: note ?? undefined,
      entityId: leaveId,
    });
    await this.emailUserSafe(employeeUserId, title, note ?? title);
  }

  /** Expose self-approve check for HrService final approve. */
  actorMaySelfApprove(user: AuthUser): boolean {
    return this.canSelfApproveLeave(user);
  }
}
