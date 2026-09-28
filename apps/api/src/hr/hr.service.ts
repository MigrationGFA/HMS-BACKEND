import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, HrEmployees } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../auth/types/auth-user.type';
import {
  normalizeRoleName,
  permissionsForRoles,
  PERMISSIONS,
  ROLES,
} from '../common/constants';
import {
  CreateAppraisalDto,
  CreateAttendanceDto,
  CreateDisciplinaryDto,
  CreateDocumentDto,
  CreateHrEmployeeDto,
  CreateLeaveRequestDto,
  DecideLeaveDto,
  ListAttendanceQueryDto,
  ListEmployeesQueryDto,
  ListLeaveQueryDto,
  ListPayrollQueryDto,
  RunPayrollDto,
  UpdateAppraisalDto,
  UpdateAttendanceDto,
  UpdateDisciplinaryDto,
  UpdateHrEmployeeDto,
  UpdateLeaveRequestDto,
  UpdatePayrollLineDto,
} from './dto/hr.dto';

function actorLabel(user: AuthUser): string {
  return (
    [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email
  );
}

function dateOnly(d: Date | null | undefined): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}

function decimalToNumber(
  value: Prisma.Decimal | null | undefined,
): number | null {
  if (value == null) return null;
  return Number(value);
}

function parseDateOnly(iso: string): Date {
  return new Date(`${iso.slice(0, 10)}T00:00:00.000Z`);
}

function pagination(page?: number, limit?: number) {
  const p = Math.max(page ?? 1, 1);
  const l = Math.min(Math.max(limit ?? 50, 1), 200);
  return { page: p, limit: l, skip: (p - 1) * l };
}

function computePerformanceScore(
  att: number,
  prod: number,
  eff: number,
  comp: number,
): number {
  return Math.round(att * 0.2 + prod * 0.4 + eff * 0.2 + comp * 0.2);
}

function performanceBand(score: number): string {
  if (score >= 80) return 'High';
  if (score >= 50) return 'Average';
  return 'Needs Attention';
}

function payrollLineAmounts(basic: number, allowances: number) {
  const paye = Math.round(basic * 0.1 * 100) / 100;
  const pension = Math.round(basic * 0.08 * 100) / 100;
  const deductions = Math.round((paye + pension) * 100) / 100;
  const net = Math.round((basic + allowances - deductions) * 100) / 100;
  return { paye, pension, deductions, net };
}

function startOfMonth(year: number, month: number): Date {
  return new Date(Date.UTC(year, month - 1, 1));
}

function endOfMonth(year: number, month: number): Date {
  return new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
}

