import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { ClinicalReportsService } from './clinical-reports.service';
import { FinancialReportsService } from './financial-reports.service';
import { OperationalReportsService } from './operational-reports.service';

@Module({
  controllers: [ReportsController],
  providers: [
    ReportsService,
    ClinicalReportsService,
    FinancialReportsService,
    OperationalReportsService,
  ],
  exports: [ReportsService, ClinicalReportsService, FinancialReportsService, OperationalReportsService],
})
export class ReportsModule {}
