import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class ConfirmBookingPaymentDto {
  @IsString()
  @IsIn(['Cash', 'POS Card', 'Bank Transfer', 'Online Card', 'Wallet'])
  paymentChannel!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  paymentRef?: string;
}
