import { Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class KitchenListQueryDto {
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
  @MaxLength(30)
  status?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  mealSlot?: string;
}

export class CreateKitchenMenuDto {
  @IsString()
  @MaxLength(200)
  name!: string;

  @IsString()
  @MaxLength(30)
  mealSlot!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  dietTags?: string;
}

export class UpdateKitchenMenuDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  mealSlot?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  dietTags?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  status?: string;
}

export class CreateKitchenOrderDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  personId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  admissionId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  menuId?: number;

  @IsString()
  @MaxLength(30)
  mealSlot!: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  wardLabel?: string;

  @IsOptional()
  @IsString()
  dietNotes?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity?: number;

  @IsOptional()
  @IsDateString()
  scheduledFor?: string;
}

export class UpdateKitchenOrderStatusDto {
  @IsString()
  @MaxLength(30)
  status!: string;
}

export class CreateKitchenWastageDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  menuId?: number;

  @IsString()
  @MaxLength(200)
  itemName!: string;

  @Type(() => Number)
  @Min(0)
  quantity!: number;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  unit?: string;

  @IsOptional()
  @IsString()
  reason?: string;
}
