import { Controller } from '@nestjs/common';
import { CashierService } from './cashier.service';

@Controller('cashier/payments')
export class PaymentsController {
  constructor(private readonly cashierService: CashierService) {}
}
