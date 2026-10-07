import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { PERMISSIONS } from '../common/constants';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/types/auth-user.type';
import { HeipTeamService } from './heip-team.service';
import {
  HeipDateQueryDto,
  HeipReturnDto,
  HeipTeamSummaryDto,
} from './dto/heip.dto';

@Controller('heip/team')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class HeipTeamController {
  constructor(private readonly team: HeipTeamService) {}

  @Get('queue')
  @RequirePermissions(PERMISSIONS.HEIP_REPORT_SUBMIT)
  async queue(
    @Query() query: HeipDateQueryDto,
    @CurrentUser() user: AuthUser,
  ) {
    return { data: await this.team.queue(user, query.date) };
  }

  @Post('reports/:id/approve')
  @RequirePermissions(PERMISSIONS.HEIP_REPORT_SUBMIT)
  async approve(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
  ) {
    return { data: await this.team.approve(id, user) };
  }

  @Post('reports/:id/return')
  @RequirePermissions(PERMISSIONS.HEIP_REPORT_SUBMIT)
  async returnReport(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: HeipReturnDto,
    @CurrentUser() user: AuthUser,
  ) {
    return { data: await this.team.returnReport(id, dto, user) };
  }

  @Put('summary')
  @RequirePermissions(PERMISSIONS.HEIP_REPORT_SUBMIT)
  async summary(
    @Body() dto: HeipTeamSummaryDto,
    @CurrentUser() user: AuthUser,
  ) {
    return { data: await this.team.upsertSummary(dto, user) };
  }
}
