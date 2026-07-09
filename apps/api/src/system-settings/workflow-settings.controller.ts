import { Controller } from '@nestjs/common';
import { SystemSettingsService } from './system-settings.service';

@Controller('system-settings/workflow-settings')
export class WorkflowSettingsController {
  constructor(private readonly systemSettingsService: SystemSettingsService) {}
}
