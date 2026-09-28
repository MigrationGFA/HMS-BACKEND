import { Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class PortalListQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}

export class CreatePortalAppointmentDto {
  @Type(() => Number)
  @IsInt()
  serviceId!: number;

  @IsDateString()
  appointmentDate!: string;

  @IsString()
  @MaxLength(5)
  startTime!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class UpdatePortalProfileDto {
  @IsOptional()
  notifyEnabled?: boolean;
}
