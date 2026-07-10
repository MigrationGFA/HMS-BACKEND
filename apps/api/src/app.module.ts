import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { configLoaders } from './config';
import { PrismaModule } from './prisma/prisma.module';

// Foundation
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { RolesModule } from './roles/roles.module';
import { PermissionsModule } from './permissions/permissions.module';
import { AuditModule } from './audit/audit.module';
import { SystemSettingsModule } from './system-settings/system-settings.module';

// Patient & scheduling
import { PatientsModule } from './patients/patients.module';
import { RecordsModule } from './records/records.module';
import { AppointmentsModule } from './appointments/appointments.module';
import { QueuesModule } from './queues/queues.module';

// Clinical & care
import { ClinicalModule } from './clinical/clinical.module';
import { NursingModule } from './nursing/nursing.module';
import { AdmissionsModule } from './admissions/admissions.module';
import { DischargeModule } from './discharge/discharge.module';
import { PsychiatryModule } from './psychiatry/psychiatry.module';
import { AlliedHealthModule } from './allied-health/allied-health.module';
import { IcuModule } from './icu/icu.module';
import { TriageModule } from './triage/triage.module';

// Diagnostics & pharmacy
import { LaboratoryModule } from './laboratory/laboratory.module';
import { RadiologyModule } from './radiology/radiology.module';
import { PharmacyModule } from './pharmacy/pharmacy.module';

// Finance & operations
import { BillingModule } from './billing/billing.module';
import { CashierModule } from './cashier/cashier.module';
import { FinanceModule } from './finance/finance.module';
import { InsuranceModule } from './insurance/insurance.module';
import { InventoryModule } from './inventory/inventory.module';

// Reporting & platform
import { ReportsModule } from './reports/reports.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { NotificationsModule } from './notifications/notifications.module';
import { FilesModule } from './files/files.module';
import { RealtimeModule } from './realtime/realtime.module';

// Governance & administration
import { SuperAdminModule } from './super-admin/super-admin.module';
import { GovernanceModule } from './governance/governance.module';
import { AdministrationModule } from './administration/administration.module';
import { HrModule } from './hr/hr.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: configLoaders,
    }),
    PrismaModule,

    // Foundation
    AuthModule,
    UsersModule,
    RolesModule,
    PermissionsModule,
    AuditModule,
    SystemSettingsModule,

    // Patient & scheduling
    PatientsModule,
    RecordsModule,
    AppointmentsModule,
    QueuesModule,
    TriageModule,

    // Clinical & care
    ClinicalModule,
    NursingModule,
    AdmissionsModule,
    DischargeModule,
    PsychiatryModule,
    AlliedHealthModule,
    IcuModule,

    // Diagnostics & pharmacy
    LaboratoryModule,
    RadiologyModule,
    PharmacyModule,

    // Finance & operations
    BillingModule,
    CashierModule,
    FinanceModule,
    InsuranceModule,
    InventoryModule,

    // Reporting & platform
    ReportsModule,
    AnalyticsModule,
    NotificationsModule,
    FilesModule,
    RealtimeModule,

    // Governance & administration
    SuperAdminModule,
    GovernanceModule,
    AdministrationModule,
    HrModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
