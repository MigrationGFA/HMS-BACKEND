import {
  IsDateString,
  IsEmail,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/**
 * Registers a patient as a row in PERSONS (canonical patient entity).
 * Field names are camelCase API surface; service maps to PERSONS columns.
 */
export class CreatePersonDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstName!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  lastName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  middleName?: string;

  @IsString()
  @IsIn(['Male', 'Female', 'Other'])
  sex!: string;

  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  maritalStatus?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  religion?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  tribe?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  ethnicGroup?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  residentialAddress?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  homeTown?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  stateOfOrigin?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  nationality?: string;

  @IsString()
  @MinLength(7)
  @MaxLength(50)
  patientPhoneNo!: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  occupation?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  nameOfEmployer?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  nameOfNextOfKin?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  relationship?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  addressOfNextOfKin?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  telephoneOfNextOfKin?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  identityType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  identityNo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  nhisNo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  bloodGroup?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  patientType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  regType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  cardNo?: string;

  /** Registration charges (configurable per hospital; passed from the UI). */
  @IsOptional()
  @IsNumber()
  @Min(0)
  regFee?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  consultFee?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  cardFee?: number;

  /** Client idempotency key for safe retries after network failure. */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  idempotencyKey?: string;
}
