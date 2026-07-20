import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ArrayMinSize,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateLabTestDto {
  @IsString()
  @MaxLength(50)
  testCode!: string;

  @IsString()
  @MaxLength(255)
  name!: string;

  @IsString()
  @MaxLength(100)
  category!: string;

  @IsString()
  @MaxLength(100)
  specimenType!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  container?: string;

  @IsString()
  @MaxLength(50)
  turnaround!: string;

  @IsNumber()
  @Min(0)
  unitPrice!: number;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  loincCode?: string;

  @IsOptional()
  @IsBoolean()
  isPanel?: boolean;

  @IsOptional()
  @IsString()
  @IsIn(['Active', 'Inactive'])
  status?: string;
}

export class UpdateLabTestDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  specimenType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  container?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  turnaround?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  unitPrice?: number;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  loincCode?: string;

  @IsOptional()
  @IsBoolean()
  isPanel?: boolean;

  @IsOptional()
  @IsString()
  @IsIn(['Active', 'Inactive'])
  status?: string;
}

export class CreateLabRequestItemDto {
  @IsInt()
  @Min(1)
  testId!: number;

  @IsOptional()
  @IsString()
  lineNotes?: string;
}

export class CreateLabRequestDto {
  @IsInt()
  @Min(1)
  personId!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  encounterId?: number;

  @IsOptional()
  @IsString()
  @IsIn(['Routine', 'Urgent', 'Stat'])
  priority?: string;

  @IsOptional()
  @IsString()
  clinicalIndication?: string;

  @IsOptional()
  @IsString()
  clinicalNotes?: string;

  @IsOptional()
  @IsString()
  @IsIn(['Doctor', 'WalkIn'])
  source?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateLabRequestItemDto)
  items!: CreateLabRequestItemDto[];
}

export class ConfirmLabRequestPaymentDto {
  @IsString()
  @IsIn(['Cash', 'POS Card', 'Bank Transfer', 'Online Card', 'Wallet'])
  paymentChannel!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  paymentRef?: string;
}

// ---------------------------------------------------------------------------
// Result templates
// ---------------------------------------------------------------------------

export class TemplateFieldDto {
  @IsString()
  @MaxLength(100)
  key!: string;

  @IsString()
  @MaxLength(255)
  label!: string;

  @IsString()
  @IsIn(['select', 'number', 'text', 'textarea', 'multiselect'])
  type!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  options?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(50)
  unit?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  ref?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  critical?: string[];

  @IsOptional()
  @IsBoolean()
  required?: boolean;
}

export class CreateLabTemplateDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  code?: string;

  @IsString()
  @MaxLength(255)
  name!: string;

  @IsString()
  @MaxLength(100)
  category!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => TemplateFieldDto)
  fields!: TemplateFieldDto[];

  @IsOptional()
  @IsString()
  @IsIn(['Active', 'Inactive'])
  status?: string;
}

export class UpdateLabTemplateDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => TemplateFieldDto)
  fields?: TemplateFieldDto[];

  @IsOptional()
  @IsString()
  @IsIn(['Active', 'Inactive'])
  status?: string;
}

// ---------------------------------------------------------------------------
// LIS pipeline: samples, results, validation, amendment
// ---------------------------------------------------------------------------

export class RejectLabSampleDto {
  @IsString()
  @MaxLength(1000)
  reason!: string;
}

export class LabResultItemDto {
  @IsInt()
  @Min(1)
  requestItemId!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  templateId?: number;

  /** Values keyed by template field key (string | number | string[]). */
  @IsObject()
  values!: Record<string, unknown>;

  @IsOptional()
  @IsString()
  comment?: string;
}

export class SaveLabResultsDto {
  @IsString()
  @IsIn(['draft', 'submit'])
  action!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => LabResultItemDto)
  items!: LabResultItemDto[];
}

export class ReturnLabResultDto {
  @IsString()
  @MaxLength(1000)
  reason!: string;
}

export class AmendLabResultDto {
  @IsObject()
  values!: Record<string, unknown>;

  @IsOptional()
  @IsString()
  comment?: string;

  @IsString()
  @MaxLength(1000)
  reason!: string;
}
