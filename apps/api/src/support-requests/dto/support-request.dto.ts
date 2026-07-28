import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export const SUPPORT_ISSUE_TYPES = [
  'Profile Change',
  'Complaint',
  'Technical Issue',
] as const;

export const SUPPORT_STATUSES = [
  'Open',
  'In Progress',
  'Resolved',
  'Closed',
] as const;

export const SUPPORT_MODULES = [
  'pharmacy',
  'doctor',
  'cashier',
  'records',
  'laboratory',
  'other',
] as const;

export class CreateSupportRequestDto {
  @IsString()
  @IsIn([...SUPPORT_ISSUE_TYPES])
  issueType!: (typeof SUPPORT_ISSUE_TYPES)[number];

  @IsString()
  @MinLength(5)
  @MaxLength(4000)
  description!: string;

  @IsOptional()
  @IsString()
  @IsIn([...SUPPORT_MODULES])
  module?: (typeof SUPPORT_MODULES)[number];
}

export class UpdateSupportRequestDto {
  @IsString()
  @IsIn([...SUPPORT_STATUSES])
  status!: (typeof SUPPORT_STATUSES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  resolvedNote?: string;
}
