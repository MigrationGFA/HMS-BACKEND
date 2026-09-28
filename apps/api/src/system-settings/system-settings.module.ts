import { Module } from '@nestjs/common';
import { DepartmentsController } from './departments.controller';
import { BranchesController } from './branches.controller';
import { ServiceTypesController } from './service-types.controller';
import { WorkflowSettingsController } from './workflow-settings.controller';
import { PhaseModulesController } from './phase-modules.controller';
import { SystemSettingsService } from './system-settings.service';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuditModule],
  controllers: [
    DepartmentsController,
    BranchesController,
    ServiceTypesController,
    WorkflowSettingsController,
    PhaseModulesController,
  ],
  providers: [SystemSettingsService],
  exports: [SystemSettingsService],
})
export class SystemSettingsModule {}
