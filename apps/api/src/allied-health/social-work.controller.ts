import { Controller } from '@nestjs/common';
import { AlliedHealthService } from './allied-health.service';

@Controller('allied-health/social-work')
export class SocialWorkController {
  constructor(private readonly alliedHealthService: AlliedHealthService) {}
}
