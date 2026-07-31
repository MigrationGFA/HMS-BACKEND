import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { BillingController } from './billing.controller';
import { InvoicesController } from './invoices.controller';
import { PublicServiceCatalogController } from './public-service-catalog.controller';
import { ServicePricingController } from './service-pricing.controller';
import { BillingService } from './billing.service';
import { ServiceCatalogService } from './service-catalog.service';

@Module({
  imports: [AuditModule],
  // PublicServiceCatalogController first so `services/bookable` wins over `services/:id`
  controllers: [
    PublicServiceCatalogController,
    BillingController,
    InvoicesController,
    ServicePricingController,
  ],
  providers: [BillingService, ServiceCatalogService],
  exports: [BillingService, ServiceCatalogService],
})
export class BillingModule {}
