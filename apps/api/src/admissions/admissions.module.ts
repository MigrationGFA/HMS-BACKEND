import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AdmissionsController } from './admissions.controller';
import { WardsController } from './wards.controller';
import { BedsController } from './beds.controller';
import { AdmissionRequestsController } from './admission-requests.controller';
import { AdmissionsService } from './admissions.service';
import { AdmissionRequestsService } from './admission-requests.service';

@Module({
  imports: [AuditModule],
  controllers: [
    AdmissionsController,
    WardsController,
    BedsController,
    AdmissionRequestsController,
  ],
  providers: [AdmissionsService, AdmissionRequestsService],
  exports: [AdmissionsService, AdmissionRequestsService],
})
export class AdmissionsModule {}
