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
import { CreateCultureDto, PatchCultureDto } from './dto/lab-specialty.dto';

@Controller('laboratory/microbiology')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class LabMicrobiologyController {
  constructor(private readonly extended: LabExtendedService) {}

  /**
   * Method: GET
   * URL: /api/laboratory/microbiology?status=&q=&page=&limit=
   * Purpose: Microbiology worklist over cultures + micro KPIs
   * Required permission: lab:read
   * Response: { data: { items, meta, kpis: { pending, positive, negative, awaitingValidation, completed } } }
   * Errors: 401, 403
   */
  @Get()
  @RequirePermissions(PERMISSIONS.LAB_READ)
  async list(
    @Query('status') status?: string,
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return {
      data: await this.extended.listMicrobiology({
        status,
        q,
        page: page ? Number(page) : undefined,
        limit: limit ? Number(limit) : undefined,
      }),
    };
  }

  /**
   * Method: GET
   * URL: /api/laboratory/microbiology/:id
   * Purpose: Culture detail for micro workbench
   * Required permission: lab:read
   * Errors: 401, 403, 404
   */
  @Get(':id')
  @RequirePermissions(PERMISSIONS.LAB_READ)
  async get(@Param('id', ParseIntPipe) id: number) {
    return { data: await this.extended.getMicrobiology(id) };
  }

  /**
   * Method: POST
   * URL: /api/laboratory/microbiology
   * Purpose: Create culture (delegates to cultures)
   * Required permission: lab:create
   */
  @Post()
  @RequirePermissions(PERMISSIONS.LAB_CREATE)
  async create(@Body() dto: CreateCultureDto, @CurrentUser() user: AuthUser) {
    return { data: await this.extended.createMicrobiology(dto, user) };
  }

  /**
   * Method: PATCH
   * URL: /api/laboratory/microbiology/:id
   * Purpose: Update culture / sensitivity
   * Required permission: lab:update
   */
  @Patch(':id')
  @RequirePermissions(PERMISSIONS.LAB_UPDATE)
  async patch(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: PatchCultureDto,
    @CurrentUser() user: AuthUser,
  ) {
    return { data: await this.extended.patchMicrobiology(id, dto, user) };
  }

  /**
   * Method: POST
   * URL: /api/laboratory/microbiology/:id/validate
   * Purpose: Mark culture Final (micro validate)
   * Required permission: lab:validate
   */
  @Post(':id/validate')
  @RequirePermissions(PERMISSIONS.LAB_VALIDATE)
  async validate(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    return { data: await this.extended.validateMicrobiology(id, user) };
  }
}
