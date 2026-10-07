import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { HeipTemplatesController } from './heip-templates.controller';
import { HeipMeController } from './heip-me.controller';
import { HeipTeamController } from './heip-team.controller';
import { HeipExecutiveController } from './heip-executive.controller';
import { HeipTemplatesService } from './heip-templates.service';
import { HeipMeService } from './heip-me.service';
import { HeipTeamService } from './heip-team.service';
import { HeipExecutiveService } from './heip-executive.service';
import { HeipAutofillService } from './heip-autofill.service';
import { HeipDeadlineService } from './heip-deadline.service';

@Module({
  imports: [AuditModule, NotificationsModule],
  controllers: [
    HeipTemplatesController,
    HeipMeController,
    HeipTeamController,
    HeipExecutiveController,
  ],
  providers: [
    HeipTemplatesService,
    HeipMeService,
    HeipTeamService,
    HeipExecutiveService,
    HeipAutofillService,
    HeipDeadlineService,
  ],
  exports: [
    HeipTemplatesService,
    HeipMeService,
    HeipDeadlineService,
  ],
})
export class HeipModule {}
