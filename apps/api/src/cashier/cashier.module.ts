import { Module } from '@nestjs/common';
import { PatientsModule } from '../patients/patients.module';
import { PharmacyModule } from '../pharmacy/pharmacy.module';
import { ClinicalModule } from '../clinical/clinical.module';
import { LaboratoryModule } from '../laboratory/laboratory.module';
import { CashierController } from './cashier.controller';
import { PaymentsController } from './payments.controller';
import { CashierService } from './cashier.service';

@Module({
  imports: [PatientsModule, PharmacyModule, ClinicalModule, LaboratoryModule],
  controllers: [CashierController, PaymentsController],
  providers: [CashierService],
  exports: [CashierService],
})
export class CashierModule {}
