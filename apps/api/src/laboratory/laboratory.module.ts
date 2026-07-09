import { Module } from '@nestjs/common';
import { LabRequestsController } from './lab-requests.controller';
import { LabResultsController } from './lab-results.controller';
import { LabSamplesController } from './lab-samples.controller';
import { LaboratoryService } from './laboratory.service';

@Module({
  imports: [],
  controllers: [LabRequestsController, LabResultsController, LabSamplesController],
  providers: [LaboratoryService],
  exports: [LaboratoryService],
})
export class LaboratoryModule {}
