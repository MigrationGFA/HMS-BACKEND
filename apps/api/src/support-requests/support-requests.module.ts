import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { SupportRequestsController } from './support-requests.controller';
import { SupportRequestsService } from './support-requests.service';

@Module({
  imports: [AuditModule],
  controllers: [SupportRequestsController],
  providers: [SupportRequestsService],
  exports: [SupportRequestsService],
})
export class SupportRequestsModule {}
