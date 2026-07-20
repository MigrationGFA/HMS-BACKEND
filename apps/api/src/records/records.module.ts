import { Module } from '@nestjs/common';
import { PatientsModule } from '../patients/patients.module';
import { AuditModule } from '../audit/audit.module';
import { TriageModule } from '../triage/triage.module';
import { RecordsController } from './records.controller';
import { RecordsService } from './records.service';

@Module({
  imports: [PatientsModule, AuditModule, TriageModule],
  controllers: [RecordsController],
  providers: [RecordsService],
  exports: [RecordsService],
})
export class RecordsModule {}
