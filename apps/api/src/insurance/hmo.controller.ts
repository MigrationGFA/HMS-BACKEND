import { Controller } from '@nestjs/common';
import { InsuranceService } from './insurance.service';

@Controller('insurance/hmo')
export class HmoController {
  constructor(private readonly insuranceService: InsuranceService) {}
}
