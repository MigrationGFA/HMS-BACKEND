import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class WalkInSaleItemDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  drugId!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number;
}

/**
 * Create a walk-in pharmacy request. Payment stays Unpaid until cashier confirms.
 * Provide personId OR walk-in customer fields (name + phone) to resolve/create PERSONS.
 */
export class CreateWalkInSaleDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  personId?: number;

  /** Full name for new walk-in customer (used when personId omitted). */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  customerName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  hospitalNo?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => WalkInSaleItemDto)
  items!: WalkInSaleItemDto[];

  /** Preferred payment channel for cashier (actual pay happens at cashier). */
  @IsOptional()
  @IsString()
  @IsIn(['Cash', 'POS Card', 'Bank Transfer', 'Wallet', 'POS', 'Transfer'])
  preferredPaymentChannel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class ConfirmWalkInPaymentDto {
  @IsString()
  @IsIn(['Cash', 'POS Card', 'Bank Transfer', 'Online Card', 'Wallet'])
  paymentChannel!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  paymentRef?: string;
}

export class DispenseWalkInSaleDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  pharmacyNotes?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DispenseWalkInItemDto)
  items?: DispenseWalkInItemDto[];
}

export class DispenseWalkInItemDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  itemId!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity?: number;
}
