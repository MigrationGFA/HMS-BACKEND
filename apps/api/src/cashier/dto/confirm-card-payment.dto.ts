import { IsIn, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class ConfirmCardPaymentDto {
  @IsString()
  @IsIn(['Cash', 'POS Card', 'Bank Transfer', 'Online Card', 'Wallet'])
  paymentChannel!: string;

  /** Receipt / POS / transfer reference for reconciliation. */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  paymentRef?: string;

  /**
   * Patient co-pay portion when HMO/NHIA covers the rest.
   * When set, receipt amount uses this; payerLiability is recorded for AR.
   */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  patientAmount?: number;

  /** Accrued HMO/NHIA liability (not collected at desk). */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  payerLiability?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  payerId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  authCode?: string;
}
