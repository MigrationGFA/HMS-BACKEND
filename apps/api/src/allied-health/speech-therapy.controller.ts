import { Controller } from '@nestjs/common';
import { AlliedHealthService } from './allied-health.service';

@Controller('allied-health/speech-therapy')
export class SpeechTherapyController {
  constructor(private readonly alliedHealthService: AlliedHealthService) {}
}
