import {
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Records goods received. poId is optional so direct stock receipts (no PO)
 * from the inventory page are also supported. Creates a GRN + drug batch and
 * increases available stock by the accepted quantity.
 */
export class ReceiveStockDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  poId?: number;

  @Type(() => Number)
  @IsInt()
  drugId!: number;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  batchNo!: string;

  @IsOptional()
  @IsDateString()
  mfgDate?: string;

  @IsOptional()
  @IsDateString()
  expiryDate?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  qtyOrdered?: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  qtyReceived!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  qtyDamaged?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  unitCost?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  sellingPrice?: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  location?: string;

  /** Display name of the receiving officer (defaults to the actor). */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  receivedBy?: string;
}
