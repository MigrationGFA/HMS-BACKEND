import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
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
  ],
  providers: [LaboratoryService],
  exports: [LaboratoryService],
})
export class LaboratoryModule {}
