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

export class CreatePharmacyReturnItemDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  sourceItemId!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number;
}

export class CreatePharmacyReturnDto {
  @IsIn(['prescription', 'walk_in'])
  sourceType!: 'prescription' | 'walk_in';

  @Type(() => Number)
  @IsInt()
  @Min(1)
  sourceId!: number;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreatePharmacyReturnItemDto)
  items!: CreatePharmacyReturnItemDto[];

  @IsString()
  @MaxLength(4000)
  reason!: string;

  @IsIn(['Patient', 'Doctor', 'Nurse', 'Pharmacist', 'Other'])
  returnedByRole!: string;

  @IsString()
  @MaxLength(150)
  returnedByName!: string;
}
