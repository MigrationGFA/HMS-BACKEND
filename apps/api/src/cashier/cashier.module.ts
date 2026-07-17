import { Module } from '@nestjs/common';
import { PatientsModule } from '../patients/patients.module';
import { PharmacyModule } from '../pharmacy/pharmacy.module';
import { CashierController } from './cashier.controller';
import { PaymentsController } from './payments.controller';
import { CashierService } from './cashier.service';

@Module({
  imports: [PatientsModule, PharmacyModule],
  controllers: [CashierController, PaymentsController],
  providers: [CashierService],
  exports: [CashierService],
})
export class CashierModule {}
