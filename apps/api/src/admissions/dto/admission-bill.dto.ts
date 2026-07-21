import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

const PAYMENT_CHANNELS = [
  'Cash',
  'POS Card',
  'Bank Transfer',
  'Online Card',
  'Wallet',
] as const;

export class ConfirmAdmissionBillPaymentDto {
  @IsString()
  @IsIn([...PAYMENT_CHANNELS])
  paymentChannel!: (typeof PAYMENT_CHANNELS)[number];

  @IsOptional()
  @IsString()
  @MaxLength(100)
  paymentRef?: string;
}
