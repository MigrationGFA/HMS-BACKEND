import { Module } from '@nestjs/common';
import { BillingController } from './billing.controller';
import { InvoicesController } from './invoices.controller';
import { ServicePricingController } from './service-pricing.controller';
import { BillingService } from './billing.service';

@Module({
  imports: [],
  controllers: [BillingController, InvoicesController, ServicePricingController],
  providers: [BillingService],
  exports: [BillingService],
})
export class BillingModule {}
