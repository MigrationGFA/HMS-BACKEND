import { IsIn, IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';
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
  @IsString()
  @MaxLength(150)
  donorLabel?: string;

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
  @IsString()
  notes?: string;
}
