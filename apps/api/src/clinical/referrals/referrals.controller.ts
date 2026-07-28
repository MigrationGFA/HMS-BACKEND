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
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PERMISSIONS } from '../../common/constants';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import type { AuthUser } from '../../auth/types/auth-user.type';
import { ReferralsService } from './referrals.service';
import {
  AllocateReferralDto,
  CancelReferralDto,
  CompleteReferralDto,
  CreateReferralDto,
  NoteDto,
  ReasonDto,
  RouteReferralDto,
} from './dto/referral.dto';

@Controller('referrals')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ReferralsController {
  constructor(private readonly referrals: ReferralsService) {}

  /**
   * Method: POST
   * URL: /api/referrals
   * Purpose: Doctor creates/submits a clinical referral (no bed selection)
   * Required permission: referral:create
   * Request body: { personId, encounterId?, referralKind, careSetting?, priority?, fromDepartment?, toDepartment?, toDoctorUserId?, toDoctorLabel?, externalFacility?, externalContact?, externalAddress?, reason, provisionalDiagnosis?, clinicalSummary?, specificQuestion? }
   * Response: { data: referral }
   * Errors: 400, 401, 403, 404
   * Audit: referral:create
   */
  @Post()
  @RequirePermissions(PERMISSIONS.REFERRAL_CREATE)
  async create(@Body() dto: CreateReferralDto, @CurrentUser() user: AuthUser) {
    const data = await this.referrals.create(dto, user);
    return { data };
  }

  /**
   * Method: GET
   * URL: /api/referrals?scope=mine|inbound|all&status=&kind=&toDepartment=&careSetting=&personId=&q=&page=&limit=
   * Purpose: List clinical referrals with filters
   * Required permission: referral:read
   * Response: { data: { items, meta } }
   * Errors: 401, 403
   */
  @Get()
  @RequirePermissions(PERMISSIONS.REFERRAL_READ)
  async list(
    @CurrentUser() user: AuthUser,
    @Query('scope') scope?: string,
    @Query('status') status?: string,
    @Query('kind') kind?: string,
    @Query('toDepartment') toDepartment?: string,
    @Query('careSetting') careSetting?: string,
    @Query('personId') personId?: string,
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const data = await this.referrals.list(
      {
        scope,
        status,
        kind,
        toDepartment,
        careSetting,
        personId: personId ? Number(personId) : undefined,
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
   * URL: /api/referrals/:id
   * Purpose: Referral detail including immutable event log
   * Required permission: referral:read
   * Errors: 401, 403, 404
   */
  @Get(':id')
  @RequirePermissions(PERMISSIONS.REFERRAL_READ)
  async findOne(@Param('id', ParseIntPipe) id: number) {
    const data = await this.referrals.findOne(id);
    return { data };
  }

  /**
   * Method: PATCH
   * URL: /api/referrals/:id/ack
   * Purpose: Records acknowledge referral → UnderReview
   * Required permission: referral:update
   * Request body: { note? }
   * Errors: 401, 403, 404, 409
   */
  @Patch(':id/ack')
  @RequirePermissions(PERMISSIONS.REFERRAL_UPDATE)
  async ack(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: NoteDto,
    @CurrentUser() user: AuthUser,
  ) {
    const data = await this.referrals.ack(id, dto, user);
    return { data };
  }

  /**
   * Method: PATCH
   * URL: /api/referrals/:id/route
   * Purpose: Records route internal referral to destination department → QueuedForDept
   * Required permission: referral:update
   * Request body: { toDepartment?, toDoctorUserId?, toDoctorLabel?, note? }
   * Errors: 400, 401, 403, 404, 409
   */
  @Patch(':id/route')
  @RequirePermissions(PERMISSIONS.REFERRAL_UPDATE)
  async route(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RouteReferralDto,
    @CurrentUser() user: AuthUser,
  ) {
    const data = await this.referrals.route(id, dto, user);
    return { data };
  }

  /**
   * Method: PATCH
   * URL: /api/referrals/:id/request-bed
   * Purpose: Mark internal referral as needing inpatient bed → AwaitingBed
   * Required permission: referral:update
   * Request body: { note? }
   * Errors: 400, 401, 403, 404, 409
   */
  @Patch(':id/request-bed')
  @RequirePermissions(PERMISSIONS.REFERRAL_UPDATE)
  async requestBed(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: NoteDto,
    @CurrentUser() user: AuthUser,
  ) {
    const data = await this.referrals.requestBed(id, dto, user);
    return { data };
  }

  /**
   * Method: PATCH
   * URL: /api/referrals/:id/allocate
   * Purpose: Records/Nurse allocate ward + AVAILABLE bed → BedAllocated (Inpatient)
   * Required permission: referral:allocate
   * Request body: { wardId, bedId, note? }
   * Errors: 400, 401, 403, 404, 409
   */
  @Patch(':id/allocate')
  @RequirePermissions(PERMISSIONS.REFERRAL_ALLOCATE)
  async allocate(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AllocateReferralDto,
    @CurrentUser() user: AuthUser,
  ) {
    const data = await this.referrals.allocate(id, dto, user);
    return { data };
  }

  /**
   * Method: PATCH
   * URL: /api/referrals/:id/admit
   * Purpose: Confirm admission via AdmissionsService (link referral) → Admitted
   * Required permission: referral:allocate
   * Request body: { note? }
   * Errors: 400, 401, 403, 404, 409
   */
  @Patch(':id/admit')
  @RequirePermissions(PERMISSIONS.REFERRAL_ALLOCATE)
  async admit(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: NoteDto,
    @CurrentUser() user: AuthUser,
  ) {
    const data = await this.referrals.admit(id, dto, user);
    return { data };
  }

  /**
   * Method: PATCH
   * URL: /api/referrals/:id/accept
   * Purpose: Destination department/doctor accept → Accepted
   * Required permission: referral:receive
   * Request body: { note? }
   * Errors: 401, 403, 404, 409
   */
  @Patch(':id/accept')
  @RequirePermissions(PERMISSIONS.REFERRAL_RECEIVE)
  async accept(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: NoteDto,
    @CurrentUser() user: AuthUser,
  ) {
    const data = await this.referrals.accept(id, dto, user);
    return { data };
  }

  /**
   * Method: PATCH
   * URL: /api/referrals/:id/attend
   * Purpose: Start attendance → InAttendance
   * Required permission: referral:receive
   * Request body: { note? }
   * Errors: 401, 403, 404, 409
   */
  @Patch(':id/attend')
  @RequirePermissions(PERMISSIONS.REFERRAL_RECEIVE)
  async attend(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: NoteDto,
    @CurrentUser() user: AuthUser,
  ) {
    const data = await this.referrals.attend(id, dto, user);
    return { data };
  }

  /**
   * Method: PATCH
   * URL: /api/referrals/:id/complete
   * Purpose: Complete referral with optional outcome note → Completed
   * Required permission: referral:receive
   * Request body: { outcomeNote? }
   * Errors: 401, 403, 404, 409
   */
  @Patch(':id/complete')
  @RequirePermissions(PERMISSIONS.REFERRAL_RECEIVE)
  async complete(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CompleteReferralDto,
    @CurrentUser() user: AuthUser,
  ) {
    const data = await this.referrals.complete(id, dto, user);
    return { data };
  }

  /**
   * Method: PATCH
   * URL: /api/referrals/:id/clear-external
   * Purpose: Records external clearance (no bed) → ClearedExternal
   * Required permission: referral:update
   * Request body: { note? }
   * Errors: 400, 401, 403, 404, 409
   */
  @Patch(':id/clear-external')
  @RequirePermissions(PERMISSIONS.REFERRAL_UPDATE)
  async clearExternal(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: NoteDto,
    @CurrentUser() user: AuthUser,
  ) {
    const data = await this.referrals.clearExternal(id, dto, user);
    return { data };
  }

  /**
   * Method: PATCH
   * URL: /api/referrals/:id/return
   * Purpose: Return for more information → Returned
   * Required permission: referral:update
   * Request body: { reason }
   * Errors: 401, 403, 404, 409
   */
  @Patch(':id/return')
  @RequirePermissions(PERMISSIONS.REFERRAL_UPDATE)
  async returnForInfo(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReasonDto,
    @CurrentUser() user: AuthUser,
  ) {
    const data = await this.referrals.returnForInfo(id, dto, user);
    return { data };
  }

  /**
   * Method: PATCH
   * URL: /api/referrals/:id/reject
   * Purpose: Reject referral → Rejected (releases reserved bed if any)
   * Required permission: referral:update
   * Request body: { reason }
   * Errors: 401, 403, 404, 409
   */
  @Patch(':id/reject')
  @RequirePermissions(PERMISSIONS.REFERRAL_UPDATE)
  async reject(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReasonDto,
    @CurrentUser() user: AuthUser,
  ) {
    const data = await this.referrals.reject(id, dto, user);
    return { data };
  }

  /**
   * Method: PATCH
   * URL: /api/referrals/:id/cancel
   * Purpose: Cancel non-terminal referral
   * Required permission: referral:update
   * Request body: { reason? }
   * Errors: 401, 403, 404, 409
   */
  @Patch(':id/cancel')
  @RequirePermissions(PERMISSIONS.REFERRAL_UPDATE)
  async cancel(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CancelReferralDto,
    @CurrentUser() user: AuthUser,
  ) {
    const data = await this.referrals.cancel(id, dto, user);
    return { data };
  }
}
