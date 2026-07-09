import { Controller } from '@nestjs/common';
import { DiagnosesService } from './diagnoses.service';

@Controller('diagnoses')
export class DiagnosesController {
  constructor(private readonly diagnosesService: DiagnosesService) {}
}
