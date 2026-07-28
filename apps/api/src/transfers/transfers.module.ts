import { Module, forwardRef } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AdmissionsModule } from '../admissions/admissions.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { TransfersController } from './transfers.controller';
import { TransfersService } from './transfers.service';

@Module({
  imports: [AuditModule, NotificationsModule, forwardRef(() => AdmissionsModule)],
  controllers: [TransfersController],
  providers: [TransfersService],
  exports: [TransfersService],
})
export class TransfersModule {}
