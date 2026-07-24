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
import { CreateSfaDto, PatchSfaDto, RejectSfaDto } from './dto/lab-specialty.dto';

@Controller('laboratory/sfa')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class LabSfaController {
  constructor(private readonly extended: LabExtendedService) {}

  /**
   * Method: GET
   * URL: /api/laboratory/sfa?status=&personId=&q=&page=&limit=
   * Purpose: List seminal fluid analyses + KPIs
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
      data: await this.extended.listSfa({
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
   * URL: /api/laboratory/sfa/:id
   * Purpose: SFA detail
   * Required permission: lab:read
   * Errors: 401, 403, 404
   */
  @Get(':id')
  @RequirePermissions(PERMISSIONS.LAB_READ)
  async get(@Param('id', ParseIntPipe) id: number) {
    return { data: await this.extended.getSfa(id) };
  }

  /**
   * Method: POST
   * URL: /api/laboratory/sfa
   * Purpose: Create draft SFA for patient
   * Required permission: lab:create
   * Request body: { personId, volumeMl?, colour?, …, interpretation? }
   * Audit: lab-sfa:create
   * Errors: 400, 401, 403, 404
   */
  @Post()
  @RequirePermissions(PERMISSIONS.LAB_CREATE)
  async create(@Body() dto: CreateSfaDto, @CurrentUser() user: AuthUser) {
    return { data: await this.extended.createSfa(dto, user) };
  }

  /**
   * Method: PATCH
   * URL: /api/laboratory/sfa/:id
   * Purpose: Update SFA fields (Draft/Submitted)
   * Required permission: lab:result
   * Audit: lab-sfa:update
   */
  @Patch(':id')
  @RequirePermissions(PERMISSIONS.LAB_RESULT)
  async patch(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: PatchSfaDto,
    @CurrentUser() user: AuthUser,
  ) {
    return { data: await this.extended.patchSfa(id, dto, user) };
  }

  /**
   * Method: POST
   * URL: /api/laboratory/sfa/:id/submit
   * Purpose: Submit SFA for validation
   * Required permission: lab:result
   * Audit: lab-sfa:submit
   */
  @Post(':id/submit')
  @RequirePermissions(PERMISSIONS.LAB_RESULT)
  async submit(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    return { data: await this.extended.submitSfa(id, user) };
  }

  /**
   * Method: POST
   * URL: /api/laboratory/sfa/:id/validate
   * Purpose: Validate SFA
   * Required permission: lab:validate
   * Audit: lab-sfa:validate
   */
  @Post(':id/validate')
  @RequirePermissions(PERMISSIONS.LAB_VALIDATE)
  async validate(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    return { data: await this.extended.validateSfa(id, user) };
  }

  /**
   * Method: POST
   * URL: /api/laboratory/sfa/:id/reject
   * Purpose: Reject SFA { reason }
   * Required permission: lab:validate
   * Audit: lab-sfa:reject
   */
  @Post(':id/reject')
  @RequirePermissions(PERMISSIONS.LAB_VALIDATE)
  async reject(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RejectSfaDto,
    @CurrentUser() user: AuthUser,
  ) {
    return { data: await this.extended.rejectSfa(id, dto, user) };
  }
}
