import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  lastName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  licenseNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  specialties?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  subSpecialty?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  qualifications?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  departmentName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  clinicName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  consultationHours?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  wardAssignment?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  phoneNo?: string;
}
