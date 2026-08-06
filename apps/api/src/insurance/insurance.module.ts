import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { NhiaController } from './nhia.controller';
import { HmoController } from './hmo.controller';
import { ClaimsController } from './claims.controller';
import { InsuranceService } from './insurance.service';
import { HmoBrokerService } from './broker/hmo-broker.service';
import { MockHmoAdapter } from './broker/adapters/mock.adapter';
import { CurablyAggregatorAdapter } from './broker/adapters/curably.adapter';
import {
  AiicoAdapter,
  AxaMansardAdapter,
  HygeiaAdapter,
  RelianceAdapter,
  ThtAdapter,
} from './broker/adapters/direct.adapters';
import { HmoClaimPollProcessor } from './jobs/hmo-claim-poll.processor';

@Module({
  imports: [AuditModule],
  controllers: [NhiaController, HmoController, ClaimsController],
  providers: [
    InsuranceService,
    HmoBrokerService,
    MockHmoAdapter,
    CurablyAggregatorAdapter,
    HygeiaAdapter,
    AxaMansardAdapter,
    RelianceAdapter,
    ThtAdapter,
    AiicoAdapter,
    HmoClaimPollProcessor,
  ],
  exports: [InsuranceService, HmoBrokerService],
})
export class InsuranceModule {}
