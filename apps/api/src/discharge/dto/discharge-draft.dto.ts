import {
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateDischargeDraftDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  admissionId!: number;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  dischargeType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  admissionDiagnosis?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  finalDiagnosis?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  reasonForAdmission?: string;

  @IsOptional()
  @IsString()
  @MaxLength(16000)
  clinicalSummary?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  investigations?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  treatmentGiven?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  dischargeMedications?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  medicationsChanged?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  followUpPlan?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  nextAppointment?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  patientEducation?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  riskSafetyNotes?: string;
}

export class UpdateDischargeDraftDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  dischargeType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  admissionDiagnosis?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  finalDiagnosis?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  reasonForAdmission?: string;

  @IsOptional()
  @IsString()
  @MaxLength(16000)
  clinicalSummary?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  investigations?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  treatmentGiven?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  dischargeMedications?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  medicationsChanged?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  followUpPlan?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  nextAppointment?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  patientEducation?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  riskSafetyNotes?: string;
}

export class ReasonDto {
  @IsString()
  @MinLength(3)
  @MaxLength(4000)
  reason!: string;
}

export class CancelDischargeDraftDto {
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  reason?: string;
}

export class NoteDto {
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  note?: string;
}
