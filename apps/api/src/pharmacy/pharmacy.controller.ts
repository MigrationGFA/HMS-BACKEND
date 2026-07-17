import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { PERMISSIONS } from '../common/constants';
import { PharmacyService } from './pharmacy.service';

@Controller('pharmacy')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PharmacyController {
  constructor(private readonly pharmacyService: PharmacyService) {}

  /**
   * Method: GET
   * URL: /api/pharmacy/dashboard?timezoneOffsetMinutes=60
   * Purpose: Pharmacy operations dashboard KPIs, charts, and live alerts
   * Required permission: pharmacy:read
   * Request body: none
   * Response example: { data: { asOf, kpis, charts, alerts, inventory, procurement } }
   * Error cases: 401 unauthorized, 403 missing permission
   */
  @Get('dashboard')
  @RequirePermissions(PERMISSIONS.PHARMACY_READ)
  async dashboard(@Query('timezoneOffsetMinutes') timezoneOffsetMinutes?: string) {
    const data = await this.pharmacyService.dashboard({
      timezoneOffsetMinutes: timezoneOffsetMinutes
        ? Number(timezoneOffsetMinutes)
        : 60,
    });
    return { data };
  }

  /**
   * Method: GET
   * URL: /api/pharmacy/inpatient?q=&wardId=&status=&page=&limit=
   * Purpose: Inpatient pharmacy ward dispensing queue (active admissions + Rx)
   * Required permission: pharmacy:read
   * Request body: none
   * Response example: { data: { summary, wards, items: [{ patientName, wardName, rxNo, queueStatus }], meta } }
   * Error cases: 401, 403
   */
  @Get('inpatient')
  @RequirePermissions(PERMISSIONS.PHARMACY_READ)
  async inpatient(
    @Query('q') q?: string,
    @Query('wardId') wardId?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const data = await this.pharmacyService.inpatient({
      q,
      wardId: wardId ? Number(wardId) : undefined,
      status,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 50,
    });
    return { data };
  }

  /**
   * Method: GET
   * URL: /api/pharmacy/reports/catalog
   * Purpose: List available pharmacy operational reports
   * Required permission: pharmacy:read
   * Request body: none
   * Response example: { data: { items: [{ type, label, description }] } }
   * Error cases: 401, 403
   */
  @Get('reports/catalog')
  @RequirePermissions(PERMISSIONS.PHARMACY_READ)
  async reportCatalog() {
    const data = this.pharmacyService.reportCatalog();
    return { data };
  }

  /**
   * Method: GET
   * URL: /api/pharmacy/reports/:type?from=&to=&page=&limit=
   * Purpose: Generate a pharmacy report (prescriptions, utilization, revenue, inventory, expiry, returns, controlled)
   * Required permission: pharmacy:read
   * Request body: none
   * Response example: { data: { type, from, to, summary, columns, items, meta } }
   * Error cases: 400 unknown report type, 401, 403
   */
  @Get('reports/:type')
  @RequirePermissions(PERMISSIONS.PHARMACY_READ)
  async generateReport(
    @Param('type') type: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const data = await this.pharmacyService.generateReport(type, {
      from,
      to,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 100,
    });
    return { data };
  }

  /**
   * Method: GET
   * URL: /api/pharmacy/audit/stats?timezoneOffsetMinutes=60
   * Purpose: Summary cards for pharmacy audit trail
   * Required permission: audit:read
   * Request body: none
   * Response example: { data: { totalToday, dispenses, emergencies, stockEvents, returns, overrides } }
   * Error cases: 401, 403
   */
  @Get('audit/stats')
  @RequirePermissions(PERMISSIONS.AUDIT_READ)
  async auditStats(
    @Query('timezoneOffsetMinutes') timezoneOffsetMinutes?: string,
  ) {
    const data = await this.pharmacyService.auditStats({
      timezoneOffsetMinutes: timezoneOffsetMinutes
        ? Number(timezoneOffsetMinutes)
        : 60,
    });
    return { data };
  }

  /**
   * Method: GET
   * URL: /api/pharmacy/audit?q=&category=&status=&from=&to=&page=&limit=&timezoneOffsetMinutes=
   * Purpose: Pharmacy-scoped audit trail (dispense, stock, procurement, payments, returns, emergency)
   * Required permission: audit:read
   * Request body: none
   * Response example: { data: { items: [{ auditId, time, officer, action, patient, module, status }], meta, stats } }
   * Error cases: 401, 403
   */
  @Get('audit')
  @RequirePermissions(PERMISSIONS.AUDIT_READ)
  async auditTrail(
    @Query('q') q?: string,
    @Query('category') category?: string,
    @Query('status') status?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('timezoneOffsetMinutes') timezoneOffsetMinutes?: string,
  ) {
    const data = await this.pharmacyService.auditTrail({
      q,
      category,
      status,
      from,
      to,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 50,
      timezoneOffsetMinutes: timezoneOffsetMinutes
        ? Number(timezoneOffsetMinutes)
        : 60,
    });
    return { data };
  }
}
