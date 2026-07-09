import { Module } from '@nestjs/common';
import { PharmacyController } from './pharmacy.controller';
import { DispensingController } from './dispensing.controller';
import { PharmacyInventoryController } from './pharmacy-inventory.controller';
import { PharmacyService } from './pharmacy.service';

@Module({
  imports: [],
  controllers: [PharmacyController, DispensingController, PharmacyInventoryController],
  providers: [PharmacyService],
  exports: [PharmacyService],
})
export class PharmacyModule {}
