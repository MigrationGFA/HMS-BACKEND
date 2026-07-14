import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class ConfirmCardPaymentDto {
  @IsString()
  @IsIn(['Cash', 'POS Card', 'Bank Transfer', 'Online Card', 'Wallet'])
  paymentChannel!: string;

  /** Receipt / POS / transfer reference for reconciliation. */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  paymentRef?: string;
}
