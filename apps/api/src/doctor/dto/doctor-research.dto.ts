import {
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateRegistryEntryDto {
  @IsOptional()
  @IsInt()
  personId?: number;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  patientLabel!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  diagnosis!: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  eligibility?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  consent?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  enrolledBy?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  studyGroup!: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  status?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  clinic?: string;
}

export class CreateTrialDto {
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(150)
  pi!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  eligibleCount?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  enrolledCount?: number;

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  status?: string;
}

export class PatchTrialDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  pi?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  eligibleCount?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  enrolledCount?: number;

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  status?: string;
}

export class CreateAuditProjectDto {
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  title!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(150)
  department!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(150)
  lead!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  indicator!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  standard!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  performance?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  status?: string;
}

export class PatchAuditProjectDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  department?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  lead?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  indicator?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  standard?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  performance?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  status?: string;
}
