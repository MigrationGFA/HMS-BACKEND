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

export const TRANSFER_TYPES = [
  'WardToWard',
  'ClinicToWard',
  'WardToClinic',
  'Department',
  'ICU',
  'ExternalReferral',
  'Theatre',
  'RadiologyEscort',
] as const;

export const TRANSFER_PRIORITIES = ['Routine', 'Urgent', 'Emergency'] as const;

export const TRANSFER_STATUSES = [
  'Draft',
  'Submitted',
  'NursePreparing',
  'AwaitingBed',
  'BedReserved',
  'ReceivingAccepted',
  'InTransit',
  'Completed',
  'Rejected',
  'Cancelled',
] as const;

export class CreateTransferDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  personId!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  admissionId?: number;

  @IsIn(TRANSFER_TYPES)
  transferType!: (typeof TRANSFER_TYPES)[number];

  @IsOptional()
  @IsIn(TRANSFER_PRIORITIES)
  priority?: (typeof TRANSFER_PRIORITIES)[number];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  fromWardId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  toWardId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  toWardPreference?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  destinationLabel?: string;

  @IsString()
  @MinLength(3)
  @MaxLength(4000)
  reason!: string;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  clinicalNotes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  externalFacility?: string;

  /** When true, skip NursePreparing and go straight to AwaitingBed. */
  @IsOptional()
  @IsBoolean()
  skipPrepare?: boolean;
}

export class PrepareTransferDto {
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  note?: string;

  /** true = ready for bed allocation (AwaitingBed); false/omit = acknowledge only (NursePreparing). */
  @IsOptional()
  @IsBoolean()
  ready?: boolean;
}

export class AllocateTransferDto {
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

export class AcceptTransferDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}

export class DepartTransferDto {
  @IsOptional()
  @IsString()
  @MaxLength(8000)
  handoverNotes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}

export class ConfirmArrivalDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}

export class RejectTransferDto {
  @IsString()
  @MinLength(3)
  @MaxLength(4000)
  reason!: string;
}

export class CancelTransferDto {
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  reason?: string;
}
