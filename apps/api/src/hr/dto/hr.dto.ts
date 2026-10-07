import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export const HR_EMPLOYMENT_TYPES = [
  'Permanent',
  'Contract',
  'Locum',
  'Full-time',
  'NYSC',
  'Resident',
] as const;

export const HR_EMPLOYEE_STATUSES = [
  'Active',
  'OnLeave',
  'Suspended',
  'Exited',
  'Retired',
  'Inactive',
] as const;

export const HR_ATTENDANCE_STATUSES = [
  'Present',
  'Late',
  'Absent',
  'EarlyLeave',
  'OnLeave',
] as const;

export const HR_LEAVE_TYPES = [
  'Annual',
  'Sick',
  'Maternity',
  'Casual',
  'Study',
  'Other',
] as const;

export const HR_LEAVE_STATUSES = [
  'PendingHod',
  'PendingHr',
  'Approved',
  'Rejected',
  'Cancelled',
] as const;

export const HR_APPRAISAL_STATUSES = ['Draft', 'Final'] as const;

export const HR_DISCIPLINARY_STATUSES = [
  'Open',
  'UnderReview',
  'Closed',
] as const;

export class CreateHrEmployeeDto {
  @IsString()
  @MinLength(2)
  @MaxLength(40)
  employeeNo!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  userId?: number;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstName!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  lastName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  departmentId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  departmentName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  designation?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  gradeLevel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  cadre?: string;

  @IsOptional()
  @IsString()
  @IsIn([...HR_EMPLOYMENT_TYPES])
  employmentType?: (typeof HR_EMPLOYMENT_TYPES)[number];

  @IsOptional()
  @IsDateString()
  dateJoined?: string;

  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @IsOptional()
  @IsDateString()
  expectedRetireDate?: string;

  @IsOptional()
  @IsString()
  qualifications?: string;

  @IsOptional()
  @IsString()
  certifications?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  licenseNo?: string;

  @IsOptional()
  @IsDateString()
  licenseExpiry?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  nextOfKin?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  nextOfKinPhone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  emergencyContact?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  emergencyPhone?: string;

  @IsOptional()
  @IsString()
  employmentHistory?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  baseSalary?: number;
}

export class UpdateHrEmployeeDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  userId?: number | null;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  lastName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  email?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  departmentId?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  departmentName?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  designation?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  gradeLevel?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  cadre?: string | null;

  @IsOptional()
  @IsString()
  @IsIn([...HR_EMPLOYMENT_TYPES])
  employmentType?: (typeof HR_EMPLOYMENT_TYPES)[number];

  @IsOptional()
  @IsDateString()
  dateJoined?: string | null;

  @IsOptional()
  @IsDateString()
  dateOfBirth?: string | null;

  @IsOptional()
  @IsDateString()
  expectedRetireDate?: string | null;

  @IsOptional()
  @IsString()
  qualifications?: string | null;

  @IsOptional()
  @IsString()
  certifications?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  licenseNo?: string | null;

  @IsOptional()
  @IsDateString()
  licenseExpiry?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  nextOfKin?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  nextOfKinPhone?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  emergencyContact?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  emergencyPhone?: string | null;

  @IsOptional()
  @IsString()
  employmentHistory?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  baseSalary?: number | null;
}

export class ListEmployeesQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;

  @IsOptional()
  @IsString()
  @IsIn([...HR_EMPLOYEE_STATUSES])
  status?: (typeof HR_EMPLOYEE_STATUSES)[number];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  departmentId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  departmentName?: string;

  @IsOptional()
  @IsString()
  @IsIn([...HR_EMPLOYMENT_TYPES])
  employmentType?: (typeof HR_EMPLOYMENT_TYPES)[number];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}

export class CreateAttendanceDto {
  @Type(() => Number)
  @IsInt()
  employeeId!: number;

  @IsDateString()
  workDate!: string;

  @IsOptional()
  @IsDateString()
  checkIn?: string;

  @IsOptional()
  @IsDateString()
  checkOut?: string;

