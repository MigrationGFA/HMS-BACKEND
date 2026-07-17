import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { PharmacyController } from './pharmacy.controller';
import { DispensingController } from './dispensing.controller';
import { PharmacyInventoryController } from './pharmacy-inventory.controller';
import { SuppliersController } from './suppliers.controller';
import { DrugsController } from './drugs.controller';
import { PharmacyProcurementController } from './procurement.controller';
import { WalkInSalesController } from './walk-in-sales.controller';
import { PharmacyService } from './pharmacy.service';
import { SuppliersService } from './suppliers.service';
import { DrugsService } from './drugs.service';
import { ProcurementService } from './procurement.service';
import { WalkInSalesService } from './walk-in-sales.service';

@Module({
  imports: [AuditModule],
  controllers: [
    PharmacyController,
    DispensingController,
    PharmacyInventoryController,
    SuppliersController,
    DrugsController,
    PharmacyProcurementController,
    WalkInSalesController,
  ],
  providers: [
    PharmacyService,
    SuppliersService,
    DrugsService,
    ProcurementService,
    WalkInSalesService,
  ],
  exports: [
    PharmacyService,
    SuppliersService,
    DrugsService,
    ProcurementService,
    WalkInSalesService,
  ],
})
export class PharmacyModule {}
