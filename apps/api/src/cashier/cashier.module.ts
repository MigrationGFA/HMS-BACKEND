import { Module } from '@nestjs/common';
import { PatientsModule } from '../patients/patients.module';
import { CashierController } from './cashier.controller';
import { PaymentsController } from './payments.controller';
import { CashierService } from './cashier.service';

@Module({
  imports: [PatientsModule],
  controllers: [CashierController, PaymentsController],
  providers: [CashierService],
  exports: [CashierService],
})
export class CashierModule {}
