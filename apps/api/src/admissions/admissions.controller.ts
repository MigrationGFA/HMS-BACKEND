import { Controller } from '@nestjs/common';
import { AdmissionsService } from './admissions.service';

@Controller('admissions')
export class AdmissionsController {
  constructor(private readonly admissionsService: AdmissionsService) {}
}
