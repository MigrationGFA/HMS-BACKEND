import { Controller } from '@nestjs/common';
import { CashierService } from './cashier.service';

@Controller('cashier')
export class CashierController {
  constructor(private readonly cashierService: CashierService) {}
}
