import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export const REFERRAL_KINDS = ['Internal', 'External'] as const;
export const CARE_SETTINGS = ['Outpatient', 'Inpatient'] as const;
export const REFERRAL_PRIORITIES = ['Routine', 'Urgent', 'Emergency'] as const;

export class CreateReferralDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  personId!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  encounterId?: number;

  @IsIn(REFERRAL_KINDS)
  referralKind!: (typeof REFERRAL_KINDS)[number];

  @IsOptional()
  @IsIn(CARE_SETTINGS)
  careSetting?: (typeof CARE_SETTINGS)[number];

  @IsOptional()
  @IsIn(REFERRAL_PRIORITIES)
  priority?: (typeof REFERRAL_PRIORITIES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(100)
  fromDepartment?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  toDepartment?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  toDoctorUserId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  toDoctorLabel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  externalFacility?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  externalContact?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  externalAddress?: string;

  @IsString()
  @MinLength(3)
  @MaxLength(4000)
  reason!: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  provisionalDiagnosis?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  clinicalSummary?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  specificQuestion?: string;
}

export class NoteDto {
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  note?: string;
}

export class RouteReferralDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  toDepartment?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  toDoctorUserId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  toDoctorLabel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  note?: string;
}

export class AllocateReferralDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  wardId!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  bedId!: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}

export class CompleteReferralDto {
  @IsOptional()
  @IsString()
  @MaxLength(8000)
  outcomeNote?: string;
}

export class ReasonDto {
  @IsString()
  @MinLength(3)
  @MaxLength(4000)
  reason!: string;
}

export class CancelReferralDto {
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  reason?: string;
}
