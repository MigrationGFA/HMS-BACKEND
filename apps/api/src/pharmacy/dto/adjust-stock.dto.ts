import {
  IsInt,
  IsString,
  MaxLength,
  MinLength,
  NotEquals,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Manual stock adjustment (+/-). Positive adds to the newest batch, negative
 * deducts from the oldest-expiry batches first (FEFO). Reason is mandatory —
 * every adjustment is audit-logged.
 */
export class AdjustStockDto {
  @Type(() => Number)
  @IsInt()
  drugId!: number;

  @Type(() => Number)
  @IsInt()
  @NotEquals(0)
  qty!: number;

  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}
