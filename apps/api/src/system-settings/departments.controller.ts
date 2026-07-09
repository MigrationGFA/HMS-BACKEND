import { Controller } from '@nestjs/common';
import { SystemSettingsService } from './system-settings.service';

@Controller('system-settings/departments')
export class DepartmentsController {
  constructor(private readonly systemSettingsService: SystemSettingsService) {}
}
