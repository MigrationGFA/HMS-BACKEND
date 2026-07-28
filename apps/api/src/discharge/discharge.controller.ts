import {
  Body,
  Controller,
  ForbiddenException,
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
import { DischargeService } from './discharge.service';
import {
  CancelDischargeDraftDto,
  CreateDischargeDraftDto,
  NoteDto,
  ReasonDto,
  UpdateDischargeDraftDto,
} from './dto/discharge-draft.dto';

@Controller('discharge-drafts')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class DischargeController {
  constructor(private readonly discharge: DischargeService) {}

  /**
   * Method: POST
   * URL: /api/discharge-drafts
   * Purpose: Doctor creates a discharge draft for an admission
   * Required permission: discharge:create
   * Request body: { admissionId, dischargeType?, clinical fields… }
   * Response: { data: draft }
   * Errors: 400, 401, 403, 404, 409
   * Audit: discharge:create
   */
  @Post()
  @RequirePermissions(PERMISSIONS.DISCHARGE_CREATE)
  async create(
    @Body() dto: CreateDischargeDraftDto,
    @CurrentUser() user: AuthUser,
  ) {
    const data = await this.discharge.create(dto, user);
    return { data };
  }

  /**
   * Method: GET
   * URL: /api/discharge-drafts?scope=mine|queue|all&status=&personId=&admissionId=&q=&page=&limit=
   * Purpose: List discharge drafts
   * Required permission: discharge:read
   * Response: { data: { items, meta } }
   */
  @Get()
  @RequirePermissions(PERMISSIONS.DISCHARGE_READ)
  async list(
    @CurrentUser() user: AuthUser,
    @Query('scope') scope?: string,
    @Query('status') status?: string,
    @Query('personId') personId?: string,
    @Query('admissionId') admissionId?: string,
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const data = await this.discharge.list(
      {
        scope,
        status,
        personId: personId ? Number(personId) : undefined,
        admissionId: admissionId ? Number(admissionId) : undefined,
        q,
        page: page ? Number(page) : 1,
        limit: limit ? Number(limit) : 50,
      },
      user,
    );
    return { data };
  }

  /**
   * Method: GET
   * URL: /api/discharge-drafts/:id
   * Purpose: Draft detail + events + payment snapshot
   * Required permission: discharge:read
   */
  @Get(':id')
  @RequirePermissions(PERMISSIONS.DISCHARGE_READ)
  async findOne(@Param('id', ParseIntPipe) id: number) {
    const data = await this.discharge.findOne(id);
    return { data };
  }

  /**
   * Method: GET
   * URL: /api/discharge-drafts/:id/payment-status
   * Purpose: Aggregate unpaid bills for the draft patient
   * Required permission: discharge:read
   */
  @Get(':id/payment-status')
  @RequirePermissions(PERMISSIONS.DISCHARGE_READ)
  async paymentStatus(@Param('id', ParseIntPipe) id: number) {
    const data = await this.discharge.paymentStatus(id);
    return { data };
  }

  /**
   * Method: PATCH
   * URL: /api/discharge-drafts/:id
   * Purpose: Update draft fields (Draft/Returned only)
   * Required permission: discharge:update
   */
  @Patch(':id')
  @RequirePermissions(PERMISSIONS.DISCHARGE_UPDATE)
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateDischargeDraftDto,
    @CurrentUser() user: AuthUser,
  ) {
    const data = await this.discharge.update(id, dto, user);
    return { data };
  }

  /**
   * Method: PATCH
   * URL: /api/discharge-drafts/:id/submit
   * Purpose: Submit draft → AwaitingPayment and order-discharge on admission
   * Required permission: discharge:update
   * Request body: { note? }
   */
  @Patch(':id/submit')
  @RequirePermissions(PERMISSIONS.DISCHARGE_UPDATE)
  async submit(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: NoteDto,
    @CurrentUser() user: AuthUser,
  ) {
    const data = await this.discharge.submit(id, dto, user);
    return { data };
  }

  /**
   * Method: PATCH
   * URL: /api/discharge-drafts/:id/clear-payment
   * Purpose: Cashier marks PaymentCleared when unpaid count is 0
   * Required permission: discharge:clear-payment
   */
  @Patch(':id/clear-payment')
  @RequirePermissions(PERMISSIONS.DISCHARGE_CLEAR_PAYMENT)
  async clearPayment(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: NoteDto,
    @CurrentUser() user: AuthUser,
  ) {
    const data = await this.discharge.clearPayment(id, dto, user);
    return { data };
  }

  /**
   * Method: PATCH
   * URL: /api/discharge-drafts/:id/return
   * Purpose: Return draft to doctor { reason }
   * Required permission: discharge:update
   */
  @Patch(':id/return')
  @RequirePermissions(PERMISSIONS.DISCHARGE_UPDATE)
  async returnForInfo(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReasonDto,
    @CurrentUser() user: AuthUser,
  ) {
    const data = await this.discharge.returnForInfo(id, dto, user);
    return { data };
  }

  /**
   * Method: PATCH
   * URL: /api/discharge-drafts/:id/finalize
   * Purpose: Records final discharge → complete admission + Discharged
   * Required permission: discharge:finalize
   */
  @Patch(':id/finalize')
  @RequirePermissions(PERMISSIONS.DISCHARGE_FINALIZE)
  async finalize(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: NoteDto,
    @CurrentUser() user: AuthUser,
  ) {
    const data = await this.discharge.finalize(id, dto, user);
    return { data };
  }

  /**
   * Method: PATCH
   * URL: /api/discharge-drafts/:id/cancel
   * Purpose: Cancel non-finalized draft
   * Required permission: discharge:update
   */
  @Patch(':id/cancel')
  @RequirePermissions(PERMISSIONS.DISCHARGE_UPDATE)
  async cancel(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CancelDischargeDraftDto,
    @CurrentUser() user: AuthUser,
  ) {
    const data = await this.discharge.cancel(id, dto, user);
    return { data };
  }
}

/** Legacy empty path — redirect clients to discharge-drafts. */
@Controller('discharge')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class DischargeLegacyController {
  @Get()
  @RequirePermissions(PERMISSIONS.DISCHARGE_READ)
  legacy() {
    throw new ForbiddenException(
      'Use /api/discharge-drafts for discharge workflow',
    );
  }
}
