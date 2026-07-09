import { Module } from '@nestjs/common';
import { DischargeController } from './discharge.controller';
import { DischargeService } from './discharge.service';

@Module({
  imports: [],
  controllers: [DischargeController],
  providers: [DischargeService],
  exports: [DischargeService],
})
export class DischargeModule {}
