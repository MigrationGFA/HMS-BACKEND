import { IsObject, IsOptional } from 'class-validator';

export class PatchPhaseModulesDto {
  /** Partial map of moduleId → released | existing_hidden | future */
  @IsObject()
  modules!: Record<string, string>;

  @IsOptional()
  note?: string;
}
