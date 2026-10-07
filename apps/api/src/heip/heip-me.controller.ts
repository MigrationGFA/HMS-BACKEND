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
import { HeipMeService } from './heip-me.service';
import {
  HeipAmendDto,
  HeipDraftDto,
  HeipSubmitDto,
  HeipTodayQueryDto,
} from './dto/heip.dto';

@Controller('heip/me')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class HeipMeController {
  constructor(private readonly me: HeipMeService) {}

  @Get('today')
  @RequirePermissions(PERMISSIONS.HEIP_REPORT_SUBMIT)
  async today(
    @Query() query: HeipTodayQueryDto,
    @CurrentUser() user: AuthUser,
  ) {
    return { data: await this.me.getToday(user, query.shift) };
  }

  @Post('draft')
  @RequirePermissions(PERMISSIONS.HEIP_REPORT_SUBMIT)
  async draft(@Body() dto: HeipDraftDto, @CurrentUser() user: AuthUser) {
    return { data: await this.me.saveDraft(dto, user) };
  }

  @Post('submit')
  @RequirePermissions(PERMISSIONS.HEIP_REPORT_SUBMIT)
  async submit(@Body() dto: HeipSubmitDto, @CurrentUser() user: AuthUser) {
    return { data: await this.me.submit(dto, user) };
  }

  @Get('history')
  @RequirePermissions(PERMISSIONS.HEIP_REPORT_SUBMIT)
  async history(@CurrentUser() user: AuthUser) {
    return { data: await this.me.listHistory(user) };
  }

  @Get('reports/:id')
  @RequirePermissions(PERMISSIONS.HEIP_REPORT_SUBMIT)
  async getReport(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
  ) {
    return { data: await this.me.getMyReport(id, user) };
  }

  @Post('reports/:id/amend')
  @RequirePermissions(PERMISSIONS.HEIP_REPORT_SUBMIT)
  async amend(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: HeipAmendDto,
    @CurrentUser() user: AuthUser,
  ) {
    return { data: await this.me.amend(id, dto, user) };
  }
}
