import { Controller } from '@nestjs/common';
import { BillingService } from './billing.service';

@Controller('billing/service-pricing')
export class ServicePricingController {
  constructor(private readonly billingService: BillingService) {}
}
