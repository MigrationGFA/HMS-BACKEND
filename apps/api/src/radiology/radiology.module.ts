import { Module } from '@nestjs/common';
import { RadiologyController } from './radiology.controller';
import { ImagingController } from './imaging.controller';
import { EcgController } from './ecg.controller';
import { RadiologyService } from './radiology.service';

@Module({
  imports: [],
  controllers: [RadiologyController, ImagingController, EcgController],
  providers: [RadiologyService],
  exports: [RadiologyService],
})
export class RadiologyModule {}
