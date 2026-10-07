import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { PERMISSIONS } from '../common/constants';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/types/auth-user.type';
import { HeipExecutiveService } from './heip-executive.service';
import {
  HeipAckRedFlagDto,
  HeipDateQueryDto,
  HeipMetricsQueryDto,
  HeipRedFlagsQueryDto,
  HeipRunDeadlinesDto,
} from './dto/heip.dto';

@Controller('heip/executive')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class HeipExecutiveController {
  constructor(private readonly executive: HeipExecutiveService) {}

  @Get('overview')
  @RequirePermissions(PERMISSIONS.HEIP_EXECUTIVE_READ)
  async overview(@Query() query: HeipDateQueryDto) {
    return { data: await this.executive.overview(query.date) };
  }

  @Get('metrics')
  @RequirePermissions(PERMISSIONS.HEIP_EXECUTIVE_READ)
  async metrics(@Query() query: HeipMetricsQueryDto) {
    return {
      data: await this.executive.metrics({
        from: query.from,
        to: query.to,
        metricKey: query.metricKey,
        departmentId: query.departmentId,
      }),
    };
  }

  @Get('departments/:departmentId')
  @RequirePermissions(PERMISSIONS.HEIP_EXECUTIVE_READ)
  async department(
    @Param('departmentId', ParseIntPipe) departmentId: number,
    @Query() query: HeipDateQueryDto,
  ) {
    return {
      data: await this.executive.departmentDrillDown(
        departmentId,
        query.date,
      ),
    };
  }

  @Get('reports/:id')
  @RequirePermissions(PERMISSIONS.HEIP_EXECUTIVE_READ)
  async report(@Param('id', ParseIntPipe) id: number) {
    return { data: await this.executive.getReport(id) };
  }

  @Get('red-flags')
  @RequirePermissions(PERMISSIONS.HEIP_EXECUTIVE_READ)
  async redFlags(@Query() query: HeipRedFlagsQueryDto) {
    const acked =
      query.acked === 'true'
        ? true
        : query.acked === 'false'
          ? false
          : undefined;
    return { data: await this.executive.listRedFlags(acked) };
  }

  @Post('red-flags/:id/ack')
  @RequirePermissions(PERMISSIONS.HEIP_REDFLAG_ACK)
  async ack(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: HeipAckRedFlagDto,
    @CurrentUser() user: AuthUser,
  ) {
    return { data: await this.executive.ackRedFlag(id, dto, user) };
  }

  @Get('compliance')
  @RequirePermissions(PERMISSIONS.HEIP_EXECUTIVE_READ)
  async compliance(@Query() query: HeipDateQueryDto) {
    return { data: await this.executive.compliance(query.date) };
  }

  @Post('run-deadlines')
  @RequirePermissions(PERMISSIONS.HEIP_EXECUTIVE_READ)
  async runDeadlines(
    @Body() dto: HeipRunDeadlinesDto,
    @CurrentUser() user: AuthUser,
  ) {
    return { data: await this.executive.runDeadlines(dto.date, user) };
  }
}
