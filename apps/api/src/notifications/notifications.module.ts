import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
// SMS deferred — email-only (Resend) for this release
import { SmsService } from './sms.service';
import { EmailService } from './email.service';

@Module({
  controllers: [NotificationsController],
  // SmsService kept registered as empty stub so inject sites do not break; do not call for delivery
  providers: [NotificationsService, SmsService, EmailService],
  exports: [NotificationsService, SmsService, EmailService],
})
export class NotificationsModule {}
