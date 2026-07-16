import { Module } from '@nestjs/common';
import { NursingModule } from '../nursing/nursing.module';
import { PharmacyController } from './pharmacy.controller';
import { DispensingController } from './dispensing.controller';
import { PharmacyInventoryController } from './pharmacy-inventory.controller';
import { PharmacyService } from './pharmacy.service';

@Module({
  imports: [NursingModule],
  controllers: [
    PharmacyController,
    DispensingController,
    PharmacyInventoryController,
  ],
  providers: [PharmacyService],
  exports: [PharmacyService],
})
export class PharmacyModule {}
