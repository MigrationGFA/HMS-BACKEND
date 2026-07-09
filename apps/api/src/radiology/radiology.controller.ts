import { Controller } from '@nestjs/common';
import { RadiologyService } from './radiology.service';

@Controller('radiology')
export class RadiologyController {
  constructor(private readonly radiologyService: RadiologyService) {}
}
