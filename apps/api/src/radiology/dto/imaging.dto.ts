import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateImagingRequestItemDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  studyId!: number;

  @IsOptional()
  @IsString()
  lineNotes?: string;
}

export class CreateImagingRequestDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  personId!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  encounterId?: number;

  @IsOptional()
  @IsString()
  @IsIn(['Routine', 'Urgent', 'Emergency', 'Stat'])
  priority?: string;

  @IsOptional()
  @IsString()
  clinicalIndication?: string;

  @IsOptional()
  @IsString()
  clinicalNotes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  contrast?: string;

  @IsOptional()
  @IsString()
  @IsIn(['Doctor', 'WalkIn', 'Ward', 'Emergency'])
  source?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateImagingRequestItemDto)
  items!: CreateImagingRequestItemDto[];
}

export class UpdateImagingRequestDto {
  @IsOptional()
  @IsString()
  @IsIn(['Sent', 'Accepted', 'Rejected', 'Cancelled', 'Scheduled', 'InProgress', 'Completed'])
  status?: string;

  @IsOptional()
  @IsString()
  rejectionReason?: string;
}

export class ConfirmImagingRequestPaymentDto {
  @IsString()
  @MaxLength(50)
  paymentChannel!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  paymentRef?: string;
}
