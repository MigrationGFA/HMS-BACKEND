import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

const DX_TYPES = [
  'Primary',
  'Secondary',
  'Differential',
  'Provisional',
  'Confirmed',
  'Ruled out',
] as const;

const DX_STATUSES = ['Active', 'Chronic', 'Resolved', 'In remission'] as const;
const DX_SEVERITIES = ['Mild', 'Moderate', 'Severe'] as const;
const DX_CERTAINTIES = ['Suspected', 'Probable', 'Confirmed'] as const;
const DX_SYSTEMS = ['ICD-11', 'DSM-5', 'Local'] as const;

export class CreatePatientDiagnosisDto {
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
  @IsString()
  @MaxLength(40)
  code?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  diagnosisCodeId?: number;

  @IsOptional()
  @IsString()
  @IsIn([...DX_SYSTEMS])
  system?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsString()
  @IsIn([...DX_TYPES])
  type?: string;

  @IsOptional()
  @IsString()
  @IsIn([...DX_SEVERITIES])
  severity?: string;

  @IsOptional()
  @IsString()
  @IsIn([...DX_STATUSES])
  status?: string;

  @IsOptional()
  @IsString()
  @IsIn([...DX_CERTAINTIES])
  certainty?: string;

  @IsOptional()
  @IsString()
  onsetDate?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  clinic?: string;

  @IsOptional()
  @IsBoolean()
  onProblemList?: boolean;

  @IsOptional()
  @IsString()
  reasonConsidered?: string;

  @IsOptional()
  @IsString()
  supportingFindings?: string;

  @IsOptional()
  @IsString()
  againstFindings?: string;

  @IsOptional()
  @IsString()
  linkedSymptoms?: string;

  @IsOptional()
  @IsString()
  linkedLab?: string;

  @IsOptional()
  @IsString()
  linkedImaging?: string;

  @IsOptional()
  @IsString()
  linkedRx?: string;

  @IsOptional()
  @IsString()
  riskLevel?: string;
}

export class UpdatePatientDiagnosisDto {
  @IsOptional()
  @IsString()
  @IsIn([...DX_TYPES])
  type?: string;

  @IsOptional()
  @IsString()
  @IsIn([...DX_SEVERITIES])
  severity?: string;

  @IsOptional()
  @IsString()
  @IsIn([...DX_STATUSES])
  status?: string;

  @IsOptional()
  @IsString()
  @IsIn([...DX_CERTAINTIES])
  certainty?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsBoolean()
  onProblemList?: boolean;

  @IsOptional()
  @IsString()
  closedReason?: string;

  @IsOptional()
  @IsString()
  controlStatus?: string;

  @IsOptional()
  @IsString()
  riskLevel?: string;

  @IsOptional()
  @IsString()
  lastReview?: string;

  @IsOptional()
  @IsString()
  nextReview?: string;
}
