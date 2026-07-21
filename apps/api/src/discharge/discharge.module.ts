import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AdmissionsModule } from '../admissions/admissions.module';
import { NotificationsModule } from '../notifications/notifications.module';
import {
  DischargeController,
  DischargeLegacyController,
} from './discharge.controller';
import { DischargeService } from './discharge.service';

@Module({
  imports: [AuditModule, AdmissionsModule, NotificationsModule],
  controllers: [DischargeController, DischargeLegacyController],
  providers: [DischargeService],
  exports: [DischargeService],
})
export class DischargeModule {}
