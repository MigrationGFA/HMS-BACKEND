import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { PatientsController } from './patients.controller';
import { PatientsService } from './patients.service';
import { CardsController } from './cards.controller';
import { CardsService } from './cards.service';

@Module({
  imports: [AuditModule],
  controllers: [PatientsController, CardsController],
  providers: [PatientsService, CardsService],
  exports: [PatientsService, CardsService],
})
export class PatientsModule {}
