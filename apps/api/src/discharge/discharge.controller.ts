import { Controller } from '@nestjs/common';
import { DischargeService } from './discharge.service';

@Controller('discharge')
export class DischargeController {
  constructor(private readonly dischargeService: DischargeService) {}
}
