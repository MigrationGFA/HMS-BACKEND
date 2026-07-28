import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { RadiologyController } from './radiology.controller';
import { ImagingController } from './imaging.controller';
import { EcgController } from './ecg.controller';
import { ImagingPaymentsController } from './imaging-payments.controller';
import { RadiologyService } from './radiology.service';

@Module({
  imports: [AuditModule],
  controllers: [
    RadiologyController,
    ImagingController,
    EcgController,
    ImagingPaymentsController,
  ],
  providers: [RadiologyService],
  exports: [RadiologyService],
})
export class RadiologyModule {}
