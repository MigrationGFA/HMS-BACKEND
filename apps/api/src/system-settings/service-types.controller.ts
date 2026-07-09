import { Controller } from '@nestjs/common';
import { SystemSettingsService } from './system-settings.service';

@Controller('system-settings/service-types')
export class ServiceTypesController {
  constructor(private readonly systemSettingsService: SystemSettingsService) {}
}
