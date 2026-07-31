import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export const MASTER_SERVICE_STATUSES = [
  'DRAFT',
  'PENDING_PRICING',
  'PENDING_APPROVAL',
  'ACTIVE',
  'INACTIVE',
  'REJECTED',
] as const;

export const PAYER_TYPES = ['NHIA', 'HMO', 'CORPORATE'] as const;

export const DELIVERY_MODES = ['PHYSICAL', 'ONLINE', 'BOTH'] as const;

export class CreateDepartmentDto {
  @IsString()
  @MaxLength(255)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  code?: string;
}

export class CreateMasterServiceDto {
  @IsInt()
  categoryId!: number;

  @IsInt()
  departmentId!: number;

  @IsString()
  @MaxLength(255)
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  durationMinutes?: number;

  @IsOptional()
  @IsBoolean()
  onlineBookable?: boolean;

  @IsOptional()
  @IsIn(DELIVERY_MODES)
  deliveryMode?: (typeof DELIVERY_MODES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(5)
  dayStart?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5)
  dayEnd?: string;

  @IsOptional()
  @IsBoolean()
  appointmentRequired?: boolean;

  @IsOptional()
  @IsBoolean()
  requiresDoctorOrder?: boolean;

  @IsOptional()
  @IsBoolean()
  insuranceEligible?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  ageRestriction?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  genderRestriction?: string;
}

export class UpdateMasterServiceDto {
  @IsOptional()
  @IsInt()
  categoryId?: number;

  @IsOptional()
  @IsInt()
  departmentId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  durationMinutes?: number | null;

  @IsOptional()
  @IsBoolean()
  onlineBookable?: boolean;

  @IsOptional()
  @IsIn(DELIVERY_MODES)
  deliveryMode?: (typeof DELIVERY_MODES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(5)
  dayStart?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5)
  dayEnd?: string;

  @IsOptional()
  @IsBoolean()
  appointmentRequired?: boolean;

  @IsOptional()
  @IsBoolean()
  requiresDoctorOrder?: boolean;

  @IsOptional()
  @IsBoolean()
  insuranceEligible?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  ageRestriction?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  genderRestriction?: string | null;

  @IsOptional()
  @IsIn(['INACTIVE', 'DRAFT', 'PENDING_PRICING'])
  status?: string;
}

export class PayerPriceInputDto {
  @IsInt()
  payerId!: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amount!: number;
}

export class SetServicePricingDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  generalPrice!: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  staffPrice?: number | null;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PayerPriceInputDto)
  payerPrices?: PayerPriceInputDto[];

  /** When true, moves service to PENDING_APPROVAL after pricing. Default true. */
  @IsOptional()
  @IsBoolean()
  submitForApproval?: boolean;
}

export class ApprovalDecisionDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class CreateServicePayerDto {
  @IsIn(PAYER_TYPES)
  payerType!: (typeof PAYER_TYPES)[number];

  @IsString()
  @MaxLength(40)
  code!: string;

  @IsString()
  @MaxLength(255)
  name!: string;
}

export class UpdateServicePayerDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsIn(['Active', 'Inactive'])
  status?: string;
}
