import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
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

  @IsIn(['NEW', 'RETURNING'])
  patientType!: 'NEW' | 'RETURNING';

  @IsOptional()
  @IsString()
  @MaxLength(100)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  lastName?: string;

  /** Legacy combined name; preferred: firstName + lastName */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  patientName?: string;

  @IsString()
  @MinLength(10)
  @MaxLength(40)
  phone!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  nin?: string;

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

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  personId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  verificationToken?: string;
}

export class PublicPatientLookupDto {
  @IsString()
  @MinLength(3)
  @MaxLength(100)
  q!: string;
}

export class PublicVerifySendDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  personId!: number;
}

export class PublicVerifyConfirmDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  personId!: number;

  @IsString()
  @MinLength(4)
  @MaxLength(10)
  code!: string;
}
