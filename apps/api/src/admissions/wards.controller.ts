import { Controller } from '@nestjs/common';
import { AdmissionsService } from './admissions.service';

@Controller('admissions/wards')
export class WardsController {
  constructor(private readonly admissionsService: AdmissionsService) {}
}
