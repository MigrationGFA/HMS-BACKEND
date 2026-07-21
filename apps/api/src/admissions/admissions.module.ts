import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AdmissionsController } from './admissions.controller';
import { AdmissionRequestsController } from './admission-requests.controller';
import { AdmissionBillsController } from './admission-bills.controller';
import { AdmissionsService } from './admissions.service';
import { AdmissionRequestsService } from './admission-requests.service';
import { AdmissionBillsService } from './admission-bills.service';

@Module({
  imports: [AuditModule],
  controllers: [
    AdmissionsController,
    AdmissionRequestsController,
    AdmissionBillsController,
  ],
  providers: [AdmissionsService, AdmissionRequestsService, AdmissionBillsService],
  exports: [AdmissionsService, AdmissionRequestsService, AdmissionBillsService],
})
export class AdmissionsModule {}
