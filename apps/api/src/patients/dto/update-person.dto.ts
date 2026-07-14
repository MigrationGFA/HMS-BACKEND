import {
  IsDateString,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

/** Partial update after early registration (post payment / medical steps). */
export class UpdatePersonDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  middleName?: string;

  @IsOptional()
  @IsString()
  @IsIn(['Male', 'Female', 'Other'])
  sex?: string;

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

  @IsOptional()
  @IsString()
  @MaxLength(50)
  patientPhoneNo?: string;

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

  /** Pending Payment | Incomplete | Active */
  @IsOptional()
  @IsString()
  @IsIn(['Pending Payment', 'Incomplete', 'Active'])
  status?: string;
}
