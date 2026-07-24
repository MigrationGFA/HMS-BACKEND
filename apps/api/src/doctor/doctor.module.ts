import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { DoctorAnalyticsController } from './doctor-analytics.controller';
import { DoctorAnalyticsService } from './doctor-analytics.service';
import { DoctorOverviewController } from './doctor-overview.controller';
import { DoctorOverviewService } from './doctor-overview.service';
import { DoctorResearchController } from './doctor-research.controller';
import { DoctorResearchService } from './doctor-research.service';

@Module({
  imports: [AuditModule],
  controllers: [
    DoctorOverviewController,
    DoctorAnalyticsController,
    DoctorResearchController,
  ],
  providers: [
    DoctorOverviewService,
    DoctorAnalyticsService,
    DoctorResearchService,
  ],
  exports: [
    DoctorOverviewService,
    DoctorAnalyticsService,
    DoctorResearchService,
  ],
})
export class DoctorModule {}
