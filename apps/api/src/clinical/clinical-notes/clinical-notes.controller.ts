import { Controller } from '@nestjs/common';
import { ClinicalNotesService } from './clinical-notes.service';

@Controller('clinical-notes')
export class ClinicalNotesController {
  constructor(private readonly clinicalNotesService: ClinicalNotesService) {}
}
