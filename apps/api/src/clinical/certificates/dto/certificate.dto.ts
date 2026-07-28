import {
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateCertificateDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  personId!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  templateId!: number;

  @IsOptional()
  @IsObject()
  fields?: Record<string, string>;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  layout?: string;

  @IsOptional()
  @IsString()
  validityUntil?: string;
}

export class UpdateCertificateDto {
  @IsOptional()
  @IsObject()
  fields?: Record<string, string>;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  layout?: string;

  @IsOptional()
  @IsString()
  validityUntil?: string | null;
}

export class NoteDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}

export class CancelCertificateDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(2000)
  reason?: string;
}
