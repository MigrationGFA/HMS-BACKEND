import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { PERMISSIONS } from '../common/constants';
import { LaboratoryService } from './laboratory.service';

@Controller('laboratory/history')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class LabHistoryController {
  constructor(private readonly laboratoryService: LaboratoryService) {}

  /**
   * Method: GET
   * URL: /api/laboratory/history?personId=&from=&to=&q=&page=&limit=
   * Purpose: Patient-scoped longitudinal lab history (requests + items + latest result)
   * Required permission: lab:read
   * Request body: none
   * Response example: { data: { patient, items: [{ requestId, requestNo, testName, category, requestedAt, paymentStatus, labStatus, resultId, resultSummary, validatedAt }], meta } }
   * Error cases: 400 missing personId, 401, 403, 404 patient
   */
  @Get()
  @RequirePermissions(PERMISSIONS.LAB_READ)
  async history(
    @Query('personId') personId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const data = await this.laboratoryService.getPatientHistory({
      personId: personId ? Number(personId) : NaN,
      from,
      to,
      q,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 50,
    });
    return { data };
  }
}
