import {
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export const OPC_VISIT_TYPES = ['New', 'Follow-up', 'Emergency', 'Review'] as const;
export const OPC_PAYERS = ['Cash', 'NHIS', 'HMO', 'Staff', 'Free'] as const;
export const OPC_PRIORITIES = ['Normal', 'Urgent', 'Emergency', 'Crisis'] as const;
export const OPC_STATUSES = [
  'WAITING',
  'WITH_NURSE',
  'WITH_DOCTOR',
  'AWAITING_LAB',
  'AWAITING_PHARMACY',
  'REFERRED',
  'FOR_ADMISSION',
  'COMPLETED',
  'CANCELLED',
] as const;
export const OPC_NOTE_STATUSES = ['DRAFT', 'FINAL'] as const;
export const OPC_PAYMENT_CHANNELS = [
  'Cash',
  'POS Card',
  'Bank Transfer',
  'Online Card',
  'Wallet',
] as const;

export class CheckInOpcVisitDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  personId!: number;

  @IsString()
  @IsIn([...OPC_VISIT_TYPES])
  visitType!: string;

  @IsOptional()
  @IsString()
  @IsIn([...OPC_PAYERS])
  payer?: string;

  @IsOptional()
  @IsString()
  @IsIn([...OPC_PRIORITIES])
  priority?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  assignedDoctor?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  clinic?: string;

  @IsOptional()
  @IsString()
  reason?: string;
}

export class UpdateOpcVisitStatusDto {
  @IsString()
  @IsIn([...OPC_STATUSES])
  status!: string;

  @IsOptional()
  @IsString()
  note?: string;
}

export class AssignOpcDoctorDto {
  @IsString()
  @MaxLength(120)
  doctor!: string;
}

export class PayOpcConsultationDto {
  @IsString()
  @IsIn([...OPC_PAYMENT_CHANNELS])
  channel!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  paymentRef?: string;
}

export class SaveOpcAssessmentDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  personId!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  opcVisitId?: number;

  @IsString()
  @MaxLength(60)
  type!: string;

  @IsObject()
  values!: Record<string, unknown>;

  @IsOptional()
  @IsString()
  summary?: string;
}

export class SaveOpcRiskDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  personId!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  opcVisitId?: number;

  @IsString()
  @MaxLength(20)
  selfHarm!: string;

  @IsString()
  @MaxLength(20)
  harmToOthers!: string;

  @IsString()
  @MaxLength(20)
  absconding!: string;

  @IsString()
  @MaxLength(20)
  neglect!: string;

  @IsString()
  @MaxLength(20)
  substance!: string;

  @IsOptional()
  @IsBoolean()
  vulnerableFlag?: boolean;

  @IsOptional()
  @IsBoolean()
  crisisAlert?: boolean;

  @IsOptional()
  @IsString()
  safetyPlan?: string;
}

export class SaveOpcNoteDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  personId!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  opcVisitId?: number;

  @IsString()
  @MaxLength(60)
  type!: string;

  @IsString()
  content!: string;

  @IsOptional()
  @IsString()
  @IsIn([...OPC_NOTE_STATUSES])
  status?: string;

  @IsOptional()
  @IsBoolean()
  confidential?: boolean;
}
