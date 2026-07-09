import { Module } from '@nestjs/common';
import { DepartmentsController } from './departments.controller';
import { BranchesController } from './branches.controller';
import { ServiceTypesController } from './service-types.controller';
import { WorkflowSettingsController } from './workflow-settings.controller';
import { SystemSettingsService } from './system-settings.service';

@Module({
  imports: [],
  controllers: [DepartmentsController, BranchesController, ServiceTypesController, WorkflowSettingsController],
  providers: [SystemSettingsService],
  exports: [SystemSettingsService],
})
export class SystemSettingsModule {}
