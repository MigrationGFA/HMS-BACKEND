import { Type } from 'class-transformer';
import {
  ArrayMinSize,
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

export const HEIP_FIELD_TYPES = [
  'number',
  'currency',
  'text',
  'longtext',
  'boolean',
  'select',
  'multiselect',
  'datetime',
  'table',
  'attachment',
] as const;

export type HeipFieldType = (typeof HEIP_FIELD_TYPES)[number];

export const HEIP_REPORT_STATUSES = [
  'Draft',
  'Submitted',
  'Returned',
  'Approved',
  'Missed',
] as const;

export type HeipReportStatus = (typeof HEIP_REPORT_STATUSES)[number];

export class HeipCriticalDto {
  @IsIn(['gt', 'eq', 'truthy'])
  op!: 'gt' | 'eq' | 'truthy';

  @IsOptional()
  value?: number | string | boolean;
}

export class HeipFieldSchemaDto {
  @IsString()
  @MaxLength(80)
  key!: string;

  @IsString()
  @MaxLength(200)
  label!: string;

  @IsIn(HEIP_FIELD_TYPES)
  type!: HeipFieldType;

  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @IsOptional()
  @IsNumber()
  min?: number;

  @IsOptional()
  @IsNumber()
  max?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  options?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(80)
  metricKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  autoFillSource?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => HeipCriticalDto)
  critical?: HeipCriticalDto;

  @IsOptional()
  @IsString()
  helpText?: string;
}

export class CreateHeipTemplateDto {
  @IsString()
  @MaxLength(60)
  code!: string;

  @IsString()
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  departmentId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  roleName?: string;

  @IsOptional()
  @IsIn(['daily', 'shift', 'weekly'])
  frequency?: 'daily' | 'shift' | 'weekly';

  @IsOptional()
  @IsInt()
  @Min(0)
  deadlineHour?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  deadlineGraceHours?: number;
}

export class UpdateHeipTemplateDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  departmentId?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  roleName?: string | null;

  @IsOptional()
  @IsIn(['daily', 'shift', 'weekly'])
  frequency?: 'daily' | 'shift' | 'weekly';

  @IsOptional()
  @IsInt()
  @Min(0)
  deadlineHour?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  deadlineGraceHours?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class SaveHeipTemplateVersionDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => HeipFieldSchemaDto)
  fields!: HeipFieldSchemaDto[];
}

export class HeipReportValueInputDto {
  @IsString()
  @MaxLength(80)
  fieldKey!: string;

  @IsOptional()
  @IsString()
  valueText?: string | null;

  @IsOptional()
  @IsNumber()
  valueNumber?: number | null;

  @IsOptional()
  valueJson?: unknown;

  @IsOptional()
  @IsNumber()
  systemValueNumber?: number | null;

  @IsOptional()
  @IsString()
  systemValueText?: string | null;

  @IsOptional()
  @IsString()
  overrideReason?: string | null;
}

export class HeipDraftDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  templateId?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  reportId?: number;

  @IsOptional()
  @IsDateString()
  reportDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  shift?: string | null;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => HeipReportValueInputDto)
  values!: HeipReportValueInputDto[];
}

export class HeipSubmitDto extends HeipDraftDto {}

export class HeipAmendDto {
  @IsString()
  @MaxLength(2000)
  reason!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => HeipReportValueInputDto)
  values!: HeipReportValueInputDto[];
}

export class HeipReturnDto {
  @IsString()
  @MaxLength(2000)
  comment!: string;
}

export class HeipTeamSummaryDto {
  @IsInt()
  @Min(1)
  departmentId!: number;

  @IsDateString()
  reportDate!: string;

  @IsString()
  @MaxLength(8000)
  body!: string;
}

export class HeipAckRedFlagDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}

export class HeipRunDeadlinesDto {
  @IsOptional()
  @IsDateString()
  date?: string;
}

export class HeipTodayQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  shift?: string;
}

export class HeipDateQueryDto {
  @IsOptional()
  @IsDateString()
  date?: string;
}

export class HeipMetricsQueryDto {
  @IsDateString()
  from!: string;

  @IsDateString()
  to!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  metricKey?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  departmentId?: number;
}

export class HeipRedFlagsQueryDto {
  @IsOptional()
  @IsIn(['true', 'false'])
  acked?: string;
}
