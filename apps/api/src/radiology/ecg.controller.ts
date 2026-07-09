import { Controller } from '@nestjs/common';
import { RadiologyService } from './radiology.service';

@Controller('radiology/ecg')
export class EcgController {
  constructor(private readonly radiologyService: RadiologyService) {}
}
