import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class LabItemDto {
  @IsString()
  @MaxLength(50)
  code!: string;

  @IsString()
  @MaxLength(255)
  name!: string;

  @IsOptional()
  @IsNumber()
  price?: number;

  @IsOptional()
  @IsBoolean()
  covered?: boolean;
}

export class CreateLabRequestDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  personId!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  admissionId?: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LabItemDto)
  items!: LabItemDto[];

  @IsOptional()
  @IsString()
  @MaxLength(100)
  orderedBy?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  paymentStatus?: string;
}
