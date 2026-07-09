import { Controller } from '@nestjs/common';
import { HrService } from './hr.service';

@Controller('hr/staff')
export class StaffController {
  constructor(private readonly hrService: HrService) {}
}
