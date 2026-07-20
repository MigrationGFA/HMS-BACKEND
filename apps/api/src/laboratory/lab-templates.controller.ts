import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
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
import { CreateLabTemplateDto, UpdateLabTemplateDto } from './dto/lab.dto';
import { LaboratoryService } from './laboratory.service';

/** Lab result templates (LAB_RESULT_TEMPLATES) — DB-managed field schemas for result entry. */
@Controller('laboratory/templates')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class LabTemplatesController {
  constructor(private readonly laboratoryService: LaboratoryService) {}

  /**
   * Method: GET
   * URL: /api/laboratory/templates?q=&category=&status=&page=&limit=
   * Purpose: List result templates (all statuses by default; filter status=Active for entry pickers)
   * Required permission: lab:read
   * Request body: none
   * Response example: { data: { items: [{ templateId, code: "tpl-fbc", name, category, fields: [...], status }], meta } }
   * Error cases: 401, 403
   */
  @Get()
  @RequirePermissions(PERMISSIONS.LAB_READ)
  async list(
    @Query('q') q?: string,
    @Query('category') category?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const result = await this.laboratoryService.listTemplates({
      q,
      category,
      status,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 100,
    });
    return { data: result };
  }

  /**
   * Method: GET
   * URL: /api/laboratory/templates/:id
   * Purpose: Single template with full field schema
   * Required permission: lab:read
   * Request body: none
   * Response example: { data: { templateId, code, name, category, description, fields, status } }
   * Error cases: 401, 403, 404
   */
  @Get(':id')
  @RequirePermissions(PERMISSIONS.LAB_READ)
  async findOne(@Param('id', ParseIntPipe) id: number) {
    const row = await this.laboratoryService.findTemplateById(id);
    return { data: row };
  }

  /**
   * Method: POST
   * URL: /api/laboratory/templates
   * Purpose: Create a result template (code auto-generated from name when omitted; also used for Duplicate)
   * Required permission: lab:template-manage
   * Request body: { code?, name, category, description?, fields: [{ key, label, type, options?, unit?, ref?, critical?, required? }], status? }
   * Response example: { data: { templateId, code, name, fields, status: "Active" } }
   * Error cases: 400 duplicate code / duplicate field keys, 401, 403
   * Audit: lab:template-create
   */
  @Post()
  @RequirePermissions(PERMISSIONS.LAB_TEMPLATE_MANAGE)
  async create(
    @Body() dto: CreateLabTemplateDto,
    @CurrentUser() user: AuthUser,
  ) {
    const row = await this.laboratoryService.createTemplate(dto, user);
    return { data: row };
  }

  /**
   * Method: PATCH
   * URL: /api/laboratory/templates/:id
   * Purpose: Update name/category/description/fields or deactivate (status: "Inactive" — soft delete, never hard-delete)
   * Required permission: lab:template-manage
   * Request body: { name?, category?, description?, fields?, status? }
   * Response example: { data: { templateId, name, fields, status } }
   * Error cases: 400 duplicate field keys, 401, 403, 404
   * Audit: lab:template-update
   */
  @Patch(':id')
  @RequirePermissions(PERMISSIONS.LAB_TEMPLATE_MANAGE)
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateLabTemplateDto,
    @CurrentUser() user: AuthUser,
  ) {
    const row = await this.laboratoryService.updateTemplate(id, dto, user);
    return { data: row };
  }
}
