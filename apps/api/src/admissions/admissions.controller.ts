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
import { AdmissionsService } from './admissions.service';
import { AdmissionBillsService } from './admission-bills.service';
import {
  CompleteDischargeDto,
  CreateAdmissionDto,
  CreateWardDto,
  OrderDischargeDto,
  TransferAdmissionDto,
} from './dto/admission.dto';

@Controller('admissions')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AdmissionsController {
  constructor(
    private readonly admissionsService: AdmissionsService,
    private readonly billsService: AdmissionBillsService,
  ) {}

  /**
   * Method: GET
   * URL: /api/admissions/stats
   * Purpose: Inpatient overview counts
   * Required permission: admission:read
   */
  @Get('stats')
  @RequirePermissions(PERMISSIONS.ADMISSION_READ)
  async stats() {
    const data = await this.admissionsService.stats();
    return { data };
  }

  /**
   * Method: GET
   * URL: /api/admissions/billing-items
   * Purpose: Active admission package catalogue (finance-configured prices)
   * Required permission: admission:read
   * Response: { data: { items: [{ itemCode, name, category, unitPrice }] } }
   * Errors: 401, 403
   */
  @Get('billing-items')
  @RequirePermissions(PERMISSIONS.ADMISSION_READ)
  async billingItems() {
    const data = await this.billsService.listBillingItems();
    return { data };
  }

  /**
   * Method: GET
   * URL: /api/admissions/wards?status=Active&personSex=Male|Female&q=
   * Purpose: List wards with bed counts (must be declared before :id)
   * Required permission: admission:read
   * Response: { data: { items: [{ wardId, code, name, gender, availableBeds, … }] } }
   * Errors: 401, 403
   */
  @Get('wards')
  @RequirePermissions(PERMISSIONS.ADMISSION_READ)
  async listWards(
    @Query('status') status?: string,
    @Query('personSex') personSex?: string,
    @Query('q') q?: string,
  ) {
    const result = await this.admissionsService.listWards({
      status,
      personSex,
      q,
    });
    return { data: result };
  }

  /**
   * Method: POST
   * URL: /api/admissions/wards
   * Purpose: Create ward (+ optional AVAILABLE beds)
   * Required permission: admission:create
   * Request body: CreateWardDto
   * Response: { data: { wardId, code, name, bedsCreated, … } }
   * Errors: 400, 409, 401, 403
   */
  @Post('wards')
  @RequirePermissions(PERMISSIONS.ADMISSION_CREATE)
  async createWard(@Body() dto: CreateWardDto, @CurrentUser() user: AuthUser) {
    const row = await this.admissionsService.createWard(dto, user);
    return { data: row };
  }

  /**
   * Method: GET
   * URL: /api/admissions/beds?wardId=&status=
   * Purpose: List beds (must be declared before :id)
   * Required permission: admission:read
   * Response: { data: { items: [{ bedId, wardId, label, status, … }] } }
   * Errors: 401, 403
   */
  @Get('beds')
  @RequirePermissions(PERMISSIONS.ADMISSION_READ)
  async listBeds(
    @Query('wardId') wardId?: string,
    @Query('status') status?: string,
  ) {
    const parsed =
      wardId != null && wardId !== '' && Number.isFinite(Number(wardId))
        ? Number(wardId)
        : undefined;
    const result = await this.admissionsService.listBeds({
      wardId: parsed,
      status,
    });
    return { data: result };
  }

  /**
   * Method: GET
   * URL: /api/admissions?status=&wardId=&q=&page=&limit=
   * Purpose: List admissions with person / ward / bed
   * Required permission: admission:read
   */
  @Get()
  @RequirePermissions(PERMISSIONS.ADMISSION_READ)
  async list(
    @Query('status') status?: string,
    @Query('wardId') wardId?: string,
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const result = await this.admissionsService.list({
      status,
      wardId: wardId ? Number(wardId) : undefined,
      q,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 50,
    });
    return { data: result };
  }

  /**
   * Method: GET
   * URL: /api/admissions/:id
   * Purpose: Admission detail
   * Required permission: admission:read
   */
  @Get(':id')
  @RequirePermissions(PERMISSIONS.ADMISSION_READ)
  async findOne(@Param('id', ParseIntPipe) id: number) {
    const row = await this.admissionsService.findById(id);
    return { data: row };
  }

  /**
   * Method: POST
   * URL: /api/admissions
   * Purpose: Admit person to a bed (occupies bed)
   * Required permission: admission:create
   */
  @Post()
  @RequirePermissions(PERMISSIONS.ADMISSION_CREATE)
  async admit(
    @Body() dto: CreateAdmissionDto,
    @CurrentUser() user: AuthUser,
  ) {
    const row = await this.admissionsService.admit(dto, user);
    return { data: row };
  }

  /**
   * Method: PATCH
   * URL: /api/admissions/:id/transfer
   * Purpose: Move patient to another bed
   * Required permission: admission:update
   */
  @Patch(':id/transfer')
  @RequirePermissions(PERMISSIONS.ADMISSION_UPDATE)
  async transfer(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: TransferAdmissionDto,
    @CurrentUser() user: AuthUser,
  ) {
    const row = await this.admissionsService.transfer(id, dto, user);
    return { data: row };
  }

  /**
   * Method: PATCH
   * URL: /api/admissions/:id/order-discharge
   * Purpose: Mark discharge ordered
   * Required permission: admission:update
   */
  @Patch(':id/order-discharge')
  @RequirePermissions(PERMISSIONS.ADMISSION_UPDATE)
  async orderDischarge(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: OrderDischargeDto,
    @CurrentUser() user: AuthUser,
  ) {
    const row = await this.admissionsService.orderDischarge(id, dto, user);
    return { data: row };
  }

  /**
   * Method: PATCH
   * URL: /api/admissions/:id/complete-discharge
   * Purpose: DEPRECATED for direct use — finalize via /api/discharge-drafts/:id/finalize
   * Required permission: discharge:finalize
   * Request body: { reason? }
   * Errors: 401, 403, 404, 409
   */
  @Patch(':id/complete-discharge')
  @RequirePermissions(PERMISSIONS.DISCHARGE_FINALIZE)
  async completeDischarge(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CompleteDischargeDto,
    @CurrentUser() user: AuthUser,
  ) {
    const row = await this.admissionsService.completeDischarge(id, dto, user);
    return { data: row };
  }
}
