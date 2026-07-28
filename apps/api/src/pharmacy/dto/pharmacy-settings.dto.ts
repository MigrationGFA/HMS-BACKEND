import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  Max,
  Min,
} from 'class-validator';

export class UpdatePharmacySettingsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  defaultReorderLevel?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3650)
  expiringSoonDays?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3650)
  expiryCriticalDays?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3650)
  expiryWarningDays?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3650)
  receiveStockWarnDays?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  recentlyReceivedDays?: number;

  @IsOptional()
  @IsBoolean()
  controlledRequiresWitness?: boolean;

  @IsOptional()
  @IsBoolean()
  lowStockAlertEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  expiryAlertEnabled?: boolean;
}
