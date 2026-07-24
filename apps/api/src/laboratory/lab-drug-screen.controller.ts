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
import {
  CollectDrugScreenDto,
  CreateDrugScreenDto,
  PatchDrugScreenResultsDto,
  RejectDrugScreenDto,
} from './dto/lab-specialty.dto';

@Controller('laboratory/drug-screens')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class LabDrugScreenController {
  constructor(private readonly specialty: LabSpecialtyService) {}

  /**
   * Method: GET
   * URL: /api/laboratory/drug-screens?status=&personId=&q=&page=&limit=
   * Purpose: List urine drug screens
   * Required permission: lab:read
   * Response: { data: { items, meta, drugCatalog } }
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
      data: await this.specialty.listDrugScreens({
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
   * URL: /api/laboratory/drug-screens/:id
   * Purpose: Drug screen detail + result lines
   * Required permission: lab:read
   * Errors: 401, 403, 404
   */
  @Get(':id')
  @RequirePermissions(PERMISSIONS.LAB_READ)
  async get(@Param('id', ParseIntPipe) id: number) {
    return { data: await this.specialty.getDrugScreen(id) };
  }

  /**
   * Method: POST
   * URL: /api/laboratory/drug-screens
   * Purpose: Create draft UDS for patient with selected drug panel
   * Required permission: lab:create
   * Request body: { personId, drugCodes[], labRequestId? }
   * Errors: 400, 401, 403, 404
   * Audit: lab-drug-screen:create
   */
  @Post()
  @RequirePermissions(PERMISSIONS.LAB_CREATE)
  async create(@Body() dto: CreateDrugScreenDto, @CurrentUser() user: AuthUser) {
    return { data: await this.specialty.createDrugScreen(dto, user) };
  }

  /**
   * Method: POST
   * URL: /api/laboratory/drug-screens/:id/collect
   * Purpose: Record sample collection
   * Required permission: lab:collect
   * Request body: { sampleNo?, sampleType?, collectedAt? }
   * Errors: 400, 401, 403, 404
   */
  @Post(':id/collect')
  @RequirePermissions(PERMISSIONS.LAB_COLLECT)
  async collect(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CollectDrugScreenDto,
    @CurrentUser() user: AuthUser,
  ) {
    return { data: await this.specialty.collectDrugScreen(id, dto, user) };
  }

  /**
   * Method: PATCH
   * URL: /api/laboratory/drug-screens/:id/results
   * Purpose: Upsert per-drug results
   * Required permission: lab:result
   * Request body: { results: [{ drugCode, result, remarks? }] }
   * Errors: 400, 401, 403, 404
   */
  @Patch(':id/results')
  @RequirePermissions(PERMISSIONS.LAB_RESULT)
  async results(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: PatchDrugScreenResultsDto,
    @CurrentUser() user: AuthUser,
  ) {
    return { data: await this.specialty.patchDrugScreenResults(id, dto, user) };
  }

  /**
   * Method: POST
   * URL: /api/laboratory/drug-screens/:id/submit
   * Purpose: Submit for validation
   * Required permission: lab:result
   * Errors: 400, 401, 403, 404
   */
  @Post(':id/submit')
  @RequirePermissions(PERMISSIONS.LAB_RESULT)
  async submit(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
  ) {
    return { data: await this.specialty.submitDrugScreen(id, user) };
  }

  /**
   * Method: POST
   * URL: /api/laboratory/drug-screens/:id/validate
   * Purpose: Validate drug screen
   * Required permission: lab:validate
   * Errors: 400, 401, 403, 404
   */
  @Post(':id/validate')
  @RequirePermissions(PERMISSIONS.LAB_VALIDATE)
  async validate(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
  ) {
    return { data: await this.specialty.validateDrugScreen(id, user) };
  }

  /**
   * Method: POST
   * URL: /api/laboratory/drug-screens/:id/reject
   * Purpose: Reject drug screen
   * Required permission: lab:validate
   * Request body: { reason }
   * Errors: 400, 401, 403, 404
   */
  @Post(':id/reject')
  @RequirePermissions(PERMISSIONS.LAB_VALIDATE)
  async reject(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RejectDrugScreenDto,
    @CurrentUser() user: AuthUser,
  ) {
    return { data: await this.specialty.rejectDrugScreen(id, dto, user) };
  }
}
