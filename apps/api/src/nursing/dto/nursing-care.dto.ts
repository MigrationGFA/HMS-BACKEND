import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

const NOTE_TYPES = [
  'General',
  'Shift',
  'Incident',
  'Progress',
  'MentalHealth',
  'Emergency',
  'WoundCare',
  'Medication',
  'Discharge',
] as const;

const NOTE_FORMATS = ['Narrative', 'SOAP', 'DAR'] as const;

const CARE_PLAN_STATUSES = ['active', 'ongoing', 'resolved'] as const;

const OBS_CHARTS = [
  'Observation',
  'Psychiatric',
  'Seclusion',
  'Restraint',
  'Turning',
  'IntakeOutput',
  'ICU',
] as const;

const INCIDENT_TYPES = [
  'Fall',
  'MedicationError',
  'Aggression',
  'Absconding',
  'Injury',
  'EquipmentFailure',
  'Emergency',
  'Death',
  'Security',
  'NeedleStick',
  'Other',
] as const;

const INCIDENT_SEVERITIES = ['Low', 'Moderate', 'High', 'Critical'] as const;

export class CreateNursingNoteDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  personId!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  admissionId?: number;

  @IsString()
  @IsIn([...NOTE_TYPES])
  noteType!: string;

  @IsOptional()
  @IsString()
  @IsIn([...NOTE_FORMATS])
  format?: string;

  @IsString()
  body!: string;
}

export class CreateNursingVitalDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  personId!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  admissionId?: number;

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
  @Type(() => Number)
  @IsNumber()
  bloodSugar?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  painScore?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateCarePlanDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  personId!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  admissionId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  diagnosis?: string;

  @IsOptional()
  @IsString()
  problem?: string;

  @IsOptional()
  @IsString()
  goal?: string;

  @IsOptional()
  @IsString()
  intervention?: string;

  @IsOptional()
  @IsString()
  actionTaken?: string;

  @IsOptional()
  @IsString()
  evaluation?: string;

  @IsOptional()
  @IsDateString()
  reviewDate?: string;

  @IsOptional()
  @IsString()
  @IsIn([...CARE_PLAN_STATUSES])
  status?: string;
}

export class UpdateCarePlanDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  diagnosis?: string;

  @IsOptional()
  @IsString()
  problem?: string;

  @IsOptional()
  @IsString()
  goal?: string;

  @IsOptional()
  @IsString()
  intervention?: string;

  @IsOptional()
  @IsString()
  actionTaken?: string;

  @IsOptional()
  @IsString()
  evaluation?: string;

  @IsOptional()
  @IsDateString()
  reviewDate?: string;

  @IsOptional()
  @IsString()
  @IsIn([...CARE_PLAN_STATUSES])
  status?: string;
}

export class CreateObservationDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  personId!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  admissionId?: number;

  @IsString()
  @IsIn([...OBS_CHARTS])
  chart!: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  interval?: string;

  @IsObject()
  fields!: Record<string, unknown>;
}

export class CreateIncidentDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  personId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  admissionId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  patientName?: string;

  @IsString()
  @IsIn([...INCIDENT_TYPES])
  incidentType!: string;

  @IsString()
  description!: string;

  @IsOptional()
  @IsString()
  actionTaken?: string;

  @IsOptional()
  @IsString()
  @IsIn([...INCIDENT_SEVERITIES])
  severity?: string;
}

export class ReviewIncidentDto {
  @IsOptional()
  @IsString()
  note?: string;
}

export class CreateFormTemplateDto {
  @IsString()
  @MaxLength(50)
  code!: string;

  @IsString()
  @MaxLength(255)
  title!: string;

  @IsObject()
  schema!: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class CreateFormInstanceDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  templateId!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  personId!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  admissionId?: number;

  @IsObject()
  values!: Record<string, unknown>;
}
