import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { HrController } from './hr.controller';
import { StaffController } from './staff.controller';
import { StudentsController } from './students.controller';
import { MeHrController } from './me-hr.controller';
import { HrService } from './hr.service';
import { HrSelfService } from './hr-self.service';

@Module({
  imports: [AuditModule, NotificationsModule],
  controllers: [
    HrController,
    StaffController,
    StudentsController,
    MeHrController,
  ],
  providers: [HrSelfService, HrService],
  exports: [HrService, HrSelfService],
})
export class HrModule {}
