import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { FleetController } from './fleet.controller';
import { FleetService } from './fleet.service';

@Module({
  imports: [AuditModule],
  controllers: [FleetController],
  providers: [FleetService],
})
export class FleetModule {}
