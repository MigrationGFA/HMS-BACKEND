import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { BloodBankController } from './blood-bank.controller';
import { BloodBankService } from './blood-bank.service';
import { LabHistoryController } from './lab-history.controller';
import { LabRequestsController } from './lab-requests.controller';
import { LabResultsController } from './lab-results.controller';
import { LabSamplesController } from './lab-samples.controller';
import { LabTemplatesController } from './lab-templates.controller';
import { LabTestsController } from './lab-tests.controller';
import { LaboratoryService } from './laboratory.service';

@Module({
  imports: [AuditModule],
  controllers: [
    LabTestsController,
    LabRequestsController,
    LabResultsController,
    LabSamplesController,
    LabTemplatesController,
    LabHistoryController,
    BloodBankController,
  ],
  providers: [LaboratoryService, BloodBankService],
  exports: [LaboratoryService, BloodBankService],
})
export class LaboratoryModule {}
