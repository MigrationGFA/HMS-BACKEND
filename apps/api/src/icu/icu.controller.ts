import { Controller } from '@nestjs/common';
import { IcuService } from './icu.service';

@Controller('icu')
export class IcuController {
  constructor(private readonly icuService: IcuService) {}
}
