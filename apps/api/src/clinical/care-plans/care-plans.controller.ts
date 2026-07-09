import { Controller } from '@nestjs/common';
import { CarePlansService } from './care-plans.service';

@Controller('care-plans')
export class CarePlansController {
  constructor(private readonly carePlansService: CarePlansService) {}
}
