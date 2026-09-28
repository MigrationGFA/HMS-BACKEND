import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { ScmController } from './scm.controller';
import { ScmService } from './scm.service';

@Module({
  imports: [AuditModule],
  controllers: [ScmController],
  providers: [ScmService],
})
export class ScmModule {}
