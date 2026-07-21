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
import { AdmissionRequestsService } from './admission-requests.service';
import {
  CreateAdmissionRequestDto,
  UpdateAdmissionRequestDto,
} from './dto/admission-request.dto';

@Controller('admission-requests')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AdmissionRequestsController {
  constructor(private readonly service: AdmissionRequestsService) {}

  /**
   * Method: POST
   * URL: /api/admission-requests
   * Purpose: Create/submit a doctor admission request (no payment, no bed)
   * Required permission: admission:create
   * Request body: CreateAdmissionRequestDto (personId required; no payment fields)
   * Response: { data: AdmissionRequest }
   * Errors: 400 validation / missing clinical fields; 404 person or ward
   */
  @Post()
  @RequirePermissions(PERMISSIONS.ADMISSION_CREATE)
  async create(
    @Body() dto: CreateAdmissionRequestDto,
    @CurrentUser() user: AuthUser,
  ) {
    const data = await this.service.create(dto, user);
    return { data };
  }

  /**
   * Method: GET
   * URL: /api/admission-requests?scope=mine|all&status=&personId=&q=&page=&limit=
   * Purpose: List admission requests (doctor's own vs hospital-wide)
   * Required permission: admission:read
   * Response: { data: { items, meta } }
   * Errors: 400 when scope=mine without auth user
   */
  @Get()
  @RequirePermissions(PERMISSIONS.ADMISSION_READ)
  async list(
    @CurrentUser() user: AuthUser,
    @Query('scope') scope?: string,
    @Query('status') status?: string,
    @Query('personId') personId?: string,
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const data = await this.service.list({
      scope,
      status,
      personId: personId ? Number(personId) : undefined,
      q,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 50,
      actor: user,
    });
    return { data };
  }

  /**
   * Method: GET
   * URL: /api/admission-requests/:id
   * Purpose: Admission request detail
   * Required permission: admission:read
   * Response: { data: AdmissionRequest }
   * Errors: 404 not found
   */
  @Get(':id')
  @RequirePermissions(PERMISSIONS.ADMISSION_READ)
  async findOne(@Param('id', ParseIntPipe) id: number) {
    const data = await this.service.findById(id);
    return { data };
  }

  /**
   * Method: PATCH
   * URL: /api/admission-requests/:id
   * Purpose: Update draft / cancel / status (doctor or records)
   * Required permission: admission:update
   * Request body: UpdateAdmissionRequestDto
   * Response: { data: AdmissionRequest }
   * Errors: 404 not found; 404 ward
   */
  @Patch(':id')
  @RequirePermissions(PERMISSIONS.ADMISSION_UPDATE)
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAdmissionRequestDto,
    @CurrentUser() user: AuthUser,
  ) {
    const data = await this.service.update(id, dto, user);
    return { data };
  }
}
