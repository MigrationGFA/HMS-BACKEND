import {
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export const CP_ALERT_TYPES = [
  'DDI',
  'Duplicate',
  'Allergy',
  'AllergyClass',
  'Controlled',
  'Psychiatric',
] as const;

export const CP_SEVERITIES = ['Severe', 'Moderate', 'Mild'] as const;

export const CP_ALERT_STATUSES = [
  'Open',
  'Overridden',
  'Notified',
  'Closed',
] as const;

export const CP_RULE_TYPES = [
  'DDI',
  'Duplicate',
  'AllergyClass',
  'Controlled',
  'Psychiatric',
] as const;

export class CheckInteractionsDto {
  @IsInt()
  personId!: number;

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  drugIds?: number[];

  @IsOptional()
  @IsInt()
  prescriptionId?: number;
}

export class OverrideAlertDto {
  @IsString()
  @MinLength(5)
  @MaxLength(2000)
  reason!: string;
}

export class NotifyAlertDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}

export class CreateRuleDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  code!: string;

  @IsString()
  @IsIn([...CP_RULE_TYPES])
  alertType!: (typeof CP_RULE_TYPES)[number];

  @IsString()
  @IsIn([...CP_SEVERITIES])
  severity!: (typeof CP_SEVERITIES)[number];

  @IsString()
  @MinLength(5)
  message!: string;

  @IsOptional()
  @IsInt()
  drugAId?: number;

  @IsOptional()
  @IsInt()
  drugBId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  drugAName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  drugBName?: string;
}

export class UpdateRuleDto {
  @IsOptional()
  @IsString()
  @IsIn([...CP_SEVERITIES])
  severity?: (typeof CP_SEVERITIES)[number];

  @IsOptional()
  @IsString()
  @MinLength(5)
  message?: string;

  @IsOptional()
  @IsString()
  @IsIn(['Active', 'Inactive'])
  status?: 'Active' | 'Inactive';

  @IsOptional()
  @IsString()
  @MaxLength(255)
  drugAName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  drugBName?: string;

  @IsOptional()
  @IsInt()
  drugAId?: number;

  @IsOptional()
  @IsInt()
  drugBId?: number;
}

export class CreateAllergyDto {
  @IsInt()
  personId!: number;

  @IsString()
  @MinLength(2)
  @MaxLength(150)
  substance!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  reaction?: string;

  @IsOptional()
  @IsString()
  @IsIn([...CP_SEVERITIES])
  severity?: (typeof CP_SEVERITIES)[number];
}

export class UpdateAllergyDto {
  @IsOptional()
  @IsString()
  @MaxLength(150)
  substance?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  reaction?: string;

  @IsOptional()
  @IsString()
  @IsIn([...CP_SEVERITIES])
  severity?: (typeof CP_SEVERITIES)[number];

  @IsOptional()
  @IsString()
  @IsIn(['Active', 'Inactive'])
  status?: 'Active' | 'Inactive';
}
