import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { KitchenController } from './kitchen.controller';
import { KitchenService } from './kitchen.service';

@Module({
  imports: [AuditModule],
  controllers: [KitchenController],
  providers: [KitchenService],
})
export class KitchenModule {}
