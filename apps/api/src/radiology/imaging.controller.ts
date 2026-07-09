import { Controller } from '@nestjs/common';
import { RadiologyService } from './radiology.service';

@Controller('radiology/imaging')
export class ImagingController {
  constructor(private readonly radiologyService: RadiologyService) {}
}
