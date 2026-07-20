import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { ClinicalModule } from '../clinical/clinical.module';
import { PharmacyController } from './pharmacy.controller';
import { DispensingController } from './dispensing.controller';
import { PharmacyInventoryController } from './pharmacy-inventory.controller';
import { SuppliersController } from './suppliers.controller';
import { DrugsController } from './drugs.controller';
import { PharmacyProcurementController } from './procurement.controller';
import { WalkInSalesController } from './walk-in-sales.controller';
import { PharmacyBillingController } from './pharmacy-billing.controller';
import { PharmacyReturnsController } from './pharmacy-returns.controller';
import { PharmacySettingsController } from './pharmacy-settings.controller';
import { PharmacyService } from './pharmacy.service';
import { SuppliersService } from './suppliers.service';
import { DrugsService } from './drugs.service';
import { ProcurementService } from './procurement.service';
import { WalkInSalesService } from './walk-in-sales.service';
import { PharmacyBillingService } from './pharmacy-billing.service';
import { PharmacyReturnsService } from './pharmacy-returns.service';
import { PharmacySettingsService } from './pharmacy-settings.service';

@Module({
  imports: [AuditModule, ClinicalModule],
  controllers: [
    PharmacyController,
    DispensingController,
    PharmacyInventoryController,
    SuppliersController,
    DrugsController,
    PharmacyProcurementController,
    WalkInSalesController,
    PharmacyBillingController,
    PharmacyReturnsController,
    PharmacySettingsController,
  ],
  providers: [
    PharmacyService,
    SuppliersService,
    DrugsService,
    ProcurementService,
    WalkInSalesService,
    PharmacyBillingService,
    PharmacyReturnsService,
    PharmacySettingsService,
  ],
  exports: [
    PharmacyService,
    SuppliersService,
    DrugsService,
    ProcurementService,
    WalkInSalesService,
    PharmacyBillingService,
    PharmacyReturnsService,
    PharmacySettingsService,
  ],
})
export class PharmacyModule {}
