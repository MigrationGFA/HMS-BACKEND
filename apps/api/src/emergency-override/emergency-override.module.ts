import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { EmergencyOverrideController } from './emergency-override.controller';
import { EmergencyOverrideService } from './emergency-override.service';

@Module({
  imports: [AuditModule],
  controllers: [EmergencyOverrideController],
  providers: [EmergencyOverrideService],
  exports: [EmergencyOverrideService],
})
export class EmergencyOverrideModule {}
