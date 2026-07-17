import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class StartEncounterDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  triageId!: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  clinic?: string;
}

export class UpdateEncounterDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version?: number;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  idempotencyKey?: string;

  @IsOptional()
  @IsString()
  chiefComplaint?: string;

  @IsOptional()
  @IsString()
  history?: string;

  @IsOptional()
  @IsString()
  examination?: string;

  @IsOptional()
  @IsString()
  assessment?: string;

  @IsOptional()
  @IsString()
  plan?: string;
}

export class CompleteEncounterDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  outcome?: string;
}
