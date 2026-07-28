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
  CreateSpecimenDto,
  SpecimenStatusDto,
  TransferSpecimenDto,
} from './dto/lab-specialty.dto';

@Controller('laboratory/specimens')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class LabSpecimensController {
  constructor(private readonly extended: LabExtendedService) {}

  /**
   * Method: GET
   * URL: /api/laboratory/specimens?status=&personId=&q=&page=&limit=
   * Purpose: Specimen tracking list + KPI counts
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
      data: await this.extended.listSpecimens({
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
   * URL: /api/laboratory/specimens/:id
   * Purpose: Specimen detail + chain-of-custody events
   * Required permission: lab:read
   * Errors: 401, 403, 404
   */
  @Get(':id')
  @RequirePermissions(PERMISSIONS.LAB_READ)
  async get(@Param('id', ParseIntPipe) id: number) {
    return { data: await this.extended.getSpecimen(id) };
  }

  /**
   * Method: POST
   * URL: /api/laboratory/specimens
   * Purpose: Register specimen { personId, testLabel, collectedBy?, location? }
   * Required permission: lab:create
   * Audit: lab-specimen:create
   * Errors: 400, 401, 403, 404
   */
  @Post()
  @RequirePermissions(PERMISSIONS.LAB_CREATE)
  async create(@Body() dto: CreateSpecimenDto, @CurrentUser() user: AuthUser) {
    return { data: await this.extended.createSpecimen(dto, user) };
  }

  /**
   * Method: PATCH
   * URL: /api/laboratory/specimens/:id/transfer
   * Purpose: Transfer specimen { toLocation, reason?, staffLabel? }
   * Required permission: lab:update
   * Audit: lab-specimen:transfer
   */
  @Patch(':id/transfer')
  @RequirePermissions(PERMISSIONS.LAB_UPDATE)
  async transfer(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: TransferSpecimenDto,
    @CurrentUser() user: AuthUser,
  ) {
    return { data: await this.extended.transferSpecimen(id, dto, user) };
  }

  /**
   * Method: PATCH
   * URL: /api/laboratory/specimens/:id/status
   * Purpose: Update status { status, reason?, location? }
   * Required permission: lab:update
   * Audit: lab-specimen:status
   */
  @Patch(':id/status')
  @RequirePermissions(PERMISSIONS.LAB_UPDATE)
  async status(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SpecimenStatusDto,
    @CurrentUser() user: AuthUser,
  ) {
    return { data: await this.extended.updateSpecimenStatus(id, dto, user) };
  }
}
