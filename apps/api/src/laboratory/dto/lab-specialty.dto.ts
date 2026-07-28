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

export class CreateSfaDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  personId!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  labRequestId?: number;

  @IsOptional() @IsString() @MaxLength(40) volumeMl?: string;
  @IsOptional() @IsString() @MaxLength(80) colour?: string;
  @IsOptional() @IsString() @MaxLength(80) viscosity?: string;
  @IsOptional() @IsString() @MaxLength(40) liquefactionMin?: string;
  @IsOptional() @IsString() @MaxLength(40) ph?: string;
  @IsOptional() @IsString() @MaxLength(40) countMMl?: string;
  @IsOptional() @IsString() @MaxLength(40) motilityPct?: string;
  @IsOptional() @IsString() @MaxLength(40) morphologyPct?: string;
  @IsOptional() @IsString() @MaxLength(40) pusCells?: string;
  @IsOptional() @IsString() @MaxLength(40) rbc?: string;
  @IsOptional() @IsString() @MaxLength(40) epithelial?: string;
  @IsOptional() @IsString() interpretation?: string;
}

export class PatchSfaDto {
  @IsOptional() @IsString() @MaxLength(40) volumeMl?: string;
  @IsOptional() @IsString() @MaxLength(80) colour?: string;
  @IsOptional() @IsString() @MaxLength(80) viscosity?: string;
  @IsOptional() @IsString() @MaxLength(40) liquefactionMin?: string;
  @IsOptional() @IsString() @MaxLength(40) ph?: string;
  @IsOptional() @IsString() @MaxLength(40) countMMl?: string;
  @IsOptional() @IsString() @MaxLength(40) motilityPct?: string;
  @IsOptional() @IsString() @MaxLength(40) morphologyPct?: string;
  @IsOptional() @IsString() @MaxLength(40) pusCells?: string;
  @IsOptional() @IsString() @MaxLength(40) rbc?: string;
  @IsOptional() @IsString() @MaxLength(40) epithelial?: string;
  @IsOptional() @IsString() interpretation?: string;
}

export class RejectSfaDto {
  @IsString()
  @MinLength(2)
  reason!: string;
}

export class CreateSpecimenDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  personId!: number;

  @IsString()
  @MinLength(1)
  @MaxLength(150)
  testLabel!: string;

  @IsOptional() @IsString() @MaxLength(100) collectedBy?: string;
  @IsOptional() @IsString() @MaxLength(150) location?: string;
  @IsOptional() @Type(() => Number) @IsInt() labRequestId?: number;
  @IsOptional() @Type(() => Number) @IsInt() labSampleId?: number;
}

export class TransferSpecimenDto {
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  toLocation!: string;

  @IsOptional() @IsString() @MaxLength(255) reason?: string;
  @IsOptional() @IsString() @MaxLength(100) staffLabel?: string;
}

export class SpecimenStatusDto {
  @IsIn(['Received', 'Rejected', 'Lost', 'Delayed', 'Completed', 'In Transit'])
  status!: string;

  @IsOptional() @IsString() @MaxLength(255) reason?: string;
  @IsOptional() @IsString() @MaxLength(150) location?: string;
}

export class CreateHistopathologyDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  personId!: number;

  @IsIn(['Biopsy', 'Surgical Specimens', 'Cytology', 'Special Stains'])
  specimenType!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  labRequestId?: number;

  @IsOptional() @IsString() @MaxLength(255) site?: string;
  @IsOptional() @IsString() gross?: string;
  @IsOptional() @IsString() micro?: string;
  @IsOptional() @IsString() diagnosis?: string;
  @IsOptional() @IsString() @MaxLength(80) grade?: string;
}

export class PatchHistopathologyDto {
  @IsOptional() @IsString() @MaxLength(255) site?: string;
  @IsOptional() @IsString() gross?: string;
  @IsOptional() @IsString() micro?: string;
  @IsOptional() @IsString() diagnosis?: string;
  @IsOptional() @IsString() @MaxLength(80) grade?: string;
  @IsOptional()
  @IsIn(['Biopsy', 'Surgical Specimens', 'Cytology', 'Special Stains'])
  specimenType?: string;
}

export class AdvanceHistopathologyDto {
  @IsOptional()
  @IsIn(['Received', 'Grossing', 'Microscopy', 'Awaiting Approval', 'Released'])
  stage?: string;
}

export class CreateQcRunDto {
  @IsString() @MinLength(1) @MaxLength(150) analyte!: string;
  @IsString() @MinLength(1) @MaxLength(150) instrument!: string;
  @IsIn(['L1', 'L2', 'L3']) level!: string;
  @IsString() @MinLength(1) @MaxLength(80) expected!: string;
  @IsString() @MinLength(1) @MaxLength(80) observed!: string;
  @IsIn(['Passed', 'Failed']) result!: string;
  @IsIn(['Daily', 'Weekly', 'Monthly', 'Calibration']) freq!: string;
  @IsOptional() @IsString() runDate?: string;
}

export class PatchQcRunDto {
  @IsOptional() @IsString() @MaxLength(150) analyte?: string;
  @IsOptional() @IsString() @MaxLength(150) instrument?: string;
  @IsOptional() @IsIn(['L1', 'L2', 'L3']) level?: string;
  @IsOptional() @IsString() @MaxLength(80) expected?: string;
  @IsOptional() @IsString() @MaxLength(80) observed?: string;
  @IsOptional() @IsIn(['Passed', 'Failed']) result?: string;
  @IsOptional() @IsIn(['Daily', 'Weekly', 'Monthly', 'Calibration']) freq?: string;
  @IsOptional() @IsString() runDate?: string;
}

export class QcCapaDto {
  @IsString() @MinLength(1) corrective!: string;
  @IsString() @MinLength(1) preventive!: string;
  @IsString() @MinLength(1) @MaxLength(100) assignedTo!: string;
  @IsOptional() @IsString() targetDate?: string;
  @IsOptional() @IsIn(['Open', 'Closed']) capaStatus?: string;
}
