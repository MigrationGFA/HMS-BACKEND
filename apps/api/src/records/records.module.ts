import { Module } from '@nestjs/common';
import { PatientsModule } from '../patients/patients.module';
import { AuditModule } from '../audit/audit.module';
import { TriageModule } from '../triage/triage.module';
import { RecordsController } from './records.controller';
import { RecordsOpsController } from './records-ops.controller';
import { RecordsService } from './records.service';
import { RecordsOpsService } from './records-ops.service';

@Module({
  imports: [PatientsModule, AuditModule, TriageModule],
  controllers: [RecordsController, RecordsOpsController],
  providers: [RecordsService, RecordsOpsService],
  exports: [RecordsService, RecordsOpsService],
})
export class RecordsModule {}
