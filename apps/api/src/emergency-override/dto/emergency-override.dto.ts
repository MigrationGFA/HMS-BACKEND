import { IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class CreateEmergencyOverrideSessionDto {
  @IsInt()
  personId!: number;

  @IsOptional()
  @IsInt()
  admissionId?: number;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  reason!: string;

  @IsString()
  @MinLength(5)
  justification!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  severity?: number;

  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(24 * 60)
  durationMinutes?: number;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  location?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  consultant?: string;
}

export class CreateEmergencyAlertDto {
  @IsOptional()
  @IsInt()
  personId?: number;

  @IsString()
  @MinLength(2)
  @MaxLength(80)
  alertType!: string;

  @IsString()
  @MinLength(3)
  message!: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  severity?: string;
}
