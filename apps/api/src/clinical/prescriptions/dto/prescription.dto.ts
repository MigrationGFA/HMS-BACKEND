import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class CreatePrescriptionItemDto {
  @IsInt()
  @Min(1)
  drugId!: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  strength?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  form?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  route?: string;

  @IsString()
  @MaxLength(100)
  dose!: string;

  @IsString()
  @MaxLength(50)
  frequency!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  duration?: string;

  @IsInt()
  @Min(1)
  quantity!: number;

  @IsOptional()
  @IsIn(['Internal Pharmacy', 'External Purchase', 'Patient Own Drug'])
  source?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  instructions?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  indication?: string;
}

export class CreatePrescriptionDto {
  @IsInt()
  @Min(1)
  personId!: number;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreatePrescriptionItemDto)
  items!: CreatePrescriptionItemDto[];

  /** When true (default), status becomes Sent and pharmacy can see it. */
  @IsOptional()
  @IsBoolean()
  send?: boolean;

  @IsOptional()
  @IsIn(['Routine', 'Urgent', 'Stat'])
  urgency?: string;

  @IsOptional()
  @IsIn(['Unpaid', 'Paid', 'Waived', 'Emergency'])
  paymentStatus?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  diagnosis?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  allergiesNote?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  clinic?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string;
}

export class UpdatePrescriptionDto {
  @IsOptional()
  @IsIn(['Draft', 'Sent', 'Dispensed', 'Partially Dispensed', 'Cancelled', 'Rejected'])
  status?: string;

  @IsOptional()
  @IsIn(['Unpaid', 'Paid', 'Waived', 'Emergency'])
  paymentStatus?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  pharmacyNotes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string;
}

export class DispenseItemDto {
  @IsInt()
  @Min(1)
  itemId!: number;

  /** Quantity to dispense now (defaults to remaining qty when omitted). */
  @IsOptional()
  @IsInt()
  @Min(1)
  quantity?: number;
}

export class DispensePrescriptionDto {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DispenseItemDto)
  items?: DispenseItemDto[];

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  pharmacyNotes?: string;
}

export class EmergencyDispensePrescriptionDto extends DispensePrescriptionDto {
  /** Staff or person who received the drugs (required for emergency unpaid dispense). */
  @IsString()
  @MaxLength(100)
  receivedBy!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}

export class ConfirmPrescriptionPaymentDto {
  @IsString()
  @IsIn(['Cash', 'POS Card', 'Bank Transfer', 'Online Card', 'Wallet'])
  paymentChannel!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  paymentRef?: string;
}
