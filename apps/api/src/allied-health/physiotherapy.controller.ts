import { Controller } from '@nestjs/common';
import { AlliedHealthService } from './allied-health.service';

@Controller('allied-health/physiotherapy')
export class PhysiotherapyController {
  constructor(private readonly alliedHealthService: AlliedHealthService) {}
}
