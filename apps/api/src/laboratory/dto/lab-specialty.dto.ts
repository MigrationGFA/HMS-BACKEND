import {
  IsArray,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export const DRUG_CATALOG = [
  { code: 'thc', name: 'Cannabis' },
  { code: 'coc', name: 'Cocaine' },
  { code: 'opi', name: 'Opioids' },
  { code: 'bzo', name: 'Benzodiazepines' },
  { code: 'amp', name: 'Amphetamines' },
  { code: 'met', name: 'Methamphetamine' },
  { code: 'tra', name: 'Tramadol' },
  { code: 'alc', name: 'Alcohol' },
  { code: 'mdp', name: 'Multi-Drug Panel' },
] as const;

export class CreateDrugScreenDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  personId!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  labRequestId?: number;

  @IsArray()
  @IsString({ each: true })
  drugCodes!: string[];
}

export class CollectDrugScreenDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  sampleNo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  sampleType?: string;

  @IsOptional()
  @IsString()
  collectedAt?: string;
}

export class DrugResultLineDto {
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  drugCode!: string;

  @IsIn(['Negative', 'Positive', 'Pending'])
  result!: 'Negative' | 'Positive' | 'Pending';

  @IsOptional()
  @IsString()
  @MaxLength(255)
  remarks?: string;
}

export class PatchDrugScreenResultsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DrugResultLineDto)
  results!: DrugResultLineDto[];
}

export class RejectDrugScreenDto {
  @IsString()
  @MinLength(2)
  reason!: string;
}

export class SensitivityLineDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  antibiotic!: string;

  @IsIn(['S', 'I', 'R', 's', 'i', 'r'])
  result!: string;
}

export class CreateCultureDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  personId!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  labRequestId?: number;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  cultureType!: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  organism?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  colonyCount?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  gramStain?: string;

  @IsOptional()
  @IsIn(['Provisional', 'Final', 'Cancelled'])
  status?: 'Provisional' | 'Final' | 'Cancelled';

  @IsOptional()
  @IsString()
  @MaxLength(150)
  scientist?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SensitivityLineDto)
  sensitivities?: SensitivityLineDto[];
}

export class PatchCultureDto {
  @IsOptional()
  @IsString()
  @MaxLength(150)
  organism?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  colonyCount?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  gramStain?: string;

  @IsOptional()
  @IsIn(['Provisional', 'Final', 'Cancelled'])
  status?: 'Provisional' | 'Final' | 'Cancelled';

  @IsOptional()
  @IsString()
  @MaxLength(150)
  scientist?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SensitivityLineDto)
  sensitivities?: SensitivityLineDto[];
}

export class GenerateLabReportDto {
  @IsIn([
    'Daily Report',
    'Weekly Report',
    'Monthly Report',
    'Revenue Report',
    'Drug Screen Report',
    'Culture Report',
  ])
  reportType!: string;

  @IsString()
  from!: string;

  @IsString()
  to!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;
}
