import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

const PRIORITIES = ['Routine', 'Urgent', 'Emergency', 'Stat'] as const;
const SOURCES = ['Doctor', 'WalkIn', 'Ward', 'Emergency', 'Nursing', 'OPC'] as const;
const REQUEST_STATUSES = [
  'Sent',
  'Accepted',
  'Rejected',
  'Cancelled',
  'Scheduled',
  'InProgress',
  'Completed',
  'Reported',
  'Verified',
  'Released',
] as const;

export class CreateImagingRequestItemDto {
  @IsInt()
  @Min(1)
  studyId!: number;

  @IsOptional()
  @IsString()
  lineNotes?: string;
}

export class CreateImagingRequestDto {
  @IsInt()
  @Min(1)
  personId!: number;

  @IsOptional()
  @IsInt()
  encounterId?: number;

  @IsOptional()
  @IsIn(PRIORITIES)
  priority?: (typeof PRIORITIES)[number];

  @IsOptional()
  @IsString()
  clinicalIndication?: string;

  @IsOptional()
  @IsString()
  clinicalNotes?: string;

  @IsOptional()
  @IsString()
  contrast?: string;

  @IsOptional()
  @IsIn(SOURCES)
  source?: (typeof SOURCES)[number];

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateImagingRequestItemDto)
  items!: CreateImagingRequestItemDto[];
}

export class UpdateImagingRequestDto {
  @IsOptional()
  @IsIn(REQUEST_STATUSES)
  status?: (typeof REQUEST_STATUSES)[number];

  @IsOptional()
  @IsString()
  rejectionReason?: string;

  @IsOptional()
  @IsString()
  scheduledRoom?: string;

  @IsOptional()
  @IsString()
  scheduledAt?: string;

  @IsOptional()
  @IsInt()
  equipmentId?: number;

  @IsOptional()
  @IsString()
  prepJson?: string;

  @IsOptional()
  @IsString()
  safetyJson?: string;
}

export class ImportImagingOrderDto {
  @IsInt()
  @Min(1)
  personId!: number;

  @IsOptional()
  @IsInt()
  nursingOrderId?: number;

  @IsOptional()
  @IsIn(SOURCES)
  source?: (typeof SOURCES)[number];

  @IsOptional()
  @IsIn(PRIORITIES)
  priority?: (typeof PRIORITIES)[number];

  @IsOptional()
  @IsString()
  clinicalIndication?: string;

  @IsOptional()
  @IsString()
  clinicalNotes?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateImagingRequestItemDto)
  items!: CreateImagingRequestItemDto[];
}

export class ConfirmImagingPaymentDto {
  @IsString()
  @MinLength(2)
  paymentChannel!: string;

  @IsOptional()
  @IsString()
  paymentRef?: string;
}

export class ScheduleImagingDto {
  @IsOptional()
  @IsString()
  scheduledAt?: string;

  @IsOptional()
  @IsString()
  scheduledRoom?: string;

  @IsOptional()
  @IsInt()
  equipmentId?: number;
}

export class CompleteImagingDto {
  @IsOptional()
  @IsString()
  studyUid?: string;

  @IsOptional()
  @IsInt()
  consumableId?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  consumableQty?: number;
}

export class CreateRadiologyReportDto {
  @IsInt()
  @Min(1)
  imagingRequestId!: number;

  @IsString()
  @MinLength(3)
  findings!: string;

  @IsOptional()
  @IsString()
  impression?: string;

  @IsOptional()
  @IsString()
  recommendation?: string;

  @IsOptional()
  @IsBoolean()
  critical?: boolean;
}

export class ReturnReportDto {
  @IsString()
  @MinLength(4)
  reason!: string;
}

export class RecordEcgDto {
  @IsInt()
  @Min(1)
  personId!: number;

  @IsOptional()
  @IsInt()
  imagingRequestId?: number;

  @IsOptional()
  @IsString()
  ecgType?: string;

  @IsOptional()
  @IsInt()
  heartRate?: number;

  @IsOptional()
  @IsString()
  rhythm?: string;

  @IsOptional()
  @IsInt()
  prMs?: number;

  @IsOptional()
  @IsInt()
  qrsMs?: number;

  @IsOptional()
  @IsInt()
  qtcMs?: number;

  @IsOptional()
  @IsString()
  stChanges?: string;

  @IsOptional()
  @IsString()
  interpretation?: string;
}

export class InterpretEcgDto {
  @IsString()
  @MinLength(3)
  interpretation!: string;
}

export class CreateEquipmentDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsString()
  @MinLength(2)
  modality!: string;

  @IsOptional()
  @IsString()
  room?: string;

  @IsOptional()
  @IsIn(['Available', 'In Use', 'InUse', 'Maintenance', 'Offline'])
  status?: string;
}

export class UpdateEquipmentDto {
  @IsOptional()
  @IsIn(['Available', 'In Use', 'InUse', 'Maintenance', 'Offline'])
  status?: string;

  @IsOptional()
  @IsString()
  room?: string;

  @IsOptional()
  @IsString()
  note?: string;
}

export class CreateConsumableDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsString()
  @MinLength(2)
  category!: string;

  @IsOptional()
  @IsInt()
  stock?: number;

  @IsOptional()
  @IsString()
  unit?: string;

  @IsOptional()
  @IsInt()
  reorderLevel?: number;
}

export class AdjustConsumableDto {
  @IsInt()
  delta!: number;

  @IsOptional()
  @IsString()
  note?: string;
}

export class CreateRadFormDto {
  @IsString()
  @MinLength(2)
  formType!: string;

  @IsInt()
  @Min(1)
  personId!: number;

  @IsOptional()
  @IsInt()
  imagingRequestId?: number;

  @IsOptional()
  @IsString()
  valuesJson?: string;

  @IsOptional()
  @IsString()
  signedBy?: string;
}

export class CreateImagingStudyDto {
  @IsString()
  @MinLength(2)
  studyCode!: string;

  @IsString()
  @MinLength(2)
  name!: string;

  @IsString()
  modality!: string;

  @IsOptional()
  @IsString()
  bodyRegion?: string;

  @IsOptional()
  @IsString()
  turnaround?: string;

  @IsNumber()
  @Min(0)
  unitPrice!: number;
}
