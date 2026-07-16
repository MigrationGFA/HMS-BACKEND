import {
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export class RecordQueueVitalsDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  weightKg?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  heightCm?: number;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  bloodPressure?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  temperatureC?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  pulseBpm?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  respiratoryRate?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  spo2Pct?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class SendToDoctorDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  clinic?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
