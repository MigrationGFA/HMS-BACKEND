import { Module } from '@nestjs/common';
import { NursingModule } from '../nursing/nursing.module';
import { AuditModule } from '../audit/audit.module';
import { PharmacyController } from './pharmacy.controller';
import { DispensingController } from './dispensing.controller';
import { PharmacyInventoryController } from './pharmacy-inventory.controller';
import { SuppliersController } from './suppliers.controller';
import { DrugsController } from './drugs.controller';
import { PharmacyProcurementController } from './procurement.controller';
import { PharmacyService } from './pharmacy.service';
import { SuppliersService } from './suppliers.service';
import { DrugsService } from './drugs.service';
import { ProcurementService } from './procurement.service';

@Module({
  imports: [NursingModule, AuditModule],
  controllers: [
    PharmacyController,
    DispensingController,
    PharmacyInventoryController,
    SuppliersController,
    DrugsController,
    PharmacyProcurementController,
  ],
  providers: [PharmacyService, SuppliersService, DrugsService, ProcurementService],
  exports: [PharmacyService, DrugsService],
})
export class PharmacyModule {}
