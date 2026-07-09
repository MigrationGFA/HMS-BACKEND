import { Controller } from '@nestjs/common';
import { PsychiatryService } from './psychiatry.service';

@Controller('psychiatry/psychology')
export class PsychologyController {
  constructor(private readonly psychiatryService: PsychiatryService) {}
}
