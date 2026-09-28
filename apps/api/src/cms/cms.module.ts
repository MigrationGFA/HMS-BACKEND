import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { FilesModule } from '../files/files.module';
import { CmsService } from './cms.service';
import { CmsPublicController } from './cms-public.controller';
import { CmsAdminController } from './cms-admin.controller';

@Module({
  imports: [AuditModule, FilesModule],
  controllers: [CmsPublicController, CmsAdminController],
  providers: [CmsService],
  exports: [CmsService],
})
export class CmsModule {}
