import { IsArray, IsIn, IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';
import { Type } from 'class-transformer';

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const;
const COMPONENTS = ['Whole Blood', 'Packed Cells', 'FFP', 'Platelets', 'Cryoprecipitate'] as const;
const UNIT_STATUSES = ['Available', 'Reserved', 'Issued', 'Expired', 'Quarantine'] as const;
const CROSS_RESULTS = ['Compatible', 'Incompatible', 'Pending'] as const;

export class CreateBloodUnitDto {
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  unitNo!: string;

  @IsIn(BLOOD_GROUPS)
  bloodGroup!: (typeof BLOOD_GROUPS)[number];

  @IsIn(COMPONENTS)
  component!: (typeof COMPONENTS)[number];

  @IsString()
  expiryDate!: string;

  @IsOptional()
  @IsIn(UNIT_STATUSES)
  status?: (typeof UNIT_STATUSES)[number];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  donorId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  donorLabel?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  doctorId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  doctorLabel?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateBloodUnitDto {
  @IsOptional()
  @IsIn(UNIT_STATUSES)
  status?: (typeof UNIT_STATUSES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(150)
  donorLabel?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  expiryDate?: string;
}

export class CreateBloodRequestDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  personId!: number;

  @IsIn(BLOOD_GROUPS)
  bloodGroup!: (typeof BLOOD_GROUPS)[number];

  @Type(() => Number)
  @IsInt()
  @Min(1)
  unitsRequested!: number;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  department!: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  doctorLabel?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  doctorId?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class RecordCrossmatchDto {
  @IsIn(CROSS_RESULTS)
  result!: (typeof CROSS_RESULTS)[number];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  bloodUnitId?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class RejectBloodRequestDto {
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  reason!: string;
}

export class IssueBloodRequestDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  bloodUnitId?: number;

  @IsOptional()
  @IsArray()
  @Type(() => Number)
  @IsInt({ each: true })
  bloodUnitIds?: number[];

  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateBloodDonorDto {
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  fullName!: string;

  @IsString()
  @MinLength(7)
  @MaxLength(40)
  phone!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  address?: string;

  @IsOptional()
  @IsIn(BLOOD_GROUPS)
  bloodGroup?: (typeof BLOOD_GROUPS)[number];

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateBloodDonorDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  fullName?: string;

  @IsOptional()
  @IsString()
  @MinLength(7)
  @MaxLength(40)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  address?: string;

  @IsOptional()
  @IsIn(BLOOD_GROUPS)
  bloodGroup?: (typeof BLOOD_GROUPS)[number];

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsIn(['Active', 'Inactive'])
  status?: 'Active' | 'Inactive';
}
