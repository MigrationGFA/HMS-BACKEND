import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
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
import { RejectLabSampleDto } from './dto/lab.dto';
import { LaboratoryService } from './laboratory.service';

/**
 * Dedicated LIS sample endpoints (LAB_SAMPLES).
 * Ward/nursing specimen collection keeps its own flow at /api/nursing/samples.
 */
@Controller('laboratory/samples')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class LabSamplesController {
  constructor(private readonly laboratoryService: LaboratoryService) {}

  /**
   * Method: GET
   * URL: /api/laboratory/samples?status=&requestId=&q=&page=&limit=
   * Purpose: List collected/rejected lab samples with request + patient summary
   * Required permission: lab:read
   * Request body: none
   * Response example: { data: { items: [{ sampleId, sampleNo, specimenType, status, requestNo, personName, hospitalNo }], meta } }
   * Error cases: 401, 403
   */
  @Get()
  @RequirePermissions(PERMISSIONS.LAB_READ)
  async list(
    @Query('status') status?: string,
    @Query('requestId') requestId?: string,
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const result = await this.laboratoryService.listLabSamples({
      status,
      requestId: requestId ? Number(requestId) : undefined,
      q,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 50,
    });
    return { data: result };
  }

  /**
   * Method: POST
   * URL: /api/laboratory/samples/:id/reject
   * Purpose: Reject a collected sample (haemolysed, insufficient, mislabelled…) — request returns to AwaitingCollection for a fresh draw
   * Required permission: lab:collect
   * Request body: { reason: string }
   * Response example: { data: { sampleId, status: "Rejected", rejectReason } }
   * Error cases: 400 already rejected / results already submitted, 401, 403, 404
   * Audit: lab:sample-reject
   */
  @Post(':id/reject')
  @RequirePermissions(PERMISSIONS.LAB_COLLECT)
  async reject(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RejectLabSampleDto,
    @CurrentUser() user: AuthUser,
  ) {
    const row = await this.laboratoryService.rejectSample(id, dto, user);
    return { data: row };
  }
}
