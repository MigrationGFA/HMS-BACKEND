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
import { LabSpecialtyService } from './lab-specialty.service';
import { CreateCultureDto, PatchCultureDto } from './dto/lab-specialty.dto';

@Controller('laboratory/cultures')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class LabCultureController {
  constructor(private readonly specialty: LabSpecialtyService) {}

  /**
   * Method: GET
   * URL: /api/laboratory/cultures?status=&personId=&q=&page=&limit=
   * Purpose: List culture & sensitivity reports + KPIs
   * Required permission: lab:read
   * Response: { data: { items, meta, kpis } }
   * Errors: 401, 403
   */
  @Get()
  @RequirePermissions(PERMISSIONS.LAB_READ)
  async list(
    @Query('status') status?: string,
    @Query('personId') personId?: string,
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return {
      data: await this.specialty.listCultures({
        status,
        personId: personId ? Number(personId) : undefined,
        q,
        page: page ? Number(page) : undefined,
        limit: limit ? Number(limit) : undefined,
      }),
    };
  }

  /**
   * Method: GET
   * URL: /api/laboratory/cultures/:id
   * Purpose: Culture detail + sensitivity matrix
   * Required permission: lab:read
   * Errors: 401, 403, 404
   */
  @Get(':id')
  @RequirePermissions(PERMISSIONS.LAB_READ)
  async get(@Param('id', ParseIntPipe) id: number) {
    return { data: await this.specialty.getCulture(id) };
  }

  /**
   * Method: POST
   * URL: /api/laboratory/cultures
   * Purpose: Create culture & sensitivity report
   * Required permission: lab:create
   * Request body: { personId, cultureType, organism?, colonyCount?, gramStain?, status?, scientist?, sensitivities? }
   * Errors: 400, 401, 403, 404
   * Audit: lab-culture:create
   */
  @Post()
  @RequirePermissions(PERMISSIONS.LAB_CREATE)
  async create(@Body() dto: CreateCultureDto, @CurrentUser() user: AuthUser) {
    return { data: await this.specialty.createCulture(dto, user) };
  }

  /**
   * Method: PATCH
   * URL: /api/laboratory/cultures/:id
   * Purpose: Update culture matrix / status
   * Required permission: lab:update
   * Errors: 400, 401, 403, 404
   * Audit: lab-culture:update
   */
  @Patch(':id')
  @RequirePermissions(PERMISSIONS.LAB_UPDATE)
  async patch(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: PatchCultureDto,
    @CurrentUser() user: AuthUser,
  ) {
    return { data: await this.specialty.patchCulture(id, dto, user) };
  }
}
