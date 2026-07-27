import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateFileRequestDto {
  @IsInt()
  personId!: number;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  department!: string;

  @IsString()
  @MinLength(3)
  reason!: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  requestedBy?: string;
}

export class UpdateFileRequestStatusDto {
  @IsString()
  @IsIn(['Released', 'In Transit', 'Returned', 'Missing', 'Overdue', 'Requested'])
  status!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  location?: string;
}

export class CreateArchiveDto {
  @IsInt()
  personId!: number;

  @IsString()
  @IsIn(['Inactive', 'Deceased', 'Long-Stay', 'Restricted', 'Legal Hold'])
  category!: string;

  @IsOptional()
  @IsString()
  @IsIn(['Standard', 'Supervisor', 'Legal Only'])
  accessLevel?: string;

  @IsOptional()
  @IsDateString()
  retentionUntil?: string;

  @IsOptional()
  @IsDateString()
  dueReviewAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class UpdateArchiveDto {
  @IsOptional()
  @IsString()
  @IsIn(['Standard', 'Supervisor', 'Legal Only'])
  accessLevel?: string;

  @IsOptional()
  @IsDateString()
  retentionUntil?: string;

  @IsOptional()
  @IsDateString()
  dueReviewAt?: string;

  @IsOptional()
  @IsString()
  @IsIn(['Inactive', 'Deceased', 'Long-Stay', 'Restricted', 'Legal Hold'])
  category?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class ArchiveAccessRequestDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reason?: string;
}

export class GenerateReportDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  reportType!: string;

  @IsDateString()
  from!: string;

  @IsDateString()
  to!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  department?: string;
}
