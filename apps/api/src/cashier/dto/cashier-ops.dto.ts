import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';

export class CreateRefundDto {
  @IsNumber()
  receiptId!: number;

  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsIn(['REFUND', 'REVERSAL'])
  kind!: 'REFUND' | 'REVERSAL';

  @IsIn(['Cash', 'POS Card', 'Bank Transfer', 'Wallet'])
  method!: string;

  @IsString()
  @MinLength(3)
  reason!: string;
}

export class CreateDiscountDto {
  @IsIn(['card', 'pharmacy', 'prescription', 'lab', 'admission', 'imaging'])
  sourceType!: string;

  @IsNumber()
  sourceId!: number;

  @IsIn(['PERCENT', 'FIXED', 'WAIVER'])
  discKind!: 'PERCENT' | 'FIXED' | 'WAIVER';

  @IsOptional()
  @IsNumber()
  @Min(0)
  value?: number;

  @IsString()
  @MinLength(1)
  category!: string;

  @IsString()
  @MinLength(3)
  reason!: string;
}

export class OpenShiftDto {
  @IsNumber()
  @Min(0)
  openingFloat!: number;
}

export class CloseShiftDto {
  @IsNumber()
  @Min(0)
  actualCash!: number;

  @IsOptional()
  @IsString()
  note?: string;
}

export class UpdateCashierSettingsDto {
  @IsOptional()
  @IsBoolean()
  cashEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  posEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  bankTransferEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  onlineCardEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  walletEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  nhiaEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  hmoEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  requireOpenShift?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  varianceTolerance?: number;

  @IsOptional()
  @IsBoolean()
  reprintWatermark?: boolean;
}
