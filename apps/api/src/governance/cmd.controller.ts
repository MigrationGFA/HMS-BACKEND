import { Controller } from '@nestjs/common';
import { GovernanceService } from './governance.service';

@Controller('governance/cmd')
export class CmdController {
  constructor(private readonly governanceService: GovernanceService) {}
}
