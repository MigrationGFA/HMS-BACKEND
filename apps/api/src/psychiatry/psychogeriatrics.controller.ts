import { Controller } from '@nestjs/common';
import { PsychiatryService } from './psychiatry.service';

@Controller('psychiatry/psychogeriatrics')
export class PsychogeriatricsController {
  constructor(private readonly psychiatryService: PsychiatryService) {}
}
