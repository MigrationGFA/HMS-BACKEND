import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class RouteArrivalDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  personId!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  triageId?: number;

  @IsString()
  @IsIn(['triage', 'consult', 'emergency', 'checkout'])
  action!: 'triage' | 'consult' | 'emergency' | 'checkout';

  @IsOptional()
  @IsString()
  @MaxLength(100)
  clinic?: string;
}
