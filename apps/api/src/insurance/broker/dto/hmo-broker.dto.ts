import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class EligibilityQueryDto {
  @Type(() => Number)
  @IsInt()
  personId!: number;

  @Type(() => Number)
  @IsInt()
  payerId!: number;

  @IsString()
  @MaxLength(80)
  memberNo!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  encounterId?: number;
}

export class BenefitsQueryDto {
  @Type(() => Number)
  @IsInt()
  personId!: number;

  @Type(() => Number)
  @IsInt()
  payerId!: number;

  @IsString()
  @MaxLength(80)
  memberNo!: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  serviceCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  category?: string;
}

export class PreAuthLineDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  serviceCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  unitAmount?: number;
}

export class CreatePreAuthDto {
  @IsInt()
  personId!: number;

  @IsInt()
  payerId!: number;

  @IsString()
  @MaxLength(80)
  memberNo!: string;

  @IsOptional()
  @IsInt()
  encounterId?: number;

  @IsOptional()
  @IsInt()
  admissionId?: number;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  diagnosisCodes!: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  procedureCodes?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  serviceCodes?: string[];

  @IsOptional()
  @IsNumber()
  @Min(0)
  estimatedAmount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  idempotencyKey?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PreAuthLineDto)
  lines?: PreAuthLineDto[];
}

export class ClaimLineDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  serviceCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  unitAmount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  payerAmount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  patientAmount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  billLineRef?: string;
}

export class SubmitClaimDto {
  @IsInt()
  personId!: number;

  @IsInt()
  payerId!: number;

  @IsString()
  @MaxLength(80)
  memberNo!: string;

  @IsOptional()
  @IsInt()
  authId?: number;

  @IsOptional()
  @IsInt()
  encounterId?: number;

  @IsOptional()
  @IsInt()
  admissionId?: number;

  @IsNumber()
  @Min(0)
  totalAmount!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  payerAmount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  patientAmount?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  diagnosisCodes?: string[];

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ClaimLineDto)
  lines!: ClaimLineDto[];

  @IsOptional()
  @IsString()
  @MaxLength(80)
  idempotencyKey?: string;
}

export class UpsertCoverageDto {
  @IsInt()
  personId!: number;

  @IsInt()
  payerId!: number;

  @IsString()
  @MaxLength(80)
  memberNo!: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  planCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  planName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  employerName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  principalFlag?: string;

  @IsOptional()
  @IsString()
  validFrom?: string;

  @IsOptional()
  @IsString()
  validTo?: string;
}
