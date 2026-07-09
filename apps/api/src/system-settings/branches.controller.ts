import { Controller } from '@nestjs/common';
import { SystemSettingsService } from './system-settings.service';

@Controller('system-settings/branches')
export class BranchesController {
  constructor(private readonly systemSettingsService: SystemSettingsService) {}
}
