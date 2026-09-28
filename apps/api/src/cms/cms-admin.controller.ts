import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { PERMISSIONS } from '../common/constants';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/types/auth-user.type';
import { CmsService } from './cms.service';
import {
  PublishPageDto,
  UpdateSitePageDto,
  UpsertSitePageDto,
  UpsertSiteSectionDto,
} from './dto/cms.dto';

@Controller('cms')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CmsAdminController {
  constructor(private readonly cms: CmsService) {}

  @Get('pages')
  @RequirePermissions(PERMISSIONS.CMS_READ)
  async listPages() {
    const data = await this.cms.listPages();
    return { data };
  }

  @Get('pages/:pageId')
  @RequirePermissions(PERMISSIONS.CMS_READ)
  async getPage(@Param('pageId', ParseIntPipe) pageId: number) {
    const data = await this.cms.getPageById(pageId);
    return { data };
  }

  @Post('pages')
  @RequirePermissions(PERMISSIONS.CMS_UPDATE)
  async upsertPage(@Body() dto: UpsertSitePageDto, @CurrentUser() user: AuthUser) {
    const data = await this.cms.upsertPage(dto, user);
    return { data };
  }

  @Patch('pages/:pageId')
  @RequirePermissions(PERMISSIONS.CMS_UPDATE)
  async updatePage(
    @Param('pageId', ParseIntPipe) pageId: number,
    @Body() dto: UpdateSitePageDto,
    @CurrentUser() user: AuthUser,
  ) {
    const data = await this.cms.updatePage(pageId, dto, user);
    return { data };
  }

  @Post('pages/:pageId/publish')
  @RequirePermissions(PERMISSIONS.CMS_UPDATE)
  async publish(
    @Param('pageId', ParseIntPipe) pageId: number,
    @Body() dto: PublishPageDto,
    @CurrentUser() user: AuthUser,
  ) {
    const data = await this.cms.setPublish(pageId, dto.publish !== false, user);
    return { data };
  }

  @Post('pages/:pageId/sections')
  @RequirePermissions(PERMISSIONS.CMS_UPDATE)
  async upsertSection(
    @Param('pageId', ParseIntPipe) pageId: number,
    @Body() dto: UpsertSiteSectionDto,
    @CurrentUser() user: AuthUser,
  ) {
    const data = await this.cms.upsertSection(pageId, dto, user);
    return { data };
  }

  @Get('media')
  @RequirePermissions(PERMISSIONS.CMS_READ)
  async listMedia() {
    const data = await this.cms.listMedia();
    return { data };
  }

  @Post('media')
  @RequirePermissions(PERMISSIONS.CMS_UPDATE)
  @UseInterceptors(FileInterceptor('file'))
  async uploadMedia(
    @UploadedFile() file: Express.Multer.File,
    @Body('altText') altText: string | undefined,
    @CurrentUser() user: AuthUser,
  ) {
    const data = await this.cms.uploadMedia(file, altText, user);
    return { data };
  }
}