function todayDateOnly(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function isDateInRange(
  day: Date,
  start: Date,
  end: Date,
): boolean {
  const t = day.getTime();
  return t >= start.getTime() && t <= end.getTime();
}

@Injectable()
export class HrService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private canLeaveApprove(user: AuthUser): boolean {
    return permissionsForRoles(user.roles).has(PERMISSIONS.HR_LEAVE_APPROVE);
  }

  private canSelfApproveLeave(user: AuthUser): boolean {
    return user.roles.some((r) => {
      const n = normalizeRoleName(r);
      return (
        n === ROLES.SUPER_ADMIN || n === ROLES.ADMIN || n === ROLES.CMD
      );
    });
  }

  private async actorEmployeeId(userId: number): Promise<number | null> {
    const row = await this.prisma.users.findUnique({
      where: { USER_ID: userId },
      select: { EMPLOYEE_ID: true },
    });
    return row?.EMPLOYEE_ID ?? null;
  }

  private mapEmployee(row: HrEmployees) {
    return {
      employeeId: row.EMPLOYEE_ID,
      employeeNo: row.EMPLOYEE_NO,
      userId: row.USER_ID,
      firstName: row.FIRST_NAME,
      lastName: row.LAST_NAME,
      email: row.EMAIL,
      phone: row.PHONE,
      departmentId: row.DEPARTMENT_ID,
      departmentName: row.DEPARTMENT_NAME,
      designation: row.DESIGNATION,
      gradeLevel: row.GRADE_LEVEL,
      cadre: row.CADRE,
      employmentType: row.EMPLOYMENT_TYPE,
      status: row.STATUS,
      dateJoined: dateOnly(row.DATE_JOINED),
      dateOfBirth: dateOnly(row.DATE_OF_BIRTH),
      expectedRetireDate: dateOnly(row.EXPECTED_RETIRE_DATE),
      dateLeft: dateOnly(row.DATE_LEFT),
      qualifications: row.QUALIFICATIONS,
      certifications: row.CERTIFICATIONS,
      licenseNo: row.LICENSE_NO,
      licenseExpiry: dateOnly(row.LICENSE_EXPIRY),
      nextOfKin: row.NEXT_OF_KIN,
      nextOfKinPhone: row.NEXT_OF_KIN_PHONE,
      emergencyContact: row.EMERGENCY_CONTACT,
      emergencyPhone: row.EMERGENCY_PHONE,
      employmentHistory: row.EMPLOYMENT_HISTORY,
      baseSalary: decimalToNumber(row.BASE_SALARY),
      createdBy: row.CREATED_BY,
      createdAt: row.CREATED_DATE.toISOString(),
      updatedBy: row.UPDATED_BY,
      updatedAt: row.UPDATED_DATE?.toISOString() ?? null,
    };
  }

  private mapAttendance(row: {
    ATTENDANCE_ID: number;
    EMPLOYEE_ID: number;
    WORK_DATE: Date;
    CHECK_IN: Date | null;
    CHECK_OUT: Date | null;
    STATUS: string;
    SHIFT: string | null;
    NOTES: string | null;
    CREATED_BY: string | null;
    CREATED_DATE: Date;
    UPDATED_BY: string | null;
    UPDATED_DATE: Date | null;
  }) {
    return {
      attendanceId: row.ATTENDANCE_ID,
      employeeId: row.EMPLOYEE_ID,
      workDate: dateOnly(row.WORK_DATE),
      checkIn: row.CHECK_IN?.toISOString() ?? null,
      checkOut: row.CHECK_OUT?.toISOString() ?? null,
      status: row.STATUS,
      shift: row.SHIFT,
      notes: row.NOTES,
      createdBy: row.CREATED_BY,
      createdAt: row.CREATED_DATE.toISOString(),
      updatedBy: row.UPDATED_BY,
      updatedAt: row.UPDATED_DATE?.toISOString() ?? null,
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
      createdBy: row.CREATED_BY,
      createdAt: row.CREATED_DATE.toISOString(),
      updatedBy: row.UPDATED_BY,
      updatedAt: row.UPDATED_DATE?.toISOString() ?? null,
    };
  }

  private mapAppraisal(row: {
    APPRAISAL_ID: number;
    EMPLOYEE_ID: number;
    PERIOD_LABEL: string;
    ATTENDANCE_SCORE: number;
    PRODUCTIVITY_SCORE: number;
    EFFICIENCY_SCORE: number;
    COMPLIANCE_SCORE: number;
    PERFORMANCE_SCORE: number;
    BAND: string | null;
    COMMENTS: string | null;
    STATUS: string;
    REVIEWER_ID: number | null;
    REVIEWER_NAME: string | null;
    CREATED_BY: string | null;
    CREATED_DATE: Date;
    UPDATED_BY: string | null;
    UPDATED_DATE: Date | null;
  }) {
    return {
      appraisalId: row.APPRAISAL_ID,
      employeeId: row.EMPLOYEE_ID,
      periodLabel: row.PERIOD_LABEL,
      attendanceScore: row.ATTENDANCE_SCORE,
      productivityScore: row.PRODUCTIVITY_SCORE,
      efficiencyScore: row.EFFICIENCY_SCORE,
      complianceScore: row.COMPLIANCE_SCORE,
      performanceScore: row.PERFORMANCE_SCORE,
      band: row.BAND,
      comments: row.COMMENTS,
      status: row.STATUS,
      reviewerId: row.REVIEWER_ID,
      reviewerName: row.REVIEWER_NAME,
      createdBy: row.CREATED_BY,
      createdAt: row.CREATED_DATE.toISOString(),
      updatedBy: row.UPDATED_BY,
      updatedAt: row.UPDATED_DATE?.toISOString() ?? null,
    };
  }

  private mapDisciplinary(row: {
    CASE_ID: number;
    EMPLOYEE_ID: number;
    TITLE: string;
    DESCRIPTION: string | null;
    STATUS: string;
    SEVERITY: string | null;
    OUTCOME: string | null;
    OPENED_DATE: Date;
    CLOSED_DATE: Date | null;
    CREATED_BY: string | null;
    CREATED_DATE: Date;
    UPDATED_BY: string | null;
    UPDATED_DATE: Date | null;
  }) {
    return {
      caseId: row.CASE_ID,
      employeeId: row.EMPLOYEE_ID,
      title: row.TITLE,
      description: row.DESCRIPTION,
      status: row.STATUS,
      severity: row.SEVERITY,
      outcome: row.OUTCOME,
      openedDate: row.OPENED_DATE.toISOString(),
      closedDate: row.CLOSED_DATE?.toISOString() ?? null,
      createdBy: row.CREATED_BY,
      createdAt: row.CREATED_DATE.toISOString(),
      updatedBy: row.UPDATED_BY,
      updatedAt: row.UPDATED_DATE?.toISOString() ?? null,
    };
  }

  private mapDocument(row: {
    DOCUMENT_ID: number;
    EMPLOYEE_ID: number;
    TITLE: string;
    DOC_TYPE: string | null;
    FILE_URL: string | null;
    STORAGE_KEY: string | null;
    STATUS: string;
    CREATED_BY: string | null;
    CREATED_DATE: Date;
    UPDATED_BY: string | null;
    UPDATED_DATE: Date | null;
  }) {
    return {
      documentId: row.DOCUMENT_ID,
      employeeId: row.EMPLOYEE_ID,
      title: row.TITLE,
      docType: row.DOC_TYPE,
      fileUrl: row.FILE_URL,
      storageKey: row.STORAGE_KEY,
      status: row.STATUS,
      createdBy: row.CREATED_BY,
      createdAt: row.CREATED_DATE.toISOString(),
      updatedBy: row.UPDATED_BY,
      updatedAt: row.UPDATED_DATE?.toISOString() ?? null,
    };
  }

  private mapPayrollLine(row: {
    LINE_ID: number;
    RUN_ID: number;
    EMPLOYEE_ID: number;
    BASIC: Prisma.Decimal;
    ALLOWANCES: Prisma.Decimal;
    DEDUCTIONS: Prisma.Decimal;
    PAYE: Prisma.Decimal;
    PENSION: Prisma.Decimal;
    NET_PAY: Prisma.Decimal;
    STATUS: string;
  }) {
    return {
      lineId: row.LINE_ID,
      runId: row.RUN_ID,
      employeeId: row.EMPLOYEE_ID,
      basic: Number(row.BASIC),
      allowances: Number(row.ALLOWANCES),
      deductions: Number(row.DEDUCTIONS),
      paye: Number(row.PAYE),
      pension: Number(row.PENSION),
      netPay: Number(row.NET_PAY),
      status: row.STATUS,
    };
  }

  private mapPayrollRun(
    row: {
      RUN_ID: number;
      PERIOD_YEAR: number;
      PERIOD_MONTH: number;
      STATUS: string;
      TOTAL_GROSS: Prisma.Decimal;
      TOTAL_NET: Prisma.Decimal;
      LOCKED_AT: Date | null;
      LOCKED_BY: string | null;
      LOCKED_BY_ID: number | null;
      CREATED_BY: string | null;
      CREATED_DATE: Date;
      UPDATED_BY: string | null;
      UPDATED_DATE: Date | null;
    },
    lines?: ReturnType<HrService['mapPayrollLine']>[],
  ) {
    return {
      runId: row.RUN_ID,
      periodYear: row.PERIOD_YEAR,
      periodMonth: row.PERIOD_MONTH,
      status: row.STATUS,
      totalGross: Number(row.TOTAL_GROSS),
      totalNet: Number(row.TOTAL_NET),
      lockedAt: row.LOCKED_AT?.toISOString() ?? null,
      lockedBy: row.LOCKED_BY,
      lockedById: row.LOCKED_BY_ID,
      createdBy: row.CREATED_BY,
      createdAt: row.CREATED_DATE.toISOString(),
      updatedBy: row.UPDATED_BY,
      updatedAt: row.UPDATED_DATE?.toISOString() ?? null,
      lines,
    };
  }

  private async ensureEmployee(id: number): Promise<HrEmployees> {
    const row = await this.prisma.hrEmployees.findUnique({
      where: { EMPLOYEE_ID: id },
    });
    if (!row) throw new NotFoundException('Employee not found');
    return row;
  }

  async getDashboard() {
    const now = new Date();
    const today = todayDateOnly();
    const monthStart = startOfMonth(
      now.getUTCFullYear(),
      now.getUTCMonth() + 1,
    );
    const monthEnd = endOfMonth(now.getUTCFullYear(), now.getUTCMonth() + 1);
    const retireHorizon = new Date(today);
    retireHorizon.setUTCMonth(retireHorizon.getUTCMonth() + 12);

    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setUTCDate(sevenDaysAgo.getUTCDate() - 6);

    const [
      totalStaff,
      activeStaff,
      onLeave,
      newEmployees,
      retiringSoon,
      pendingLeaveCount,
      absentToday,
      deptGroups,
      cadreGroups,
      typeGroups,
      attendanceRows,
      finalAppraisals,
      latestLockedPayroll,
    ] = await Promise.all([
      this.prisma.hrEmployees.count(),
      this.prisma.hrEmployees.count({ where: { STATUS: 'Active' } }),
      this.prisma.hrEmployees.count({ where: { STATUS: 'OnLeave' } }),
      this.prisma.hrEmployees.count({
        where: {
          DATE_JOINED: { gte: monthStart, lte: monthEnd },
        },
      }),
      this.prisma.hrEmployees.count({
        where: {
          EXPECTED_RETIRE_DATE: { gte: today, lte: retireHorizon },
        },
      }),
      this.prisma.hrLeaveRequests.count({ where: { STATUS: 'Pending' } }),
      this.prisma.hrAttendance.count({
        where: { WORK_DATE: today, STATUS: 'Absent' },
      }),
      this.prisma.hrEmployees.groupBy({
        by: ['DEPARTMENT_NAME'],
        _count: { _all: true },
      }),
      this.prisma.hrEmployees.groupBy({
        by: ['CADRE'],
        _count: { _all: true },
      }),
      this.prisma.hrEmployees.groupBy({
        by: ['EMPLOYMENT_TYPE'],
        _count: { _all: true },
      }),
      this.prisma.hrAttendance.findMany({
        where: { WORK_DATE: { gte: sevenDaysAgo, lte: today } },
        select: { STATUS: true },
      }),
      this.prisma.hrAppraisals.findMany({
        where: { STATUS: 'Final' },
        orderBy: { CREATED_DATE: 'desc' },
        select: {
          EMPLOYEE_ID: true,
          PERFORMANCE_SCORE: true,
          CREATED_DATE: true,
        },
      }),
      this.prisma.hrPayrollRuns.findFirst({
        where: { STATUS: 'Locked' },
        orderBy: [{ PERIOD_YEAR: 'desc' }, { PERIOD_MONTH: 'desc' }],
      }),
    ]);

    const byDepartment = deptGroups.map((g) => ({
      name: g.DEPARTMENT_NAME?.trim() || 'Unassigned',
      count: g._count._all,
    }));

    const byCadre = cadreGroups.map((g) => ({
      name: g.CADRE?.trim() || 'Unassigned',
      count: g._count._all,
    }));

    const byEmploymentType = {
      permanent: 0,
      contract: 0,
      locum: 0,
      other: 0,
    };
    for (const g of typeGroups) {
      const key = (g.EMPLOYMENT_TYPE ?? '').toLowerCase();
      const count = g._count._all;
      if (key === 'permanent') byEmploymentType.permanent += count;
      else if (key === 'contract') byEmploymentType.contract += count;
      else if (key === 'locum') byEmploymentType.locum += count;
      else byEmploymentType.other += count;
    }

    let attendanceRate7d: number | null = null;
    if (attendanceRows.length > 0) {
      const presentLate = attendanceRows.filter((r) =>
        ['Present', 'Late'].includes(r.STATUS),
      ).length;
      attendanceRate7d =
        Math.round((presentLate / attendanceRows.length) * 10000) / 100;
    }

    const latestByEmployee = new Map<number, number>();
    for (const a of finalAppraisals) {
      if (!latestByEmployee.has(a.EMPLOYEE_ID)) {
        latestByEmployee.set(a.EMPLOYEE_ID, a.PERFORMANCE_SCORE);
      }
    }
    let avgPerformanceScore = 0;
    if (latestByEmployee.size > 0) {
      const sum = [...latestByEmployee.values()].reduce((a, b) => a + b, 0);
      avgPerformanceScore =
        Math.round((sum / latestByEmployee.size) * 100) / 100;
    }

    const monthlyPayrollTotal = latestLockedPayroll
      ? Number(latestLockedPayroll.TOTAL_NET)
      : 0;

    return {
      asOf: now.toISOString(),
      totalStaff,
      activeStaff,
      onLeave,
      absentToday,
      newEmployees,
      retiringSoon,
      byDepartment,
      byCadre,
      byEmploymentType,
      pendingLeaveCount,
      avgPerformanceScore,
      monthlyPayrollTotal,
      attendanceRate7d,
    };
  }

  async listEmployees(query: ListEmployeesQueryDto) {
    const { page, limit, skip } = pagination(query.page, query.limit);
    const where: Prisma.HrEmployeesWhereInput = {
      ...(query.status ? { STATUS: query.status } : {}),
      ...(query.departmentId != null
        ? { DEPARTMENT_ID: query.departmentId }
        : {}),
      ...(query.departmentName
        ? { DEPARTMENT_NAME: query.departmentName }
        : {}),
      ...(query.employmentType
        ? { EMPLOYMENT_TYPE: query.employmentType }
        : {}),
      ...(query.q?.trim()
        ? {
            OR: [
              { FIRST_NAME: { contains: query.q.trim(), mode: 'insensitive' } },
              { LAST_NAME: { contains: query.q.trim(), mode: 'insensitive' } },
              { EMPLOYEE_NO: { contains: query.q.trim(), mode: 'insensitive' } },
              {
                DEPARTMENT_NAME: {
                  contains: query.q.trim(),
                  mode: 'insensitive',
                },
              },
            ],
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.hrEmployees.findMany({
        where,
        orderBy: [{ LAST_NAME: 'asc' }, { FIRST_NAME: 'asc' }],
        skip,
        take: limit,
      }),
      this.prisma.hrEmployees.count({ where }),
    ]);

    return {
      items: rows.map((r) => this.mapEmployee(r)),
      meta: { page, limit, total },
    };
  }

  async getEmployee(id: number) {
    const row = await this.ensureEmployee(id);
    return this.mapEmployee(row);
  }

  async createEmployee(dto: CreateHrEmployeeDto, user: AuthUser) {
    const label = actorLabel(user);
    const now = new Date();
    try {
      const row = await this.prisma.hrEmployees.create({
        data: {
          EMPLOYEE_NO: dto.employeeNo.trim(),
          USER_ID: dto.userId ?? null,
          FIRST_NAME: dto.firstName.trim(),
          LAST_NAME: dto.lastName.trim(),
          EMAIL: dto.email?.trim() ?? null,
          PHONE: dto.phone?.trim() ?? null,
          DEPARTMENT_ID: dto.departmentId ?? null,
          DEPARTMENT_NAME: dto.departmentName?.trim() ?? null,
          DESIGNATION: dto.designation?.trim() ?? null,
          GRADE_LEVEL: dto.gradeLevel?.trim() ?? null,
          CADRE: dto.cadre?.trim() ?? null,
          EMPLOYMENT_TYPE: dto.employmentType ?? 'Permanent',
          STATUS: 'Active',
          DATE_JOINED: dto.dateJoined ? parseDateOnly(dto.dateJoined) : null,
          DATE_OF_BIRTH: dto.dateOfBirth ? parseDateOnly(dto.dateOfBirth) : null,
          EXPECTED_RETIRE_DATE: dto.expectedRetireDate
            ? parseDateOnly(dto.expectedRetireDate)
            : null,
          QUALIFICATIONS: dto.qualifications ?? null,
          CERTIFICATIONS: dto.certifications ?? null,
          LICENSE_NO: dto.licenseNo?.trim() ?? null,
          LICENSE_EXPIRY: dto.licenseExpiry
            ? parseDateOnly(dto.licenseExpiry)
            : null,
          NEXT_OF_KIN: dto.nextOfKin?.trim() ?? null,
          NEXT_OF_KIN_PHONE: dto.nextOfKinPhone?.trim() ?? null,
          EMERGENCY_CONTACT: dto.emergencyContact?.trim() ?? null,
          EMERGENCY_PHONE: dto.emergencyPhone?.trim() ?? null,
          EMPLOYMENT_HISTORY: dto.employmentHistory ?? null,
          BASE_SALARY:
            dto.baseSalary != null ? new Prisma.Decimal(dto.baseSalary) : null,
          CREATED_BY_ID: user.id,
          CREATED_BY: label,
          CREATED_DATE: now,
        },
      });

      await this.audit.log({
        type: 'hr:employee:create',
        entity: 'HR_EMPLOYEES',
        entityId: row.EMPLOYEE_ID,
        userId: user.id,
        createdBy: label,
        newValue: { employeeNo: row.EMPLOYEE_NO },
      });

      return this.mapEmployee(row);
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new ConflictException('Employee number already exists');
      }
      throw e;
    }
  }

  async updateEmployee(id: number, dto: UpdateHrEmployeeDto, user: AuthUser) {
    await this.ensureEmployee(id);
    const label = actorLabel(user);
    const now = new Date();

    const data: Prisma.HrEmployeesUpdateInput = {
      ...(dto.userId !== undefined ? { USER_ID: dto.userId } : {}),
      ...(dto.firstName !== undefined
        ? { FIRST_NAME: dto.firstName.trim() }
        : {}),
      ...(dto.lastName !== undefined ? { LAST_NAME: dto.lastName.trim() } : {}),
      ...(dto.email !== undefined ? { EMAIL: dto.email?.trim() ?? null } : {}),
      ...(dto.phone !== undefined ? { PHONE: dto.phone?.trim() ?? null } : {}),
      ...(dto.departmentId !== undefined
        ? { DEPARTMENT_ID: dto.departmentId }
        : {}),
      ...(dto.departmentName !== undefined
        ? { DEPARTMENT_NAME: dto.departmentName?.trim() ?? null }
        : {}),
      ...(dto.designation !== undefined
        ? { DESIGNATION: dto.designation?.trim() ?? null }
        : {}),
      ...(dto.gradeLevel !== undefined
        ? { GRADE_LEVEL: dto.gradeLevel?.trim() ?? null }
        : {}),
      ...(dto.cadre !== undefined ? { CADRE: dto.cadre?.trim() ?? null } : {}),
      ...(dto.employmentType !== undefined
        ? { EMPLOYMENT_TYPE: dto.employmentType }
        : {}),
      ...(dto.dateJoined !== undefined
        ? {
            DATE_JOINED: dto.dateJoined
              ? parseDateOnly(dto.dateJoined)
              : null,
          }
        : {}),
      ...(dto.dateOfBirth !== undefined
        ? {
            DATE_OF_BIRTH: dto.dateOfBirth
              ? parseDateOnly(dto.dateOfBirth)
              : null,
          }
        : {}),
      ...(dto.expectedRetireDate !== undefined
        ? {
            EXPECTED_RETIRE_DATE: dto.expectedRetireDate
              ? parseDateOnly(dto.expectedRetireDate)
              : null,
          }
        : {}),
      ...(dto.qualifications !== undefined
        ? { QUALIFICATIONS: dto.qualifications }
        : {}),
      ...(dto.certifications !== undefined
        ? { CERTIFICATIONS: dto.certifications }
        : {}),
      ...(dto.licenseNo !== undefined
        ? { LICENSE_NO: dto.licenseNo?.trim() ?? null }
        : {}),
      ...(dto.licenseExpiry !== undefined
        ? {
            LICENSE_EXPIRY: dto.licenseExpiry
              ? parseDateOnly(dto.licenseExpiry)
              : null,
          }
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
      ...(dto.employmentHistory !== undefined
        ? { EMPLOYMENT_HISTORY: dto.employmentHistory }
        : {}),
      ...(dto.baseSalary !== undefined
        ? {
            BASE_SALARY:
              dto.baseSalary != null
                ? new Prisma.Decimal(dto.baseSalary)
                : null,
          }
        : {}),
      UPDATED_BY_ID: user.id,
      UPDATED_BY: label,
      UPDATED_DATE: now,
    };

    const row = await this.prisma.hrEmployees.update({
      where: { EMPLOYEE_ID: id },
      data,
    });

    await this.audit.log({
      type: 'hr:employee:update',
      entity: 'HR_EMPLOYEES',
      entityId: id,
      userId: user.id,
      createdBy: label,
    });

    return this.mapEmployee(row);
  }

  async deactivateEmployee(id: number, user: AuthUser) {
    await this.ensureEmployee(id);
    const label = actorLabel(user);
    const now = new Date();
    const row = await this.prisma.hrEmployees.update({
      where: { EMPLOYEE_ID: id },
      data: {
        STATUS: 'Inactive',
        UPDATED_BY_ID: user.id,
        UPDATED_BY: label,
        UPDATED_DATE: now,
      },
    });

    await this.audit.log({
      type: 'hr:employee:deactivate',
      entity: 'HR_EMPLOYEES',
      entityId: id,
      userId: user.id,
      createdBy: label,
    });

    return this.mapEmployee(row);
  }

  async reactivateEmployee(id: number, user: AuthUser) {
    await this.ensureEmployee(id);
    const label = actorLabel(user);
    const now = new Date();
    const row = await this.prisma.hrEmployees.update({
      where: { EMPLOYEE_ID: id },
      data: {
        STATUS: 'Active',
        UPDATED_BY_ID: user.id,
        UPDATED_BY: label,
        UPDATED_DATE: now,
      },
    });

    await this.audit.log({
      type: 'hr:employee:reactivate',
      entity: 'HR_EMPLOYEES',
      entityId: id,
      userId: user.id,
      createdBy: label,
    });

    return this.mapEmployee(row);
  }

  async listAttendance(query: ListAttendanceQueryDto) {
    const { page, limit, skip } = pagination(query.page, query.limit);
    const where: Prisma.HrAttendanceWhereInput = {
      ...(query.employeeId != null ? { EMPLOYEE_ID: query.employeeId } : {}),
      ...(query.status ? { STATUS: query.status } : {}),
      ...(query.from || query.to
        ? {
            WORK_DATE: {
              ...(query.from ? { gte: parseDateOnly(query.from) } : {}),
              ...(query.to ? { lte: parseDateOnly(query.to) } : {}),
            },
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.hrAttendance.findMany({
        where,
        orderBy: [{ WORK_DATE: 'desc' }, { ATTENDANCE_ID: 'desc' }],
        skip,
        take: limit,
      }),
      this.prisma.hrAttendance.count({ where }),
    ]);

    return {
      items: rows.map((r) => this.mapAttendance(r)),
      meta: { page, limit, total },
    };
  }

  async createAttendance(dto: CreateAttendanceDto, user: AuthUser) {
    await this.ensureEmployee(dto.employeeId);
    const label = actorLabel(user);
    const now = new Date();
    try {
      const row = await this.prisma.hrAttendance.create({
        data: {
          EMPLOYEE_ID: dto.employeeId,
          WORK_DATE: parseDateOnly(dto.workDate),
          CHECK_IN: dto.checkIn ? new Date(dto.checkIn) : null,
          CHECK_OUT: dto.checkOut ? new Date(dto.checkOut) : null,
          STATUS: dto.status ?? 'Present',
          SHIFT: dto.shift?.trim() ?? null,
          NOTES: dto.notes ?? null,
          CREATED_BY_ID: user.id,
          CREATED_BY: label,
          CREATED_DATE: now,
        },
      });

      await this.audit.log({
        type: 'hr:attendance:create',
        entity: 'HR_ATTENDANCE',
        entityId: row.ATTENDANCE_ID,
        userId: user.id,
        createdBy: label,
      });

      return this.mapAttendance(row);
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new ConflictException(
          'Attendance already recorded for this employee and date',
        );
      }
      throw e;
    }
  }

  async updateAttendance(
    id: number,
    dto: UpdateAttendanceDto,
    user: AuthUser,
  ) {
    const existing = await this.prisma.hrAttendance.findUnique({
      where: { ATTENDANCE_ID: id },
    });
    if (!existing) throw new NotFoundException('Attendance record not found');

    const label = actorLabel(user);
    const now = new Date();
    const row = await this.prisma.hrAttendance.update({
      where: { ATTENDANCE_ID: id },
      data: {
        ...(dto.checkIn !== undefined
          ? { CHECK_IN: dto.checkIn ? new Date(dto.checkIn) : null }
          : {}),
        ...(dto.checkOut !== undefined
          ? { CHECK_OUT: dto.checkOut ? new Date(dto.checkOut) : null }
          : {}),
        ...(dto.status !== undefined ? { STATUS: dto.status } : {}),
        ...(dto.shift !== undefined ? { SHIFT: dto.shift?.trim() ?? null } : {}),
        ...(dto.notes !== undefined ? { NOTES: dto.notes } : {}),
        UPDATED_BY_ID: user.id,
        UPDATED_BY: label,
        UPDATED_DATE: now,
      },
    });

    await this.audit.log({
      type: 'hr:attendance:update',
      entity: 'HR_ATTENDANCE',
      entityId: id,
      userId: user.id,
      createdBy: label,
    });

    return this.mapAttendance(row);
  }

  async listLeave(query: ListLeaveQueryDto) {
    const { page, limit, skip } = pagination(query.page, query.limit);
    const where: Prisma.HrLeaveRequestsWhereInput = {
      ...(query.employeeId != null ? { EMPLOYEE_ID: query.employeeId } : {}),
      ...(query.status ? { STATUS: query.status } : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.hrLeaveRequests.findMany({
        where,
        orderBy: [{ CREATED_DATE: 'desc' }],
        skip,
        take: limit,
      }),
      this.prisma.hrLeaveRequests.count({ where }),
    ]);

    return {
      items: rows.map((r) => this.mapLeave(r)),
      meta: { page, limit, total },
    };
  }

  async createLeave(dto: CreateLeaveRequestDto, user: AuthUser) {
    const label = actorLabel(user);
    const now = new Date();
    let employeeId = dto.employeeId;

    if (!this.canLeaveApprove(user)) {
      const linked = await this.actorEmployeeId(user.id);
      if (linked == null) {
        throw new ForbiddenException(
          'Your user account is not linked to an employee record',
        );
      }
      employeeId = linked;
    } else if (employeeId == null) {
      throw new BadRequestException('employeeId is required');
    }

    await this.ensureEmployee(employeeId!);

    const row = await this.prisma.hrLeaveRequests.create({
      data: {
        EMPLOYEE_ID: employeeId!,
        LEAVE_TYPE_ID: dto.leaveTypeId ?? null,
        LEAVE_TYPE: dto.leaveType,
        START_DATE: parseDateOnly(dto.startDate),
        END_DATE: parseDateOnly(dto.endDate),
        DAYS: new Prisma.Decimal(dto.days),
        REASON: dto.reason?.trim() ?? null,
        STATUS: 'Pending',
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
    });

    return this.mapLeave(row);
  }

  async updateLeave(id: number, dto: UpdateLeaveRequestDto, user: AuthUser) {
    const existing = await this.prisma.hrLeaveRequests.findUnique({
      where: { LEAVE_ID: id },
    });
    if (!existing) throw new NotFoundException('Leave request not found');
    if (existing.STATUS !== 'Pending') {
      throw new ConflictException('Only pending leave requests can be updated');
    }

    const label = actorLabel(user);
    const now = new Date();
    const row = await this.prisma.hrLeaveRequests.update({
      where: { LEAVE_ID: id },
      data: {
        ...(dto.leaveTypeId !== undefined
          ? { LEAVE_TYPE_ID: dto.leaveTypeId }
          : {}),
        ...(dto.leaveType !== undefined ? { LEAVE_TYPE: dto.leaveType } : {}),
        ...(dto.startDate !== undefined
          ? { START_DATE: parseDateOnly(dto.startDate) }
          : {}),
        ...(dto.endDate !== undefined
          ? { END_DATE: parseDateOnly(dto.endDate) }
          : {}),
        ...(dto.days !== undefined ? { DAYS: new Prisma.Decimal(dto.days) } : {}),
        ...(dto.reason !== undefined ? { REASON: dto.reason } : {}),
        ...(dto.status === 'Cancelled' ? { STATUS: 'Cancelled' } : {}),
        UPDATED_BY_ID: user.id,
        UPDATED_BY: label,
        UPDATED_DATE: now,
      },
    });

    await this.audit.log({
      type: 'hr:leave:update',
      entity: 'HR_LEAVE_REQUESTS',
      entityId: id,
      userId: user.id,
      createdBy: label,
    });

    return this.mapLeave(row);
  }

  private async applyOnLeaveIfInRange(employeeId: number, start: Date, end: Date) {
    const today = todayDateOnly();
    if (isDateInRange(today, start, end)) {
      await this.prisma.hrEmployees.update({
        where: { EMPLOYEE_ID: employeeId },
        data: { STATUS: 'OnLeave' },
      });
    }
  }

  async approveLeave(id: number, dto: DecideLeaveDto, user: AuthUser) {
    const existing = await this.prisma.hrLeaveRequests.findUnique({
      where: { LEAVE_ID: id },
    });
    if (!existing) throw new NotFoundException('Leave request not found');
    if (existing.STATUS !== 'Pending') {
      throw new ConflictException('Leave request is not pending');
    }

    if (
      existing.EMPLOYEE_ID === (await this.actorEmployeeId(user.id)) &&
      !this.canSelfApproveLeave(user)
    ) {
      throw new ForbiddenException('You cannot approve your own leave request');
    }

    const label = actorLabel(user);
    const now = new Date();
    const row = await this.prisma.hrLeaveRequests.update({
      where: { LEAVE_ID: id },
      data: {
        STATUS: 'Approved',
        APPROVED_BY_ID: user.id,
        APPROVED_BY: label,
        APPROVED_AT: now,
        DECISION_NOTE: dto.decisionNote?.trim() ?? null,
        UPDATED_BY_ID: user.id,
        UPDATED_BY: label,
        UPDATED_DATE: now,
      },
    });

    await this.applyOnLeaveIfInRange(
      existing.EMPLOYEE_ID,
      existing.START_DATE,
      existing.END_DATE,
    );

    await this.audit.log({
      type: 'hr:leave:approve',
      entity: 'HR_LEAVE_REQUESTS',
      entityId: id,
      userId: user.id,
      createdBy: label,
    });

    return this.mapLeave(row);
  }

  async rejectLeave(id: number, dto: DecideLeaveDto, user: AuthUser) {
    const existing = await this.prisma.hrLeaveRequests.findUnique({
      where: { LEAVE_ID: id },
    });
    if (!existing) throw new NotFoundException('Leave request not found');
    if (existing.STATUS !== 'Pending') {
      throw new ConflictException('Leave request is not pending');
    }

    const label = actorLabel(user);
    const now = new Date();
    const row = await this.prisma.hrLeaveRequests.update({
      where: { LEAVE_ID: id },
      data: {
        STATUS: 'Rejected',
        APPROVED_BY_ID: user.id,
        APPROVED_BY: label,
        APPROVED_AT: now,
        DECISION_NOTE: dto.decisionNote?.trim() ?? null,
        UPDATED_BY_ID: user.id,
        UPDATED_BY: label,
        UPDATED_DATE: now,
      },
    });

    await this.audit.log({
      type: 'hr:leave:reject',
      entity: 'HR_LEAVE_REQUESTS',
      entityId: id,
      userId: user.id,
      createdBy: label,
    });

    return this.mapLeave(row);
  }

  async listAppraisals(query: { employeeId?: number; page?: number; limit?: number }) {
    const { page, limit, skip } = pagination(query.page, query.limit);
    const where: Prisma.HrAppraisalsWhereInput = {
      ...(query.employeeId != null ? { EMPLOYEE_ID: query.employeeId } : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.hrAppraisals.findMany({
        where,
        orderBy: [{ CREATED_DATE: 'desc' }],
        skip,
        take: limit,
      }),
      this.prisma.hrAppraisals.count({ where }),
    ]);

    return {
      items: rows.map((r) => this.mapAppraisal(r)),
      meta: { page, limit, total },
    };
  }

  async createAppraisal(dto: CreateAppraisalDto, user: AuthUser) {
    await this.ensureEmployee(dto.employeeId);
    const label = actorLabel(user);
    const now = new Date();
    const att = dto.attendanceScore ?? 0;
    const prod = dto.productivityScore ?? 0;
    const eff = dto.efficiencyScore ?? 0;
    const comp = dto.complianceScore ?? 0;
    const performanceScore = computePerformanceScore(att, prod, eff, comp);
    const band = performanceBand(performanceScore);

    const row = await this.prisma.hrAppraisals.create({
      data: {
        EMPLOYEE_ID: dto.employeeId,
        PERIOD_LABEL: dto.periodLabel.trim(),
        ATTENDANCE_SCORE: att,
        PRODUCTIVITY_SCORE: prod,
        EFFICIENCY_SCORE: eff,
        COMPLIANCE_SCORE: comp,
        PERFORMANCE_SCORE: performanceScore,
        BAND: band,
        COMMENTS: dto.comments ?? null,
        STATUS: dto.status ?? 'Draft',
        REVIEWER_ID: dto.reviewerId ?? null,
        REVIEWER_NAME: dto.reviewerName?.trim() ?? null,
        CREATED_BY_ID: user.id,
        CREATED_BY: label,
        CREATED_DATE: now,
      },
    });

    await this.audit.log({
      type: 'hr:appraisal:create',
      entity: 'HR_APPRAISALS',
      entityId: row.APPRAISAL_ID,
      userId: user.id,
      createdBy: label,
    });

    return this.mapAppraisal(row);
  }

  async updateAppraisal(id: number, dto: UpdateAppraisalDto, user: AuthUser) {
    const existing = await this.prisma.hrAppraisals.findUnique({
      where: { APPRAISAL_ID: id },
    });
    if (!existing) throw new NotFoundException('Appraisal not found');

    const att = dto.attendanceScore ?? existing.ATTENDANCE_SCORE;
    const prod = dto.productivityScore ?? existing.PRODUCTIVITY_SCORE;
    const eff = dto.efficiencyScore ?? existing.EFFICIENCY_SCORE;
    const comp = dto.complianceScore ?? existing.COMPLIANCE_SCORE;
    const performanceScore = computePerformanceScore(att, prod, eff, comp);
    const band = performanceBand(performanceScore);

    const label = actorLabel(user);
    const now = new Date();
    const row = await this.prisma.hrAppraisals.update({
      where: { APPRAISAL_ID: id },
      data: {
        ...(dto.periodLabel !== undefined
          ? { PERIOD_LABEL: dto.periodLabel.trim() }
          : {}),
        ATTENDANCE_SCORE: att,
        PRODUCTIVITY_SCORE: prod,
        EFFICIENCY_SCORE: eff,
        COMPLIANCE_SCORE: comp,
        PERFORMANCE_SCORE: performanceScore,
        BAND: band,
        ...(dto.comments !== undefined ? { COMMENTS: dto.comments } : {}),
        ...(dto.status !== undefined ? { STATUS: dto.status } : {}),
        ...(dto.reviewerId !== undefined ? { REVIEWER_ID: dto.reviewerId } : {}),
        ...(dto.reviewerName !== undefined
          ? { REVIEWER_NAME: dto.reviewerName?.trim() ?? null }
          : {}),
        UPDATED_BY_ID: user.id,
        UPDATED_BY: label,
        UPDATED_DATE: now,
      },
    });

    await this.audit.log({
      type: 'hr:appraisal:update',
      entity: 'HR_APPRAISALS',
      entityId: id,
      userId: user.id,
      createdBy: label,
    });

    return this.mapAppraisal(row);
  }

  async listDisciplinary(query: {
    employeeId?: number;
    status?: string;
    page?: number;
    limit?: number;
  }) {
    const { page, limit, skip } = pagination(query.page, query.limit);
    const where: Prisma.HrDisciplinaryWhereInput = {
      ...(query.employeeId != null ? { EMPLOYEE_ID: query.employeeId } : {}),
      ...(query.status ? { STATUS: query.status } : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.hrDisciplinary.findMany({
        where,
        orderBy: [{ CREATED_DATE: 'desc' }],
        skip,
        take: limit,
      }),
      this.prisma.hrDisciplinary.count({ where }),
    ]);

    return {
      items: rows.map((r) => this.mapDisciplinary(r)),
      meta: { page, limit, total },
    };
  }

  async createDisciplinary(dto: CreateDisciplinaryDto, user: AuthUser) {
    await this.ensureEmployee(dto.employeeId);
    const label = actorLabel(user);
    const now = new Date();
    const row = await this.prisma.hrDisciplinary.create({
      data: {
        EMPLOYEE_ID: dto.employeeId,
        TITLE: dto.title.trim(),
        DESCRIPTION: dto.description ?? null,
        STATUS: dto.status ?? 'Open',
        SEVERITY: dto.severity?.trim() ?? null,
        OUTCOME: dto.outcome ?? null,
        CREATED_BY_ID: user.id,
        CREATED_BY: label,
        CREATED_DATE: now,
      },
    });

    await this.audit.log({
      type: 'hr:disciplinary:create',
      entity: 'HR_DISCIPLINARY',
      entityId: row.CASE_ID,
      userId: user.id,
      createdBy: label,
    });

    return this.mapDisciplinary(row);
  }

  async updateDisciplinary(
    id: number,
    dto: UpdateDisciplinaryDto,
    user: AuthUser,
  ) {
    const existing = await this.prisma.hrDisciplinary.findUnique({
      where: { CASE_ID: id },
    });
    if (!existing) throw new NotFoundException('Disciplinary case not found');

    const label = actorLabel(user);
    const now = new Date();
    const row = await this.prisma.hrDisciplinary.update({
      where: { CASE_ID: id },
      data: {
        ...(dto.title !== undefined ? { TITLE: dto.title.trim() } : {}),
        ...(dto.description !== undefined
          ? { DESCRIPTION: dto.description }
          : {}),
        ...(dto.status !== undefined ? { STATUS: dto.status } : {}),
        ...(dto.severity !== undefined ? { SEVERITY: dto.severity } : {}),
        ...(dto.outcome !== undefined ? { OUTCOME: dto.outcome } : {}),
        ...(dto.closedDate !== undefined
          ? {
              CLOSED_DATE: dto.closedDate
                ? parseDateOnly(dto.closedDate)
                : null,
            }
          : {}),
        UPDATED_BY_ID: user.id,
        UPDATED_BY: label,
        UPDATED_DATE: now,
      },
    });

    await this.audit.log({
      type: 'hr:disciplinary:update',
      entity: 'HR_DISCIPLINARY',
      entityId: id,
      userId: user.id,
      createdBy: label,
    });

    return this.mapDisciplinary(row);
  }

  async listDocuments(query: {
    employeeId?: number;
    includeDeleted?: boolean;
    page?: number;
    limit?: number;
  }) {
    const { page, limit, skip } = pagination(query.page, query.limit);
    const where: Prisma.HrDocumentsWhereInput = {
      ...(query.employeeId != null ? { EMPLOYEE_ID: query.employeeId } : {}),
      ...(!query.includeDeleted ? { STATUS: 'Active' } : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.hrDocuments.findMany({
        where,
        orderBy: [{ CREATED_DATE: 'desc' }],
        skip,
        take: limit,
      }),
      this.prisma.hrDocuments.count({ where }),
    ]);

    return {
      items: rows.map((r) => this.mapDocument(r)),
      meta: { page, limit, total },
    };
  }

  async createDocument(dto: CreateDocumentDto, user: AuthUser) {
    await this.ensureEmployee(dto.employeeId);
    const label = actorLabel(user);
    const now = new Date();
    const row = await this.prisma.hrDocuments.create({
      data: {
        EMPLOYEE_ID: dto.employeeId,
        TITLE: dto.title.trim(),
        DOC_TYPE: dto.docType?.trim() ?? null,
        FILE_URL: dto.fileUrl?.trim() ?? null,
        STORAGE_KEY: dto.storageKey?.trim() ?? null,
        STATUS: 'Active',
        CREATED_BY_ID: user.id,
        CREATED_BY: label,
        CREATED_DATE: now,
      },
    });

    await this.audit.log({
      type: 'hr:document:create',
      entity: 'HR_DOCUMENTS',
      entityId: row.DOCUMENT_ID,
      userId: user.id,
      createdBy: label,
    });

    return this.mapDocument(row);
  }

  async softDeleteDocument(id: number, user: AuthUser) {
    const existing = await this.prisma.hrDocuments.findUnique({
      where: { DOCUMENT_ID: id },
    });
    if (!existing) throw new NotFoundException('Document not found');

    const label = actorLabel(user);
    const now = new Date();
    const row = await this.prisma.hrDocuments.update({
      where: { DOCUMENT_ID: id },
      data: {
        STATUS: 'Deleted',
        UPDATED_BY_ID: user.id,
        UPDATED_BY: label,
        UPDATED_DATE: now,
      },
    });

    await this.audit.log({
      type: 'hr:document:delete',
      entity: 'HR_DOCUMENTS',
      entityId: id,
      userId: user.id,
      createdBy: label,
    });

    return this.mapDocument(row);
  }

  private async recalcPayrollRunTotals(runId: number) {
    const lines = await this.prisma.hrPayrollLines.findMany({
      where: { RUN_ID: runId },
    });
    let totalGross = 0;
    let totalNet = 0;
    for (const line of lines) {
      totalGross += Number(line.BASIC) + Number(line.ALLOWANCES);
      totalNet += Number(line.NET_PAY);
    }
    await this.prisma.hrPayrollRuns.update({
      where: { RUN_ID: runId },
      data: {
        TOTAL_GROSS: new Prisma.Decimal(
          Math.round(totalGross * 100) / 100,
        ),
        TOTAL_NET: new Prisma.Decimal(Math.round(totalNet * 100) / 100),
      },
    });
  }

  async listPayrollRuns(query: ListPayrollQueryDto) {
    const { page, limit, skip } = pagination(query.page, query.limit);
    const where: Prisma.HrPayrollRunsWhereInput = {
      ...(query.year != null ? { PERIOD_YEAR: query.year } : {}),
      ...(query.month != null ? { PERIOD_MONTH: query.month } : {}),
      ...(query.status ? { STATUS: query.status } : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.hrPayrollRuns.findMany({
        where,
        orderBy: [{ PERIOD_YEAR: 'desc' }, { PERIOD_MONTH: 'desc' }],
        skip,
        take: limit,
      }),
      this.prisma.hrPayrollRuns.count({ where }),
    ]);

    return {
      items: rows.map((r) => this.mapPayrollRun(r)),
      meta: { page, limit, total },
    };
  }

  async getPayrollRun(id: number) {
    const run = await this.prisma.hrPayrollRuns.findUnique({
      where: { RUN_ID: id },
    });
    if (!run) throw new NotFoundException('Payroll run not found');

    const lines = await this.prisma.hrPayrollLines.findMany({
      where: { RUN_ID: id },
      orderBy: { LINE_ID: 'asc' },
    });

    return this.mapPayrollRun(
      run,
      lines.map((l) => this.mapPayrollLine(l)),
    );
  }

  async runPayroll(dto: RunPayrollDto, user: AuthUser) {
    const existing = await this.prisma.hrPayrollRuns.findUnique({
      where: {
        PERIOD_YEAR_PERIOD_MONTH: {
          PERIOD_YEAR: dto.year,
          PERIOD_MONTH: dto.month,
        },
      },
      include: { lines: true },
    });

    if (existing) {
      return this.mapPayrollRun(
        existing,
        existing.lines.map((l) => this.mapPayrollLine(l)),
      );
    }

    const label = actorLabel(user);
    const now = new Date();
    const employees = await this.prisma.hrEmployees.findMany({
      where: { STATUS: { in: ['Active', 'OnLeave'] } },
      select: { EMPLOYEE_ID: true, BASE_SALARY: true },
    });

    const run = await this.prisma.$transaction(async (tx) => {
      const created = await tx.hrPayrollRuns.create({
        data: {
          PERIOD_YEAR: dto.year,
          PERIOD_MONTH: dto.month,
          STATUS: 'Draft',
          CREATED_BY_ID: user.id,
          CREATED_BY: label,
          CREATED_DATE: now,
        },
      });

      for (const emp of employees) {
        const basic = Number(emp.BASE_SALARY ?? 0);
        const allowances = 0;
        const { paye, pension, deductions, net } = payrollLineAmounts(
          basic,
          allowances,
        );
        await tx.hrPayrollLines.create({
          data: {
            RUN_ID: created.RUN_ID,
            EMPLOYEE_ID: emp.EMPLOYEE_ID,
            BASIC: new Prisma.Decimal(basic),
            ALLOWANCES: new Prisma.Decimal(allowances),
            PAYE: new Prisma.Decimal(paye),
            PENSION: new Prisma.Decimal(pension),
            DEDUCTIONS: new Prisma.Decimal(deductions),
            NET_PAY: new Prisma.Decimal(net),
            STATUS: 'Pending',
          },
        });
      }

      const lines = await tx.hrPayrollLines.findMany({
        where: { RUN_ID: created.RUN_ID },
      });
      let totalGross = 0;
      let totalNet = 0;
      for (const line of lines) {
        totalGross += Number(line.BASIC) + Number(line.ALLOWANCES);
        totalNet += Number(line.NET_PAY);
      }

      return tx.hrPayrollRuns.update({
        where: { RUN_ID: created.RUN_ID },
        data: {
          TOTAL_GROSS: new Prisma.Decimal(
            Math.round(totalGross * 100) / 100,
          ),
          TOTAL_NET: new Prisma.Decimal(Math.round(totalNet * 100) / 100),
        },
        include: { lines: true },
      });
    });

    await this.audit.log({
      type: 'hr:payroll:run',
      entity: 'HR_PAYROLL_RUNS',
      entityId: run.RUN_ID,
      userId: user.id,
      createdBy: label,
      newValue: { year: dto.year, month: dto.month },
    });

    return this.mapPayrollRun(
      run,
      run.lines.map((l) => this.mapPayrollLine(l)),
    );
  }

  async lockPayroll(runId: number, user: AuthUser) {
    const run = await this.prisma.hrPayrollRuns.findUnique({
      where: { RUN_ID: runId },
    });
    if (!run) throw new NotFoundException('Payroll run not found');
    if (run.STATUS === 'Locked') {
      throw new ConflictException('Payroll run is already locked');
    }

    const label = actorLabel(user);
    const now = new Date();
    await this.recalcPayrollRunTotals(runId);
    const updated = await this.prisma.hrPayrollRuns.update({
      where: { RUN_ID: runId },
      data: {
        STATUS: 'Locked',
        LOCKED_AT: now,
        LOCKED_BY_ID: user.id,
        LOCKED_BY: label,
        UPDATED_BY_ID: user.id,
        UPDATED_BY: label,
        UPDATED_DATE: now,
      },
      include: { lines: true },
    });

    await this.audit.log({
      type: 'hr:payroll:lock',
      entity: 'HR_PAYROLL_RUNS',
      entityId: runId,
      userId: user.id,
      createdBy: label,
    });

    return this.mapPayrollRun(
      updated,
      updated.lines.map((l) => this.mapPayrollLine(l)),
    );
  }

  async updatePayrollLine(
    runId: number,
    lineId: number,
    dto: UpdatePayrollLineDto,
    user: AuthUser,
  ) {
    const run = await this.prisma.hrPayrollRuns.findUnique({
      where: { RUN_ID: runId },
    });
    if (!run) throw new NotFoundException('Payroll run not found');
    if (run.STATUS !== 'Draft') {
      throw new ConflictException('Payroll run is locked');
    }

    const line = await this.prisma.hrPayrollLines.findFirst({
      where: { LINE_ID: lineId, RUN_ID: runId },
    });
    if (!line) throw new NotFoundException('Payroll line not found');

    const basic =
      dto.basic !== undefined ? dto.basic : Number(line.BASIC);
    const allowances =
      dto.allowances !== undefined
        ? dto.allowances
        : Number(line.ALLOWANCES);
    const { paye, pension, deductions, net } = payrollLineAmounts(
      basic,
      allowances,
    );

    const label = actorLabel(user);
    const now = new Date();
    const updatedLine = await this.prisma.hrPayrollLines.update({
      where: { LINE_ID: lineId },
      data: {
        BASIC: new Prisma.Decimal(basic),
        ALLOWANCES: new Prisma.Decimal(allowances),
        PAYE: new Prisma.Decimal(paye),
        PENSION: new Prisma.Decimal(pension),
        DEDUCTIONS: new Prisma.Decimal(deductions),
        NET_PAY: new Prisma.Decimal(net),
        ...(dto.status !== undefined ? { STATUS: dto.status } : {}),
      },
    });

    await this.recalcPayrollRunTotals(runId);
    await this.prisma.hrPayrollRuns.update({
      where: { RUN_ID: runId },
      data: {
        UPDATED_BY_ID: user.id,
        UPDATED_BY: label,
        UPDATED_DATE: now,
      },
    });

    await this.audit.log({
      type: 'hr:payroll:update',
      entity: 'HR_PAYROLL_LINES',
      entityId: lineId,
      userId: user.id,
      createdBy: label,
    });

    return this.mapPayrollLine(updatedLine);
  }
}
