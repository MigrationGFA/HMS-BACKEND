import { Controller } from '@nestjs/common';
import { PsychiatryService } from './psychiatry.service';

@Controller('psychiatry/opc')
export class PsychiatricOpcController {
  constructor(private readonly psychiatryService: PsychiatryService) {}
}
