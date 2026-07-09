import { Controller } from '@nestjs/common';
import { LaboratoryService } from './laboratory.service';

@Controller('laboratory/results')
export class LabResultsController {
  constructor(private readonly laboratoryService: LaboratoryService) {}
}
