import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { BillingModule } from '../billing/billing.module';
import { PatientsModule } from '../patients/patients.module';
import { AppointmentsController } from './appointments.controller';
import { PublicAppointmentsController } from './public-appointments.controller';
import { AppointmentsService } from './appointments.service';

@Module({
  imports: [AuditModule, BillingModule, PatientsModule],
  controllers: [PublicAppointmentsController, AppointmentsController],
  providers: [AppointmentsService],
  exports: [AppointmentsService],
})
export class AppointmentsModule {}
