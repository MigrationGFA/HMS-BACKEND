import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ClinicalPharmacyController } from './clinical-pharmacy.controller';
import { ClinicalPharmacyService } from './clinical-pharmacy.service';

@Module({
  imports: [AuditModule, NotificationsModule],
  controllers: [ClinicalPharmacyController],
  providers: [ClinicalPharmacyService],
  exports: [ClinicalPharmacyService],
})
export class ClinicalPharmacyModule {}
