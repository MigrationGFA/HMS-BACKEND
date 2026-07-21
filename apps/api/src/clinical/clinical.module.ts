import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { PatientsModule } from '../patients/patients.module';
import { AdmissionsModule } from '../admissions/admissions.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { EncountersController } from './encounters/encounters.controller';
import { DiagnosesController } from './diagnoses/diagnoses.controller';
import { ClinicalNotesController } from './clinical-notes/clinical-notes.controller';
import { PrescriptionsController } from './prescriptions/prescriptions.controller';
import { ReferralsController } from './referrals/referrals.controller';
import { ObservationsController } from './observations/observations.controller';
import { CarePlansController } from './care-plans/care-plans.controller';
import { EncountersService } from './encounters/encounters.service';
import { DiagnosesService } from './diagnoses/diagnoses.service';
import { ClinicalNotesService } from './clinical-notes/clinical-notes.service';
import { PrescriptionsService } from './prescriptions/prescriptions.service';
import { ReferralsService } from './referrals/referrals.service';
import { ObservationsService } from './observations/observations.service';
import { CarePlansService } from './care-plans/care-plans.service';

@Module({
  imports: [AuditModule, PatientsModule, AdmissionsModule, NotificationsModule],
  controllers: [
    EncountersController,
    DiagnosesController,
    ClinicalNotesController,
    PrescriptionsController,
    ReferralsController,
    ObservationsController,
    CarePlansController,
  ],
  providers: [
    EncountersService,
    DiagnosesService,
    ClinicalNotesService,
    PrescriptionsService,
    ReferralsService,
    ObservationsService,
    CarePlansService,
  ],
  exports: [
    EncountersService,
    DiagnosesService,
    ClinicalNotesService,
    PrescriptionsService,
    ReferralsService,
    ObservationsService,
    CarePlansService,
  ],
})
export class ClinicalModule {}