  @IsOptional()
  @IsString()
  @IsIn([...HR_ATTENDANCE_STATUSES])
  status?: (typeof HR_ATTENDANCE_STATUSES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(40)
  shift?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class UpdateAttendanceDto {
  @IsOptional()
  @IsDateString()
  checkIn?: string | null;

  @IsOptional()
  @IsDateString()
  checkOut?: string | null;

  @IsOptional()
  @IsString()
  @IsIn([...HR_ATTENDANCE_STATUSES])
  status?: (typeof HR_ATTENDANCE_STATUSES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(40)
  shift?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string | null;
}

export class ListAttendanceQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  employeeId?: number;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsString()
  @IsIn([...HR_ATTENDANCE_STATUSES])
  status?: (typeof HR_ATTENDANCE_STATUSES)[number];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}

export class CreateLeaveRequestDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  employeeId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  leaveTypeId?: number;

  @IsString()
  @IsIn([...HR_LEAVE_TYPES])
  leaveType!: (typeof HR_LEAVE_TYPES)[number];

  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.5)
  days!: number;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  reason?: string;
}

export class UpdateLeaveRequestDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  leaveTypeId?: number | null;

  @IsOptional()
  @IsString()
  @IsIn([...HR_LEAVE_TYPES])
  leaveType?: (typeof HR_LEAVE_TYPES)[number];

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.5)
  days?: number;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  reason?: string | null;

  @IsOptional()
  @IsString()
  @IsIn(['Cancelled'])
  status?: 'Cancelled';
}

export class DecideLeaveDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  decisionNote?: string;
}

/** HR override of PendingHod — note is mandatory. */
export class OverrideLeaveDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  decisionNote!: string;
}

export class ListLeaveQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  employeeId?: number;

  @IsOptional()
  @IsString()
  @IsIn([...HR_LEAVE_STATUSES])
  status?: (typeof HR_LEAVE_STATUSES)[number];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}

export class CreateAppraisalDto {
  @Type(() => Number)
  @IsInt()
  employeeId!: number;

  @IsString()
  @MinLength(2)
  @MaxLength(40)
  periodLabel!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  attendanceScore?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  productivityScore?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  efficiencyScore?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  complianceScore?: number;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  comments?: string;

  @IsOptional()
  @IsString()
  @IsIn([...HR_APPRAISAL_STATUSES])
  status?: (typeof HR_APPRAISAL_STATUSES)[number];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  reviewerId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  reviewerName?: string;
}

export class UpdateAppraisalDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(40)
  periodLabel?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  attendanceScore?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  productivityScore?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  efficiencyScore?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  complianceScore?: number;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  comments?: string | null;

  @IsOptional()
  @IsString()
  @IsIn([...HR_APPRAISAL_STATUSES])
  status?: (typeof HR_APPRAISAL_STATUSES)[number];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  reviewerId?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  reviewerName?: string | null;
}

export class CreateDisciplinaryDto {
  @Type(() => Number)
  @IsInt()
  employeeId!: number;

  @IsString()
  @MinLength(2)
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string;

  @IsOptional()
  @IsString()
  @IsIn([...HR_DISCIPLINARY_STATUSES])
  status?: (typeof HR_DISCIPLINARY_STATUSES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(30)
  severity?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  outcome?: string;
}

export class UpdateDisciplinaryDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string | null;

  @IsOptional()
  @IsString()
  @IsIn([...HR_DISCIPLINARY_STATUSES])
  status?: (typeof HR_DISCIPLINARY_STATUSES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(30)
  severity?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  outcome?: string | null;

  @IsOptional()
  @IsDateString()
  closedDate?: string | null;
}

export class CreateDocumentDto {
  @Type(() => Number)
  @IsInt()
  employeeId!: number;

  @IsString()
  @MinLength(2)
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  docType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  fileUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  storageKey?: string;
}

export class RunPayrollDto {
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  year!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  month!: number;
}

export class UpdatePayrollLineDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  basic?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  allowances?: number;

  @IsOptional()
  @IsString()
  @IsIn(['Pending', 'Paid'])
  status?: 'Pending' | 'Paid';
}

// ---------------------------------------------------------------------------
// HR Self-Service Phase 1 — department heads, leave types, public holidays
// ---------------------------------------------------------------------------

export class UpsertDepartmentHeadDto {
  @Type(() => Number)
  @IsInt()
  departmentId!: number;

  @Type(() => Number)
  @IsInt()
  headEmployeeId!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  deputyEmployeeId?: number | null;
}

export class UpdateLeaveTypeDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(365)
  daysPerYear?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CreatePublicHolidayDto {
  @IsDateString()
  date!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(150)
  name!: string;
}

export class ListPublicHolidaysQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  year?: number;
}

export class ListPayrollQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  year?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  month?: number;

  @IsOptional()
  @IsString()
  @IsIn(['Draft', 'Locked'])
  status?: 'Draft' | 'Locked';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}
