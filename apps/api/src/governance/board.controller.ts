import { Controller } from '@nestjs/common';
import { GovernanceService } from './governance.service';

@Controller('governance/board')
export class BoardController {
  constructor(private readonly governanceService: GovernanceService) {}
}
