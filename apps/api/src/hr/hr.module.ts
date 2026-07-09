import { Module } from '@nestjs/common';
import { HrController } from './hr.controller';
import { StaffController } from './staff.controller';
import { StudentsController } from './students.controller';
import { HrService } from './hr.service';

@Module({
  imports: [],
  controllers: [HrController, StaffController, StudentsController],
  providers: [HrService],
  exports: [HrService],
})
export class HrModule {}
