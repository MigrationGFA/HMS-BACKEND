import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { HR_LEAVE_TYPES } from './hr.dto';

export class CreateSelfLeaveDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  leaveTypeId?: number;

  @ValidateIf((o: CreateSelfLeaveDto) => o.leaveTypeId == null)
  @IsString()
  @IsIn([...HR_LEAVE_TYPES])
  leaveType?: (typeof HR_LEAVE_TYPES)[number];

  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  reason?: string;
}

export class HodRejectLeaveDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  note!: string;
}

export class UpdateSelfProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  email?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string | null;

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
}

export class SelfAttendanceQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(7)
  month?: string; // YYYY-MM
}
