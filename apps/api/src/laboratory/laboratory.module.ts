import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { BloodBankController } from './blood-bank.controller';
import { BloodBankService } from './blood-bank.service';
import { LabAnalyticsController } from './lab-analytics.controller';
import { LabCultureController } from './lab-culture.controller';
import { LabDrugScreenController } from './lab-drug-screen.controller';
import { LabExtendedService } from './lab-extended.service';
import { LabHistoryController } from './lab-history.controller';
import { LabMicrobiologyController } from './lab-microbiology.controller';
import { LabOverviewController } from './lab-overview.controller';
import { LabReportsController } from './lab-reports.controller';
import { LabRequestsController } from './lab-requests.controller';
import { LabResultsController } from './lab-results.controller';
import { LabSamplesController } from './lab-samples.controller';
import { LabSfaController } from './lab-sfa.controller';
import { LabSpecimensController } from './lab-specimens.controller';
import { LabSpecialtyService } from './lab-specialty.service';
import { LabTemplatesController } from './lab-templates.controller';
import { LabTestsController } from './lab-tests.controller';
import { LaboratoryService } from './laboratory.service';

@Module({
  imports: [AuditModule],
  controllers: [
    LabOverviewController,
    LabDrugScreenController,
    LabCultureController,
    LabReportsController,
    LabSfaController,
    LabAnalyticsController,
    LabSpecimensController,
    LabMicrobiologyController,
    LabTestsController,
    LabRequestsController,
    LabResultsController,
    LabSamplesController,
    LabTemplatesController,
    LabHistoryController,
    BloodBankController,
  ],
  providers: [LaboratoryService, LabSpecialtyService, LabExtendedService, BloodBankService],
  exports: [LaboratoryService, LabSpecialtyService, LabExtendedService, BloodBankService],
})
export class LaboratoryModule {}
