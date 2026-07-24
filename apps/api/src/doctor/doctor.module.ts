import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { DoctorAnalyticsController } from './doctor-analytics.controller';
import { DoctorAnalyticsService } from './doctor-analytics.service';
import { DoctorResearchController } from './doctor-research.controller';
import { DoctorResearchService } from './doctor-research.service';

@Module({
  imports: [AuditModule],
  controllers: [DoctorAnalyticsController, DoctorResearchController],
  providers: [DoctorAnalyticsService, DoctorResearchService],
  exports: [DoctorAnalyticsService, DoctorResearchService],
})
export class DoctorModule {}
