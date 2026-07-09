import { Module } from '@nestjs/common';
import { FinanceController } from './finance.controller';
import { RevenueController } from './revenue.controller';
import { ClaimsController } from './claims.controller';
import { FinanceService } from './finance.service';

@Module({
  imports: [],
  controllers: [FinanceController, RevenueController, ClaimsController],
  providers: [FinanceService],
  exports: [FinanceService],
})
export class FinanceModule {}
