import { Module } from '@nestjs/common';
import { NhiaController } from './nhia.controller';
import { HmoController } from './hmo.controller';
import { ClaimsController } from './claims.controller';
import { InsuranceService } from './insurance.service';

@Module({
  imports: [],
  controllers: [NhiaController, HmoController, ClaimsController],
  providers: [InsuranceService],
  exports: [InsuranceService],
})
export class InsuranceModule {}
