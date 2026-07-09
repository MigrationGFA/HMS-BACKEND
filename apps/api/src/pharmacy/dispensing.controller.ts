import { Controller } from '@nestjs/common';
import { PharmacyService } from './pharmacy.service';

@Controller('pharmacy/dispensing')
export class DispensingController {
  constructor(private readonly pharmacyService: PharmacyService) {}
}
