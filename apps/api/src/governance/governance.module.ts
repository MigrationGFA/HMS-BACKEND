import { Module } from '@nestjs/common';
import { BoardController } from './board.controller';
import { CmdController } from './cmd.controller';
import { GovernanceService } from './governance.service';

@Module({
  imports: [],
  controllers: [BoardController, CmdController],
  providers: [GovernanceService],
  exports: [GovernanceService],
})
export class GovernanceModule {}
