import { Module } from '@nestjs/common';
import { AdmissionsController } from './admissions.controller';
import { WardsController } from './wards.controller';
import { BedsController } from './beds.controller';
import { AdmissionsService } from './admissions.service';

@Module({
  imports: [],
  controllers: [AdmissionsController, WardsController, BedsController],
  providers: [AdmissionsService],
  exports: [AdmissionsService],
})
export class AdmissionsModule {}
