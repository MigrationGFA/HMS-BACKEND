import { Module, forwardRef } from '@nestjs/common';
import { PatientsModule } from '../patients/patients.module';
import { AuditModule } from '../audit/audit.module';
import { BillingModule } from '../billing/billing.module';
import { TriageModule } from '../triage/triage.module';
import { AppointmentsModule } from '../appointments/appointments.module';
import { RecordsController } from './records.controller';
import { RecordsOpsController } from './records-ops.controller';
import { RecordsBookingsController } from './records-bookings.controller';
import { RecordsService } from './records.service';
import { RecordsOpsService } from './records-ops.service';

@Module({
  imports: [
    PatientsModule,
    AuditModule,
    TriageModule,
    BillingModule,
    forwardRef(() => AppointmentsModule),
  ],
  controllers: [RecordsController, RecordsOpsController, RecordsBookingsController],
  providers: [RecordsService, RecordsOpsService],
  exports: [RecordsService, RecordsOpsService],
})
export class RecordsModule {}
