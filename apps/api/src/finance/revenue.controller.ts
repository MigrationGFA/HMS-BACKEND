import { Controller } from '@nestjs/common';
import { FinanceService } from './finance.service';

@Controller('finance/revenue')
export class RevenueController {
  constructor(private readonly financeService: FinanceService) {}
}
