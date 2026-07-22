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
import { BloodBankService } from './blood-bank.service';
import {
  CreateBloodRequestDto,
  CreateBloodUnitDto,
  IssueBloodRequestDto,
  RecordCrossmatchDto,
  RejectBloodRequestDto,
  UpdateBloodUnitDto,
} from './dto/blood-bank.dto';

@Controller('laboratory/blood-bank')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class BloodBankController {
  constructor(private readonly bloodBank: BloodBankService) {}

  /**
   * Method: GET
   * URL: /api/laboratory/blood-bank/summary
   * Purpose: KPI counts for blood bank dashboard
   * Required permission: blood-bank:read
   * Request body: none
   * Response example: { data: { available, reserved, expired, issued, crossMatchRequests, emergencyRequests, stockByGroup } }
   * Error cases: 401, 403
   */
  @Get('summary')
  @RequirePermissions(PERMISSIONS.BLOOD_BANK_READ)
  async summary() {
    return { data: await this.bloodBank.summary() };
  }

  /**
   * Method: GET
   * URL: /api/laboratory/blood-bank/units?status=&bloodGroup=&q=&page=&limit=
   * Purpose: List blood inventory units
   * Required permission: blood-bank:read
   */
  @Get('units')
  @RequirePermissions(PERMISSIONS.BLOOD_BANK_READ)
  async listUnits(
    @Query('status') status?: string,
    @Query('bloodGroup') bloodGroup?: string,
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return {
      data: await this.bloodBank.listUnits({
        status,
        bloodGroup,
        q,
        page: page ? Number(page) : 1,
        limit: limit ? Number(limit) : 50,
      }),
    };
  }

  /**
   * Method: POST
   * URL: /api/laboratory/blood-bank/units
   * Purpose: Add a blood unit to inventory
   * Required permission: blood-bank:create
   * Request body: { unitNo, bloodGroup, component, expiryDate, status?, donorLabel?, notes? }
   * Audit: blood-bank:unit-create
   */
  @Post('units')
  @RequirePermissions(PERMISSIONS.BLOOD_BANK_CREATE)
  async createUnit(@Body() dto: CreateBloodUnitDto, @CurrentUser() user: AuthUser) {
    return { data: await this.bloodBank.createUnit(dto, user) };
  }

  /**
   * Method: PATCH
   * URL: /api/laboratory/blood-bank/units/:id
   * Purpose: Update unit status / return / quarantine
   * Required permission: blood-bank:update
   * Audit: blood-bank:unit-update
   */
  @Patch('units/:id')
  @RequirePermissions(PERMISSIONS.BLOOD_BANK_UPDATE)
  async updateUnit(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateBloodUnitDto,
    @CurrentUser() user: AuthUser,
  ) {
    return { data: await this.bloodBank.updateUnit(id, dto, user) };
  }

  /**
   * Method: GET
   * URL: /api/laboratory/blood-bank/requests?status=&q=&page=&limit=
   * Purpose: List transfusion requests
   * Required permission: blood-bank:read
   */
  @Get('requests')
  @RequirePermissions(PERMISSIONS.BLOOD_BANK_READ)
  async listRequests(
    @Query('status') status?: string,
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return {
      data: await this.bloodBank.listRequests({
        status,
        q,
        page: page ? Number(page) : 1,
        limit: limit ? Number(limit) : 50,
      }),
    };
  }

  /**
   * Method: POST
   * URL: /api/laboratory/blood-bank/requests
   * Purpose: Create blood request for a patient
   * Required permission: blood-bank:create
   * Request body: { personId, bloodGroup, unitsRequested, department, doctorLabel?, notes? }
   * Audit: blood-bank:request-create
   */
  @Post('requests')
  @RequirePermissions(PERMISSIONS.BLOOD_BANK_CREATE)
  async createRequest(@Body() dto: CreateBloodRequestDto, @CurrentUser() user: AuthUser) {
    return { data: await this.bloodBank.createRequest(dto, user) };
  }

  /**
   * Method: GET
   * URL: /api/laboratory/blood-bank/requests/:id
   * Purpose: Request detail + immutable event log
   * Required permission: blood-bank:read
   */
  @Get('requests/:id')
  @RequirePermissions(PERMISSIONS.BLOOD_BANK_READ)
  async getRequest(@Param('id', ParseIntPipe) id: number) {
    return { data: await this.bloodBank.getRequest(id) };
  }

  /**
   * Method: PATCH
   * URL: /api/laboratory/blood-bank/requests/:id/start-crossmatch
   * Purpose: Move request to Crossmatching
   * Required permission: blood-bank:update
   */
  @Patch('requests/:id/start-crossmatch')
  @RequirePermissions(PERMISSIONS.BLOOD_BANK_UPDATE)
  async startCrossmatch(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    return { data: await this.bloodBank.startCrossmatch(id, user) };
  }

  /**
   * Method: PATCH
   * URL: /api/laboratory/blood-bank/requests/:id/crossmatch
   * Purpose: Record Compatible | Incompatible | Pending result
   * Required permission: blood-bank:update
   * Request body: { result, bloodUnitId?, notes? }
   */
  @Patch('requests/:id/crossmatch')
  @RequirePermissions(PERMISSIONS.BLOOD_BANK_UPDATE)
  async recordCrossmatch(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RecordCrossmatchDto,
    @CurrentUser() user: AuthUser,
  ) {
    return { data: await this.bloodBank.recordCrossmatch(id, dto, user) };
  }

  /**
   * Method: PATCH
   * URL: /api/laboratory/blood-bank/requests/:id/issue
   * Purpose: Issue units (reserve→issued) after compatible crossmatch
   * Required permission: blood-bank:issue
   * Request body: { bloodUnitId?, notes? }
   */
  @Patch('requests/:id/issue')
  @RequirePermissions(PERMISSIONS.BLOOD_BANK_ISSUE)
  async issue(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: IssueBloodRequestDto,
    @CurrentUser() user: AuthUser,
  ) {
    return { data: await this.bloodBank.issueRequest(id, dto, user) };
  }

  /**
   * Method: PATCH
   * URL: /api/laboratory/blood-bank/requests/:id/reject
   * Purpose: Reject request with required reason
   * Required permission: blood-bank:update
   * Request body: { reason }
   */
  @Patch('requests/:id/reject')
  @RequirePermissions(PERMISSIONS.BLOOD_BANK_UPDATE)
  async reject(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RejectBloodRequestDto,
    @CurrentUser() user: AuthUser,
  ) {
    return { data: await this.bloodBank.rejectRequest(id, dto, user) };
  }

  /**
   * Method: PATCH
   * URL: /api/laboratory/blood-bank/requests/:id/complete
   * Purpose: Mark Issued request as transfusion completed
   * Required permission: blood-bank:update
   */
  @Patch('requests/:id/complete')
  @RequirePermissions(PERMISSIONS.BLOOD_BANK_UPDATE)
  async complete(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    return { data: await this.bloodBank.completeRequest(id, user) };
  }

  /**
   * Method: GET
   * URL: /api/laboratory/blood-bank/crossmatches?page=&limit=
   * Purpose: Crossmatch history
   * Required permission: blood-bank:read
   */
  @Get('crossmatches')
  @RequirePermissions(PERMISSIONS.BLOOD_BANK_READ)
  async listCrossmatches(@Query('page') page?: string, @Query('limit') limit?: string) {
    return {
      data: await this.bloodBank.listCrossmatches({
        page: page ? Number(page) : 1,
        limit: limit ? Number(limit) : 50,
      }),
    };
  }
}
