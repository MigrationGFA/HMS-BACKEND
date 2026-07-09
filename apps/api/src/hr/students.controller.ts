import { Controller } from '@nestjs/common';
import { HrService } from './hr.service';

@Controller('hr/students')
export class StudentsController {
  constructor(private readonly hrService: HrService) {}
}
