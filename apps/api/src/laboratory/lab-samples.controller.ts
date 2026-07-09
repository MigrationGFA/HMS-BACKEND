import { Controller } from '@nestjs/common';
import { LaboratoryService } from './laboratory.service';

@Controller('laboratory/samples')
export class LabSamplesController {
  constructor(private readonly laboratoryService: LaboratoryService) {}
}
