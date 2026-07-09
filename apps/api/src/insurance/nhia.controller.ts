import { Controller } from '@nestjs/common';
import { InsuranceService } from './insurance.service';

@Controller('insurance/nhia')
export class NhiaController {
  constructor(private readonly insuranceService: InsuranceService) {}
}
