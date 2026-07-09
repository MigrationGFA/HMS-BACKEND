import { Controller } from '@nestjs/common';
import { PsychiatryService } from './psychiatry.service';

@Controller('psychiatry/addiction-rehab')
export class AddictionRehabController {
  constructor(private readonly psychiatryService: PsychiatryService) {}
}
