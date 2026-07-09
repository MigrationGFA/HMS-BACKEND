import { Controller } from '@nestjs/common';
import { PharmacyService } from './pharmacy.service';

@Controller('pharmacy/inventory')
export class PharmacyInventoryController {
  constructor(private readonly pharmacyService: PharmacyService) {}
}
