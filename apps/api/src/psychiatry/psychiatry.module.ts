import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { PrismaModule } from '../prisma/prisma.module';
import { PsychiatricOpcController } from './psychiatric-opc.controller';
import { PsychologyController } from './psychology.controller';
import { ChildAdolescentController } from './child-adolescent.controller';
import { AddictionRehabController } from './addiction-rehab.controller';
import { PsychogeriatricsController } from './psychogeriatrics.controller';
import { PsychiatryService } from './psychiatry.service';

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [
    PsychiatricOpcController,
    PsychologyController,
    ChildAdolescentController,
    AddictionRehabController,
    PsychogeriatricsController,
  ],
  providers: [PsychiatryService],
  exports: [PsychiatryService],
})
export class PsychiatryModule {}
