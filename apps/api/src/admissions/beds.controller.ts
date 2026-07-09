import { Controller } from '@nestjs/common';
import { AdmissionsService } from './admissions.service';

@Controller('admissions/beds')
export class BedsController {
  constructor(private readonly admissionsService: AdmissionsService) {}
}
