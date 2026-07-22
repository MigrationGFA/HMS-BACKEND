import { Module } from '@nestjs/common';
import { DoctorAnalyticsController } from './doctor-analytics.controller';
import { DoctorAnalyticsService } from './doctor-analytics.service';

@Module({
  controllers: [DoctorAnalyticsController],
  providers: [DoctorAnalyticsService],
  exports: [DoctorAnalyticsService],
})
export class DoctorModule {}
