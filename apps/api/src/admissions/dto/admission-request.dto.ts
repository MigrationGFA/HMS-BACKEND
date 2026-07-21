import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';

const PRIORITIES = ['Routine', 'Urgent', 'Emergency'] as const;
const STATUSES = [
  'Draft',
  'Submitted',
  'UnderReview',
  'Approved',
  'Rejected',
  'Cancelled',
] as const;
const ADMISSION_TYPES = [
  'New admission',
  'Readmission',
  'Transfer-in',
  'Observation',
  'Trial leave return',
] as const;

export class CreateAdmissionRequestDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  personId!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  encounterId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  wardId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  wardPreference?: string;

  @IsOptional()
  @IsString()
  @IsIn([...PRIORITIES])
  priority?: (typeof PRIORITIES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  priorityReason?: string;

  @IsOptional()
  @IsString()
  @IsIn([...ADMISSION_TYPES])
  admissionType?: (typeof ADMISSION_TYPES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(80)
  estimatedLos?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  provisionalDiagnosis?: string;

  @IsOptional()
  @IsString()
  secondaryDiagnosis?: string;

  @IsOptional()
  @IsString()
  clinicalIndication?: string;

  @IsOptional()
  @IsString()
  mentalHealthRisk?: string;

  @IsOptional()
  @IsString()
  physicalHealthRisk?: string;

  @IsOptional()
  @IsString()
  treatmentPlan?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  requiredMonitoring?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  nursingObservation?: string;

  @IsOptional()
  @IsBoolean()
  isolationRequired?: boolean;

  @IsOptional()
  @IsBoolean()
  fallRisk?: boolean;

  @IsOptional()
  @IsBoolean()
  suicideRisk?: boolean;

  @IsOptional()
  @IsBoolean()
  violenceRisk?: boolean;

  @IsOptional()
  @IsBoolean()
  withdrawalRisk?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  specialBed?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  consentStatus?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  nokInformed?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  clinicDepartment?: string;

  @IsOptional()
  @IsString()
  doctorNote?: string;

  /** When true, create as Draft; otherwise Submitted. */
  @IsOptional()
  @IsBoolean()
  asDraft?: boolean;
}

export class UpdateAdmissionRequestDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  wardId?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  wardPreference?: string;

  @IsOptional()
  @IsString()
  @IsIn([...PRIORITIES])
  priority?: (typeof PRIORITIES)[number];

  @IsOptional()
  @IsString()
  priorityReason?: string;

  @IsOptional()
  @IsString()
  @IsIn([...ADMISSION_TYPES])
  admissionType?: (typeof ADMISSION_TYPES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(80)
  estimatedLos?: string;

  @IsOptional()
  @IsString()
  provisionalDiagnosis?: string;

  @IsOptional()
  @IsString()
  secondaryDiagnosis?: string;

  @IsOptional()
  @IsString()
  clinicalIndication?: string;

  @IsOptional()
  @IsString()
  mentalHealthRisk?: string;

  @IsOptional()
  @IsString()
  physicalHealthRisk?: string;

  @IsOptional()
  @IsString()
  treatmentPlan?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  requiredMonitoring?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  nursingObservation?: string;

  @IsOptional()
  @IsBoolean()
  isolationRequired?: boolean;

  @IsOptional()
  @IsBoolean()
  fallRisk?: boolean;

  @IsOptional()
  @IsBoolean()
  suicideRisk?: boolean;

  @IsOptional()
  @IsBoolean()
  violenceRisk?: boolean;

  @IsOptional()
  @IsBoolean()
  withdrawalRisk?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  specialBed?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  consentStatus?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  nokInformed?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  clinicDepartment?: string;

  @IsOptional()
  @IsString()
  doctorNote?: string;

  @IsOptional()
  @IsString()
  @IsIn([...STATUSES])
  status?: (typeof STATUSES)[number];

  @IsOptional()
  @IsString()
  rejectionReason?: string;
}
