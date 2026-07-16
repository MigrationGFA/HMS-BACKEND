import { Module } from '@nestjs/common';
<<<<<<< HEAD
import { NursingModule } from '../nursing/nursing.module';
=======
import { AuditModule } from '../audit/audit.module';
>>>>>>> 6f243d98c7656163b07dfc15a488a1f9f189119a
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
<<<<<<< HEAD
  imports: [NursingModule],
=======
  imports: [AuditModule],
>>>>>>> 6f243d98c7656163b07dfc15a488a1f9f189119a
  controllers: [
    PharmacyController,
    DispensingController,
    PharmacyInventoryController,
<<<<<<< HEAD
  ],
  providers: [PharmacyService],
  exports: [PharmacyService],
=======
    SuppliersController,
    DrugsController,
    PharmacyProcurementController,
  ],
  providers: [PharmacyService, SuppliersService, DrugsService, ProcurementService],
  exports: [PharmacyService, SuppliersService, DrugsService, ProcurementService],
>>>>>>> 6f243d98c7656163b07dfc15a488a1f9f189119a
})
export class PharmacyModule {}
