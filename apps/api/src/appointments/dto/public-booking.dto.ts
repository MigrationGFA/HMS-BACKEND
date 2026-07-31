import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

export class PublicAvailabilityQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  serviceId!: number;

  /** YYYY-MM-DD */
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date!: string;

  @IsIn(['PHYSICAL', 'ONLINE'])
  mode!: 'PHYSICAL' | 'ONLINE';
}

export class CreatePublicBookingDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  serviceId!: number;

  /** YYYY-MM-DD */
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date!: string;

  /** HH:mm */
  @IsString()
  @Matches(/^\d{2}:\d{2}$/)
  startTime!: string;

  @IsIn(['PHYSICAL', 'ONLINE'])
  mode!: 'PHYSICAL' | 'ONLINE';

  @IsString()
  @MaxLength(255)
  patientName!: string;

  @IsString()
  @MaxLength(40)
  phone!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  age?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  gender?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
