import { Controller } from '@nestjs/common';
import { LaboratoryService } from './laboratory.service';

@Controller('laboratory/requests')
export class LabRequestsController {
  constructor(private readonly laboratoryService: LaboratoryService) {}
}
