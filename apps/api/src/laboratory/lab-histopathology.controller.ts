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
import { LabExtendedService } from './lab-extended.service';
import {
  AdvanceHistopathologyDto,
  CreateHistopathologyDto,
  PatchHistopathologyDto,
} from './dto/lab-specialty.dto';

@Controller('laboratory/histopathology')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class LabHistopathologyController {
  constructor(private readonly extended: LabExtendedService) {}

  /**
   * Method: GET
   * URL: /api/laboratory/histopathology?stage=&personId=&q=&page=&limit=
   * Purpose: List histopathology cases + stage KPIs
   * Required permission: lab:read
   * Response: { data: { items, meta, kpis } }
   * Errors: 401, 403
   */
  @Get()
  @RequirePermissions(PERMISSIONS.LAB_READ)
  async list(
    @Query('stage') stage?: string,
    @Query('personId') personId?: string,
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return {
      data: await this.extended.listHistopathology({
        stage,
        personId: personId ? Number(personId) : undefined,
        q,
        page: page ? Number(page) : undefined,
        limit: limit ? Number(limit) : undefined,
      }),
    };
  }

  /**
   * Method: GET
   * URL: /api/laboratory/histopathology/:id
   * Purpose: Histopathology case detail
   * Required permission: lab:read
   * Errors: 401, 403, 404
   */
  @Get(':id')
  @RequirePermissions(PERMISSIONS.LAB_READ)
  async get(@Param('id', ParseIntPipe) id: number) {
    return { data: await this.extended.getHistopathology(id) };
  }

  /**
   * Method: POST
   * URL: /api/laboratory/histopathology
   * Purpose: Register histopathology case (stage Received)
   * Required permission: lab:create
   * Request body: { personId, specimenType, site?, gross?, micro?, diagnosis?, grade? }
   * Audit: lab-histo:create
   * Errors: 400, 401, 403, 404
   */
  @Post()
  @RequirePermissions(PERMISSIONS.LAB_CREATE)
  async create(
    @Body() dto: CreateHistopathologyDto,
    @CurrentUser() user: AuthUser,
  ) {
    return { data: await this.extended.createHistopathology(dto, user) };
  }

  /**
   * Method: PATCH
   * URL: /api/laboratory/histopathology/:id
   * Purpose: Update report fields while not Released
   * Required permission: lab:result
   * Audit: lab-histo:update
   */
  @Patch(':id')
  @RequirePermissions(PERMISSIONS.LAB_RESULT)
  async patch(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: PatchHistopathologyDto,
    @CurrentUser() user: AuthUser,
  ) {
    return { data: await this.extended.patchHistopathology(id, dto, user) };
  }

  /**
   * Method: POST
   * URL: /api/laboratory/histopathology/:id/advance
   * Purpose: Advance to next stage (or set stage); release delegates to release
   * Required permission: lab:update
   * Request body: { stage? }
   * Audit: lab-histo:advance
   */
  @Post(':id/advance')
  @RequirePermissions(PERMISSIONS.LAB_UPDATE)
  async advance(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AdvanceHistopathologyDto,
    @CurrentUser() user: AuthUser,
  ) {
    return { data: await this.extended.advanceHistopathology(id, dto, user) };
  }

  /**
   * Method: POST
   * URL: /api/laboratory/histopathology/:id/release
   * Purpose: Release case (requires diagnosis)
   * Required permission: lab:validate
   * Audit: lab-histo:release
   * Errors: 400 missing diagnosis, 401, 403, 404
   */
  @Post(':id/release')
  @RequirePermissions(PERMISSIONS.LAB_VALIDATE)
  async release(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
  ) {
    return { data: await this.extended.releaseHistopathology(id, user) };
  }
}
