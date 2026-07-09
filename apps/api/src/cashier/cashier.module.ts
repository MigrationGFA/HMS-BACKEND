import { Module } from '@nestjs/common';
import { CashierController } from './cashier.controller';
import { PaymentsController } from './payments.controller';
import { CashierService } from './cashier.service';

@Module({
  imports: [],
  controllers: [CashierController, PaymentsController],
  providers: [CashierService],
  exports: [CashierService],
})
export class CashierModule {}
