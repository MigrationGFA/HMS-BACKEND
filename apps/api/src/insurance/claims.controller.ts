import { Controller } from '@nestjs/common';
import { InsuranceService } from './insurance.service';

@Controller('insurance/claims')
export class ClaimsController {
  constructor(private readonly insuranceService: InsuranceService) {}
}
