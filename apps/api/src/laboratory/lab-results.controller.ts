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
import { AmendLabResultDto, ReturnLabResultDto } from './dto/lab.dto';
import { LaboratoryService } from './laboratory.service';

/**
 * Lab result worklist + validation / return / amendment (LAB_RESULTS).
 * Result entry itself happens via POST /api/laboratory/requests/:id/results.
 */
@Controller('laboratory/results')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class LabResultsController {
  constructor(private readonly laboratoryService: LaboratoryService) {}

  /**
   * Method: GET
   * URL: /api/laboratory/results?status=&requestId=&personId=&critical=&q=&page=&limit=
   * Purpose: Result worklist (status accepts comma list, e.g. Submitted,Validated). critical=true filters CRITICAL_FLAG=Y
   * Required permission: lab:read
   * Request body: none
   * Response example: { data: { items: [{ labResultId, status, criticalFlag, criticalAckAt, testName, requestNo, personName }], meta } }
   * Error cases: 401, 403
   */
  @Get()
  @RequirePermissions(PERMISSIONS.LAB_READ)
  async list(
    @Query('status') status?: string,
    @Query('requestId') requestId?: string,
    @Query('personId') personId?: string,
    @Query('critical') critical?: string,
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const result = await this.laboratoryService.listResults({
      status,
      requestId: requestId ? Number(requestId) : undefined,
      personId: personId ? Number(personId) : undefined,
      critical: critical === 'true' || critical === '1',
      q,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 50,
    });
    return { data: result };
  }

  /**
   * Method: POST
   * URL: /api/laboratory/results/:id/acknowledge
   * Purpose: Doctor acknowledges a critical lab result (audit + CRITICAL_ACK_* stamps)
   * Required permission: lab:read
   * Request body: none
   * Response example: { data: { labResultId, criticalFlag: true, criticalAckAt, criticalAckBy } }
   * Error cases: 400 not critical, 401, 403, 404
   * Audit: lab:result-critical-ack
   */
  @Post(':id/acknowledge')
  @RequirePermissions(PERMISSIONS.LAB_READ)
  async acknowledge(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
  ) {
    const row = await this.laboratoryService.acknowledgeCriticalResult(id, user);
    return { data: row };
  }

  /**
   * Method: GET
   * URL: /api/laboratory/results/:id
   * Purpose: Single lab result detail (values, template fields, audit stamps)
   * Required permission: lab:read
   * Request body: none
   * Response example: { data: { labResultId, values, status, version, templateFields } }
   * Error cases: 401, 403, 404
   */
  @Get(':id')
  @RequirePermissions(PERMISSIONS.LAB_READ)
  async findOne(@Param('id', ParseIntPipe) id: number) {
    const row = await this.laboratoryService.findResultById(id);
    return { data: row };
  }

  /**
   * Method: GET
   * URL: /api/laboratory/results/:id/versions
   * Purpose: Immutable version history of a result (draft/submit/validate/return/amend snapshots)
   * Required permission: lab:read
   * Request body: none
   * Response example: { data: [{ versionId, version, values, action, reason, actedBy, actedAt }] }
   * Error cases: 401, 403, 404
   */
  @Get(':id/versions')
  @RequirePermissions(PERMISSIONS.LAB_READ)
  async versions(@Param('id', ParseIntPipe) id: number) {
    const rows = await this.laboratoryService.listResultVersions(id);
    return { data: rows };
  }

  /**
   * Method: POST
   * URL: /api/laboratory/results/:id/validate
   * Purpose: Validate a submitted (or amended) result; when all request items are validated the request becomes Validated
   * Required permission: lab:validate
   * Request body: none
   * Response example: { data: { labResultId, status: "Validated", validatedBy, validatedAt } }
   * Error cases: 400 not in submitted state, 401, 403, 404
   * Audit: lab:result-validate
   */
  @Post(':id/validate')
  @RequirePermissions(PERMISSIONS.LAB_VALIDATE)
  async validate(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
  ) {
    const row = await this.laboratoryService.validateResult(id, user);
    return { data: row };
  }

  /**
   * Method: POST
   * URL: /api/laboratory/results/:id/return
   * Purpose: Return a submitted result to the bench for correction (back to Draft, request → ResultDraft)
   * Required permission: lab:validate
   * Request body: { reason: string }
   * Response example: { data: { labResultId, status: "Draft", returnReason } }
   * Error cases: 400 not in submitted state, 401, 403, 404
   * Audit: lab:result-return
   */
  @Post(':id/return')
  @RequirePermissions(PERMISSIONS.LAB_VALIDATE)
  async returnResult(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReturnLabResultDto,
    @CurrentUser() user: AuthUser,
  ) {
    const row = await this.laboratoryService.returnResult(id, dto, user);
    return { data: row };
  }

  /**
   * Method: POST
   * URL: /api/laboratory/results/:id/amend
   * Purpose: Amend a validated result — bumps VERSION, snapshots the change and puts it back through validation (PendingRevalidation). Prior values are never deleted.
   * Required permission: lab:validate
   * Request body: { values: object, comment?: string, reason: string }
   * Response example: { data: { labResultId, status: "PendingRevalidation", version: 2 } }
   * Error cases: 400 not validated, 401, 403, 404
   * Audit: lab:result-amend
   */
  @Post(':id/amend')
  @RequirePermissions(PERMISSIONS.LAB_VALIDATE)
  async amend(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AmendLabResultDto,
    @CurrentUser() user: AuthUser,
  ) {
    const row = await this.laboratoryService.amendResult(id, dto, user);
    return { data: row };
  }
}
