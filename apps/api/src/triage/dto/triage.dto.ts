import {
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateTriageDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  personId!: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  clinic?: string;

  @IsOptional()
  @IsString()
  @IsIn([
    'Waiting',
    'In Triage',
    'Triage Completed',
    'Sent to Consultation',
    'In Consultation',
    'Cancelled',
  ])
  status?: string;

  @IsOptional()
  @IsString()
  @IsIn(['Routine', 'Urgent', 'Emergency', 'VIP', 'Elderly / Special Needs'])
  priority?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  priorityReason?: string;

  @IsOptional()
  @IsString()
  @IsIn(['New', 'Returning', 'Emergency'])
  patientType?: string;

  @IsOptional()
  @IsDateString()
  arrivalAt?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  weightKg?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  heightCm?: number;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  bloodPressure?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  temperatureC?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  pulseBpm?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  respiratoryRate?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  spo2Pct?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateTriageDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  clinic?: string;

  @IsOptional()
  @IsString()
  @IsIn([
    'Waiting',
    'In Triage',
    'Triage Completed',
    'Sent to Consultation',
    'In Consultation',
    'Cancelled',
  ])
  status?: string;

  @IsOptional()
  @IsString()
  @IsIn(['Routine', 'Urgent', 'Emergency', 'VIP', 'Elderly / Special Needs'])
  priority?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  priorityReason?: string;

  @IsOptional()
  @IsString()
  @IsIn(['New', 'Returning', 'Emergency'])
  patientType?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  weightKg?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  heightCm?: number;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  bloodPressure?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  temperatureC?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  pulseBpm?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  respiratoryRate?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  spo2Pct?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
