import { Type } from 'class-transformer';
import {
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateClinicalNoteDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  personId!: number;

  @IsString()
  @MaxLength(100)
  noteType!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  clinic?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  encounterId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  priority?: string;

  @IsOptional()
  @IsObject()
  fields?: Record<string, string>;
}

export class UpdateClinicalNoteDto {
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
  @IsObject()
  fields?: Record<string, string>;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  noteType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  clinic?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  priority?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  changeSummary?: string;
}

export class ReturnClinicalNoteDto {
  @IsString()
  @MaxLength(2000)
  reason!: string;
}

export class SignClinicalNoteDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  attestation?: string;
}
