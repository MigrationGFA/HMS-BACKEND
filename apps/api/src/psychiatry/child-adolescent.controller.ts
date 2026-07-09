import { Controller } from '@nestjs/common';
import { PsychiatryService } from './psychiatry.service';

@Controller('psychiatry/child-adolescent')
export class ChildAdolescentController {
  constructor(private readonly psychiatryService: PsychiatryService) {}
}
