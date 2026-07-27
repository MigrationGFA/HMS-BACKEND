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
  CreateQcRunDto,
  PatchQcRunDto,
  QcCapaDto,
} from './dto/lab-specialty.dto';

@Controller('laboratory/qc')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class LabQcController {
  constructor(private readonly extended: LabExtendedService) {}

  /**
   * Method: GET
   * URL: /api/laboratory/qc?freq=&result=&q=&page=&limit=
   * Purpose: List QC runs + passed/failed KPIs
   * Required permission: lab:read
   * Response: { data: { items, meta, kpis } }
   * Errors: 401, 403
   */
  @Get()
  @RequirePermissions(PERMISSIONS.LAB_READ)
  async list(
    @Query('freq') freq?: string,
    @Query('result') result?: string,
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return {
      data: await this.extended.listQc({
        freq,
        result,
        q,
        page: page ? Number(page) : undefined,
        limit: limit ? Number(limit) : undefined,
      }),
    };
  }

  /**
   * Method: GET
   * URL: /api/laboratory/qc/:id
   * Purpose: QC run detail
   * Required permission: lab:read
   * Errors: 401, 403, 404
   */
  @Get(':id')
  @RequirePermissions(PERMISSIONS.LAB_READ)
  async get(@Param('id', ParseIntPipe) id: number) {
    return { data: await this.extended.getQc(id) };
  }

  /**
   * Method: POST
   * URL: /api/laboratory/qc
   * Purpose: Create QC run
   * Required permission: lab:create
   * Request body: { analyte, instrument, level, expected, observed, result, freq, runDate? }
   * Audit: lab-qc:create
   * Errors: 400, 401, 403
   */
  @Post()
  @RequirePermissions(PERMISSIONS.LAB_CREATE)
  async create(@Body() dto: CreateQcRunDto, @CurrentUser() user: AuthUser) {
    return { data: await this.extended.createQc(dto, user) };
  }

  /**
   * Method: PATCH
   * URL: /api/laboratory/qc/:id
   * Purpose: Update QC run fields
   * Required permission: lab:update
   * Audit: lab-qc:update
   */
  @Patch(':id')
  @RequirePermissions(PERMISSIONS.LAB_UPDATE)
  async patch(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: PatchQcRunDto,
    @CurrentUser() user: AuthUser,
  ) {
    return { data: await this.extended.patchQc(id, dto, user) };
  }

  /**
   * Method: POST
   * URL: /api/laboratory/qc/:id/capa
   * Purpose: Upsert CAPA for a QC run
   * Required permission: lab:update
   * Request body: { corrective, preventive, assignedTo, targetDate?, capaStatus? }
   * Audit: lab-qc:capa
   * Errors: 400, 401, 403, 404
   */
  @Post(':id/capa')
  @RequirePermissions(PERMISSIONS.LAB_UPDATE)
  async capa(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: QcCapaDto,
    @CurrentUser() user: AuthUser,
  ) {
    return { data: await this.extended.upsertQcCapa(id, dto, user) };
  }
}
