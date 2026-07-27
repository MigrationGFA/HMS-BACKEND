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
import { RecordsOpsService } from './records-ops.service';
import {
  ArchiveAccessRequestDto,
  CreateArchiveDto,
  CreateFileRequestDto,
  GenerateReportDto,
  UpdateArchiveDto,
  UpdateFileRequestStatusDto,
} from './dto/records-ops.dto';

@Controller('records')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class RecordsOpsController {
  constructor(private readonly ops: RecordsOpsService) {}

  /**
   * Method: GET
   * URL: /api/records/file-requests?status=&q=&page=&limit=
   * Purpose: Medical record file retrieval worklist + KPIs
   * Required permission: records-file:read
   */
  @Get('file-requests')
  @RequirePermissions(PERMISSIONS.RECORDS_FILE_READ)
  async listFileRequests(
    @Query('status') status?: string,
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return {
      data: await this.ops.listFileRequests({
        status,
        q,
        page: page ? Number(page) : undefined,
        limit: limit ? Number(limit) : undefined,
      }),
    };
  }

  /**
   * Method: GET
   * URL: /api/records/file-requests/:id
   * Purpose: File request detail + events
   * Required permission: records-file:read
   */
  @Get('file-requests/:id')
  @RequirePermissions(PERMISSIONS.RECORDS_FILE_READ)
  async getFileRequest(@Param('id', ParseIntPipe) id: number) {
    return { data: await this.ops.getFileRequest(id) };
  }

  /**
   * Method: POST
   * URL: /api/records/file-requests
   * Purpose: Create physical chart retrieval request
   * Required permission: records-file:create
   * Request body: { personId, department, reason, dueDate?, requestedBy? }
   * Audit: records-file:create
   */
  @Post('file-requests')
  @RequirePermissions(PERMISSIONS.RECORDS_FILE_CREATE)
  async createFileRequest(
    @Body() dto: CreateFileRequestDto,
    @CurrentUser() user: AuthUser,
  ) {
    return { data: await this.ops.createFileRequest(dto, user) };
  }

  /**
   * Method: PATCH
   * URL: /api/records/file-requests/:id/status
   * Purpose: Update retrieval status (release / transit / return / missing)
   * Required permission: records-file:update
   * Request body: { status, note?, location? }
   * Audit: records-file:status
   */
  @Patch('file-requests/:id/status')
  @RequirePermissions(PERMISSIONS.RECORDS_FILE_UPDATE)
  async updateFileStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateFileRequestStatusDto,
    @CurrentUser() user: AuthUser,
  ) {
    return { data: await this.ops.updateFileStatus(id, dto, user) };
  }

  /**
   * Method: GET
   * URL: /api/records/archives?category=&q=&page=&limit=
   * Purpose: Record archive catalog + KPIs
   * Required permission: records-archive:read
   */
  @Get('archives')
  @RequirePermissions(PERMISSIONS.RECORDS_ARCHIVE_READ)
  async listArchives(
    @Query('category') category?: string,
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return {
      data: await this.ops.listArchives({
        category,
        q,
        page: page ? Number(page) : undefined,
        limit: limit ? Number(limit) : undefined,
      }),
    };
  }

  /**
   * Method: POST
   * URL: /api/records/archives
   * Purpose: Archive a patient record
   * Required permission: records-archive:create
   * Request body: { personId, category, accessLevel?, retentionUntil?, dueReviewAt?, notes? }
   * Audit: records-archive:create
   */
  @Post('archives')
  @RequirePermissions(PERMISSIONS.RECORDS_ARCHIVE_CREATE)
  async createArchive(
    @Body() dto: CreateArchiveDto,
    @CurrentUser() user: AuthUser,
  ) {
    return { data: await this.ops.createArchive(dto, user) };
  }

  /**
   * Method: POST
   * URL: /api/records/archives/:id/restore
   * Purpose: Restore archived record
   * Required permission: records-archive:update
   * Audit: records-archive:restore
   */
  @Post('archives/:id/restore')
  @RequirePermissions(PERMISSIONS.RECORDS_ARCHIVE_UPDATE)
  async restoreArchive(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
  ) {
    return { data: await this.ops.restoreArchive(id, user) };
  }

  /**
   * Method: PATCH
   * URL: /api/records/archives/:id
   * Purpose: Extend retention / update access / category
   * Required permission: records-archive:update
   * Audit: records-archive:update
   */
  @Patch('archives/:id')
  @RequirePermissions(PERMISSIONS.RECORDS_ARCHIVE_UPDATE)
  async updateArchive(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateArchiveDto,
    @CurrentUser() user: AuthUser,
  ) {
    return { data: await this.ops.updateArchive(id, dto, user) };
  }

  /**
   * Method: POST
   * URL: /api/records/archives/:id/access-request
   * Purpose: Log supervisor access request (audit only v1)
   * Required permission: records-archive:update
   * Audit: records-archive:access-request
   */
  @Post('archives/:id/access-request')
  @RequirePermissions(PERMISSIONS.RECORDS_ARCHIVE_UPDATE)
  async accessRequest(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ArchiveAccessRequestDto,
    @CurrentUser() user: AuthUser,
  ) {
    return { data: await this.ops.accessRequest(id, dto, user) };
  }

  /**
   * Method: GET
   * URL: /api/records/reports/summary?timezoneOffsetMinutes=
   * Purpose: Live KPI strip for Reports page
   * Required permission: records-report:read
   */
  @Get('reports/summary')
  @RequirePermissions(PERMISSIONS.RECORDS_REPORT_READ)
  async reportsSummary(
    @Query('timezoneOffsetMinutes') timezoneOffsetMinutes?: string,
  ) {
    return {
      data: await this.ops.reportsSummary({
        timezoneOffsetMinutes: timezoneOffsetMinutes
          ? Number(timezoneOffsetMinutes)
          : undefined,
      }),
    };
  }

  /**
   * Method: GET
   * URL: /api/records/reports/snapshots?page=&limit=
   * Purpose: List saved report snapshots
   * Required permission: records-report:read
   */
  @Get('reports/snapshots')
  @RequirePermissions(PERMISSIONS.RECORDS_REPORT_READ)
  async listSnapshots(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return {
      data: await this.ops.listReportSnapshots({
        page: page ? Number(page) : undefined,
        limit: limit ? Number(limit) : undefined,
      }),
    };
  }

  /**
   * Method: POST
   * URL: /api/records/reports/generate
   * Purpose: Aggregate live metrics and persist snapshot
   * Required permission: records-report:create
   * Request body: { reportType, from, to, department? }
   * Audit: records-report:generate
   */
  @Post('reports/generate')
  @RequirePermissions(PERMISSIONS.RECORDS_REPORT_CREATE)
  async generateReport(
    @Body() dto: GenerateReportDto,
    @CurrentUser() user: AuthUser,
  ) {
    return { data: await this.ops.generateReport(dto, user) };
  }

  /**
   * Method: GET
   * URL: /api/records/analytics?range=today|week|month|quarter|year&timezoneOffsetMinutes=
   * Purpose: Records analytics KPIs + series
   * Required permission: records-analytics:read
   */
  @Get('analytics')
  @RequirePermissions(PERMISSIONS.RECORDS_ANALYTICS_READ)
  async analytics(
    @Query('range') range?: string,
    @Query('timezoneOffsetMinutes') timezoneOffsetMinutes?: string,
  ) {
    return {
      data: await this.ops.analytics({
        range,
        timezoneOffsetMinutes: timezoneOffsetMinutes
          ? Number(timezoneOffsetMinutes)
          : undefined,
      }),
    };
  }
}
