import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { PERMISSIONS } from '../common/constants';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/types/auth-user.type';
import { HeipTemplatesService } from './heip-templates.service';
import {
  CreateHeipTemplateDto,
  SaveHeipTemplateVersionDto,
  UpdateHeipTemplateDto,
} from './dto/heip.dto';

@Controller('heip/templates')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class HeipTemplatesController {
  constructor(private readonly templates: HeipTemplatesService) {}

  /** Any submitter — resolve published template for JWT employee. */
  @Get('resolve-mine')
  @RequirePermissions(PERMISSIONS.HEIP_REPORT_SUBMIT)
  async resolveMine(@CurrentUser() user: AuthUser) {
    return { data: await this.templates.resolveMine(user) };
  }

  @Get()
  @RequirePermissions(PERMISSIONS.HEIP_TEMPLATE_MANAGE)
  async list() {
    return { data: await this.templates.listTemplates() };
  }

  @Post()
  @RequirePermissions(PERMISSIONS.HEIP_TEMPLATE_MANAGE)
  async create(
    @Body() dto: CreateHeipTemplateDto,
    @CurrentUser() user: AuthUser,
  ) {
    return { data: await this.templates.createTemplate(dto, user) };
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.HEIP_TEMPLATE_MANAGE)
  async get(@Param('id', ParseIntPipe) id: number) {
    return { data: await this.templates.getTemplate(id) };
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.HEIP_TEMPLATE_MANAGE)
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateHeipTemplateDto,
    @CurrentUser() user: AuthUser,
  ) {
    return { data: await this.templates.updateTemplate(id, dto, user) };
  }

  @Post(':id/versions')
  @RequirePermissions(PERMISSIONS.HEIP_TEMPLATE_MANAGE)
  async saveVersion(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SaveHeipTemplateVersionDto,
    @CurrentUser() user: AuthUser,
  ) {
    return { data: await this.templates.saveDraftVersion(id, dto, user) };
  }

  @Post(':id/publish')
  @RequirePermissions(PERMISSIONS.HEIP_TEMPLATE_MANAGE)
  async publish(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
  ) {
    return { data: await this.templates.publish(id, user) };
  }
}
