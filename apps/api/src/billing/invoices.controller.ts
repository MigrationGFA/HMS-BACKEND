import { Controller } from '@nestjs/common';
import { BillingService } from './billing.service';

@Controller('billing/invoices')
export class InvoicesController {
  constructor(private readonly billingService: BillingService) {}
}
