import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class ListQueryDto {
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

export class CreateStoreItemDto {
  @IsString()
  @MaxLength(60)
  sku!: string;

  @IsString()
  @MaxLength(255)
  name!: string;

  @Type(() => Number)
  @IsInt()
  categoryId!: number;

  @IsString()
  @MaxLength(30)
  unit!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  reorderLevel?: number;

  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdateStoreItemDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  categoryId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  unit?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  reorderLevel?: number;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  status?: string;
}

export class StockReceiveDto {
  @Type(() => Number)
  @IsInt()
  itemId!: number;

  @Type(() => Number)
  @IsInt()
  locationId!: number;

  @IsString()
  @MaxLength(100)
  batchNo!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  qty!: number;

  @IsOptional()
  @Type(() => Number)
  unitCost?: number;

  @IsOptional()
  @IsString()
  expiryDate?: string;

  @IsOptional()
  @IsString()
  reason?: string;
}

export class StockIssueDto {
  @Type(() => Number)
  @IsInt()
  itemId!: number;

  @Type(() => Number)
  @IsInt()
  locationId!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  qty!: number;

  @IsOptional()
  @IsString()
  reason?: string;
}

export class StockAdjustDto {
  @Type(() => Number)
  @IsInt()
  batchId!: number;

  @Type(() => Number)
  @IsInt()
  qtyDelta!: number;

  @IsString()
  @MaxLength(500)
  reason!: string;
}

export class RequisitionLineDto {
  @Type(() => Number)
  @IsInt()
  itemId!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  qtyRequested!: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateRequisitionDto {
  @IsString()
  @MaxLength(150)
  fromDepartment!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  locationId?: number;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RequisitionLineDto)
  lines!: RequisitionLineDto[];
}

export class DecideRequisitionDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  decisionNote?: string;
}

export class IssueRequisitionDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  locationId?: number;
}
