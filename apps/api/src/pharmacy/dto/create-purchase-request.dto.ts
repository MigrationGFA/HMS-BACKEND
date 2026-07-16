import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreatePurchaseRequestDto {
  @Type(() => Number)
  @IsInt()
  drugId!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  qty!: number;

  @IsOptional()
  @IsString()
  @IsIn(['Low', 'Normal', 'High', 'Critical'])
  priority?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @IsOptional()
  @IsString()
  note?: string;

  /** Display name of the requesting officer (defaults to the actor). */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  requestedBy?: string;
}
