import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

const ORDER_KINDS = ['lab', 'drug', 'imaging'] as const;
const TASK_CATEGORIES = [
  'Vitals',
  'Medication',
  'Sample',
  'Procedure',
  'Round',
  'Discharge',
  'Monitoring',
  'Feeding',
  'Dressing',
  'Other',
] as const;
const TASK_STATUSES = [
  'PENDING',
  'IN_PROGRESS',
  'COMPLETED',
  'MISSED',
  'ESCALATED',
] as const;
const MAR_KINDS = ['Scheduled', 'PRN', 'Emergency', 'External'] as const;
const SHIFTS = ['Morning', 'Afternoon', 'Night'] as const;
const CHANNELS = ['Doctors', 'Pharmacy', 'Lab', 'Ward', 'Admin'] as const;
const REPORT_TYPES = [
  'DailyWard',
  'Shift',
  'Medication',
  'Observation',
  'Admission',
  'Discharge',
  'Monthly',
  'Incident',
] as const;
const PAYMENT_CLEARED = [
  'PAID',
  'NHIA_APPROVED',
  'HMO_APPROVED',
  'WAIVED',
] as const;

export class OrderItemDto {
  @IsString()
  @MaxLength(50)
  code!: string;

  @IsString()
  @MaxLength(255)
  name!: string;

  @IsOptional()
  @IsNumber()
  price?: number;

  @IsOptional()
  @IsBoolean()
  covered?: boolean;
}

export class CreateNursingOrderDto {
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
  @IsIn([...ORDER_KINDS])
  kind!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items!: OrderItemDto[];

  @IsOptional()
  @IsString()
  @MaxLength(100)
  orderedBy?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  paymentStatus?: string;
}

export class CreateNursingTaskDto {
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
  @MaxLength(500)
  title!: string;

  @IsOptional()
  @IsString()
  @IsIn([...TASK_CATEGORIES])
  category?: string;

  @IsOptional()
  @IsDateString()
  dueAt?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  sourceOrderId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  assignedTo?: string;
}

export class UpdateNursingTaskDto {
  @IsOptional()
  @IsString()
  @IsIn([...TASK_STATUSES])
  status?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  assignedTo?: string;
}

export class CreateMarEntryDto {
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
  @IsInt()
  @Min(1)
  orderId?: number;

  @IsString()
  @MaxLength(255)
  drug!: string;

  @IsString()
  @MaxLength(100)
  dose!: string;

  @IsString()
  @MaxLength(50)
  route!: string;

  @IsString()
  @MaxLength(100)
  frequency!: string;

  @IsDateString()
  scheduledTime!: string;

  @IsOptional()
  @IsString()
  @IsIn([...MAR_KINDS])
  kind?: string;

  @IsOptional()
  @IsBoolean()
  pharmacyDispensed?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  source?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  prescriber?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  sideEffects?: string;
}

export class CreateExternalMedDto {
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
  @MaxLength(255)
  drug!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  dose?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  route?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  frequency?: string;

  @IsOptional()
  @IsDateString()
  scheduledTime?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  source?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  prescriber?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class MarActionDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class CreateShiftDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  wardId?: number;

  @IsString()
  @IsIn([...SHIFTS])
  shift!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  leadNurse?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  staffCount?: number;
}

export class EndShiftDto {
  @IsOptional()
  @IsString()
  summary?: string;
}

export class CreateHandoverDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  wardId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  wardName?: string;

  @IsString()
  @IsIn([...SHIFTS])
  shift!: string;

  @IsString()
  summary!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  criticalPatients?: string[];

  @IsOptional()
  @IsString()
  pendingMeds?: string;

  @IsOptional()
  @IsString()
  pendingLabs?: string;

  @IsOptional()
  @IsString()
  incidents?: string;

  @IsOptional()
  @IsString()
  specialInstructions?: string;
}

export class CreateIcuNoteDto {
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
  @MaxLength(20)
  bloodPressure?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  spo2Pct?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  heartRate?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  ventSettings?: string;

  @IsOptional()
  @IsString()
  note?: string;
}

export class CreateIcuInfusionDto {
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
  @MaxLength(255)
  medication!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  currentRate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  newRate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @IsOptional()
  @IsString()
  note?: string;
}

export class CreateMessageDto {
  @IsString()
  @IsIn([...CHANNELS])
  channel!: string;

  @IsString()
  body!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  personId?: number;
}

export class GenerateReportDto {
  @IsString()
  @IsIn([...REPORT_TYPES])
  reportType!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  rangeLabel?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  wardId?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export { PAYMENT_CLEARED };
