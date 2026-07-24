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
import { LabSpecialtyService } from './lab-specialty.service';
import { GenerateLabReportDto } from './dto/lab-specialty.dto';

@Controller('laboratory/reports')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class LabReportsController {
  constructor(private readonly specialty: LabSpecialtyService) {}

  /**
   * Method: GET
   * URL: /api/laboratory/reports?page=&limit=
   * Purpose: List generated laboratory report snapshots
   * Required permission: lab:read
   * Response: { data: { items, meta, kpis } }
   * Errors: 401, 403
   */
  @Get()
  @RequirePermissions(PERMISSIONS.LAB_READ)
  async list(@Query('page') page?: string, @Query('limit') limit?: string) {
    return {
      data: await this.specialty.listReports({
        page: page ? Number(page) : undefined,
        limit: limit ? Number(limit) : undefined,
      }),
    };
  }

  /**
   * Method: POST
   * URL: /api/laboratory/reports/generate
   * Purpose: Aggregate lab metrics for a date range and persist snapshot
   * Required permission: lab:read
   * Request body: { reportType, from, to, title? }
   * Errors: 400, 401, 403
   * Audit: lab-report:generate
   */
  @Post('generate')
  @RequirePermissions(PERMISSIONS.LAB_READ)
  async generate(
    @Body() dto: GenerateLabReportDto,
    @CurrentUser() user: AuthUser,
  ) {
    return { data: await this.specialty.generateReport(dto, user) };
  }

  /**
   * Method: GET
   * URL: /api/laboratory/reports/:id
   * Purpose: Report snapshot detail including payload
   * Required permission: lab:read
   * Errors: 401, 403, 404
   */
  @Get(':id')
  @RequirePermissions(PERMISSIONS.LAB_READ)
  async get(@Param('id', ParseIntPipe) id: number) {
    return { data: await this.specialty.getReport(id) };
  }
}
