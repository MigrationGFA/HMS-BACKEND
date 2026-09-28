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

export class FleetListQueryDto {
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

  @IsOptional()
  @IsString()
  @MaxLength(30)
  status?: string;
}

export class CreateFleetVehicleDto {
  @IsString()
  @MaxLength(40)
  regNo!: string;

  @IsString()
  @MaxLength(30)
  type!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  model?: string;

  @IsOptional()
  @IsDateString()
  insuranceExpiry?: string;

  @IsOptional()
  @IsDateString()
  registrationExpiry?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateFleetVehicleDto {
  @IsOptional()
  @IsString()
  @MaxLength(30)
  type?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  model?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  status?: string;

  @IsOptional()
  @IsDateString()
  insuranceExpiry?: string;

  @IsOptional()
  @IsDateString()
  registrationExpiry?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateFleetDriverDto {
  @IsString()
  @MaxLength(150)
  name!: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  licenseNo?: string;

  @IsOptional()
  @IsDateString()
  licenseExpiry?: string;
}

export class CreateFleetTripRequestDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  personId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  department?: string;

  @IsString()
  purpose!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  pickupLocation?: string;

  @IsString()
  @MaxLength(255)
  destination!: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  priority?: string;
}

export class DecideTripRequestDto {
  @IsOptional()
  @IsString()
  decisionNote?: string;
}

export class CreateFleetTripDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  requestId?: number;

  @Type(() => Number)
  @IsInt()
  vehicleId!: number;

  @Type(() => Number)
  @IsInt()
  driverId!: number;

  @IsString()
  purpose!: string;

  @IsOptional()
  @IsString()
  fromLocation?: string;

  @IsString()
  toLocation!: string;

  @IsOptional()
  @IsDateString()
  startAt?: string;
}

export class UpdateFleetTripDto {
  @IsOptional()
  @IsString()
  @MaxLength(30)
  status?: string;

  @IsOptional()
  @IsDateString()
  endAt?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  mileageEnd?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateFleetFuelDto {
  @Type(() => Number)
  @IsInt()
  vehicleId!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  tripId?: number;

  @Type(() => Number)
  @Min(0)
  liters!: number;

  @Type(() => Number)
  @Min(0)
  cost!: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateFleetMaintenanceDto {
  @Type(() => Number)
  @IsInt()
  vehicleId!: number;

  @IsString()
  @MaxLength(30)
  type!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @Type(() => Number)
  cost?: number;

  @IsOptional()
  @IsDateString()
  scheduledDate?: string;
}

export class UpdateFleetMaintenanceDto {
  @IsOptional()
  @IsString()
  @MaxLength(20)
  status?: string;

  @IsOptional()
  @IsDateString()
  completedDate?: string;

  @IsOptional()
  @Type(() => Number)
  cost?: number;

  @IsOptional()
  @IsString()
  description?: string;
}
