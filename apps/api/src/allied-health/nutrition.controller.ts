import { Controller } from '@nestjs/common';
import { AlliedHealthService } from './allied-health.service';

@Controller('allied-health/nutrition')
export class NutritionController {
  constructor(private readonly alliedHealthService: AlliedHealthService) {}
}
