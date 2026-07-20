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
