import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateAdmissionDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  personId!: number;

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
  diagnosis?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  consultant?: string;

  @IsOptional()
  @IsString()
  @IsIn([
    'Psychiatric',
    'ICU',
    'Child',
    'Psychogeriatric',
    'Addiction',
    'General',
    'Rehab',
  ])
  admissionType?: string;

  @IsOptional()
  @IsString()
  @IsIn(['General', 'Close', 'Constant'])
  supervisionLevel?: string;

  /** Link doctor admission request when Records allocates bed. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  admissionRequestId?: number;
}

export class TransferAdmissionDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  bedId!: number;
}

export class OrderDischargeDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class CompleteDischargeDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class CreateWardDto {
  @IsString()
  @MaxLength(50)
  code!: string;

  @IsString()
  @MaxLength(150)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  wardType?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  bedCount?: number;
}
