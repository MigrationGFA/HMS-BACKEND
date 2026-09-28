import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class ScmListQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  status?: string;
}

export class CreateScmSupplierDto {
  @IsString()
  @MaxLength(255)
  name!: string;

  @IsOptional()
  @IsString()
  contactPerson?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateScmSupplierDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsString()
  contactPerson?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  status?: string;
}

export class ScmPoLineDto {
  @Type(() => Number)
  @IsInt()
  itemId!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  qty!: number;

  @Type(() => Number)
  @Min(0)
  unitCost!: number;
}

export class CreateScmPoDto {
  @Type(() => Number)
  @IsInt()
  supplierId!: number;

  @IsOptional()
  @IsDateString()
  expectedDate?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ScmPoLineDto)
  lines!: ScmPoLineDto[];
}

export class UpdateScmPoDto {
  @IsOptional()
  @IsDateString()
  expectedDate?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ScmPoLineDto)
  lines?: ScmPoLineDto[];
}

export class ScmGrnLineDto {
  @Type(() => Number)
  @IsInt()
  itemId!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  poLineId?: number;

  @IsString()
  @MaxLength(100)
  batchNo!: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  qtyReceived!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  qtyDamaged?: number;

  @IsOptional()
  @Type(() => Number)
  unitCost?: number;

  @IsOptional()
  @IsString()
  expiryDate?: string;
}

export class CreateScmGrnDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  poId?: number;

  @Type(() => Number)
  @IsInt()
  locationId!: number;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ScmGrnLineDto)
  lines!: ScmGrnLineDto[];
}
