import { Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class StartEncounterDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  triageId!: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  clinic?: string;
}

export class UpdateEncounterDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version?: number;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  idempotencyKey?: string;

  @IsOptional()
  @IsString()
  chiefComplaint?: string;

  @IsOptional()
  @IsString()
  history?: string;

  @IsOptional()
  @IsString()
  examination?: string;

  @IsOptional()
  @IsString()
  assessment?: string;

  @IsOptional()
  @IsString()
  plan?: string;

  @IsOptional()
  @IsString()
  pastMedicalHistory?: string;

  @IsOptional()
  @IsString()
  drugHistory?: string;

  @IsOptional()
  @IsString()
  allergyHistory?: string;

  @IsOptional()
  @IsString()
  familyHistory?: string;

  @IsOptional()
  @IsString()
  socialHistory?: string;

  @IsOptional()
  @IsString()
  followUpPlan?: string;
}

export class CompleteEncounterDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  outcome?: string;

  /** ISO date (YYYY-MM-DD) — required when outcome is a follow-up. */
  @IsOptional()
  @IsDateString()
  followUpDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  followUpClinic?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  followUpTime?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  followUpPriority?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  followUpReason?: string;
}

export class CreateFollowUpDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  personId!: number;

  @IsDateString()
  scheduledDate!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  encounterId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  clinic?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  scheduledTime?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  priority?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  prevDx?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reason?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  reminder?: string;
}

export class UpdateFollowUpDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  status?: string;

  @IsOptional()
  @IsDateString()
  scheduledDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  scheduledTime?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  clinic?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  priority?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reason?: string;
}
