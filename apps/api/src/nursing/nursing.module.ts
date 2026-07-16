import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { TriageModule } from '../triage/triage.module';
import { PatientsModule } from '../patients/patients.module';
import { NursingController } from './nursing.controller';
import { NursingCareController } from './nursing-care.controller';
import { NursingOpsController } from './nursing-ops.controller';
import { NursingService } from './nursing.service';
import { NursingCareService } from './nursing-care.service';
import { NursingOpsService } from './nursing-ops.service';

@Module({
  imports: [AuditModule, TriageModule, PatientsModule],
  controllers: [
    NursingController,
    NursingCareController,
    NursingOpsController,
  ],
  providers: [NursingService, NursingCareService, NursingOpsService],
  exports: [NursingService, NursingCareService, NursingOpsService],
})
export class NursingModule {}
