import { Controller } from '@nestjs/common';
import { FinanceService } from './finance.service';

@Controller('finance/claims')
export class ClaimsController {
  constructor(private readonly financeService: FinanceService) {}
}
