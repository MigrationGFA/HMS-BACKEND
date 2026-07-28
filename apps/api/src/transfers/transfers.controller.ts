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
import { TransfersService } from './transfers.service';
import {
  AcceptTransferDto,
  AllocateTransferDto,
  CancelTransferDto,
  ConfirmArrivalDto,
  CreateTransferDto,
  DepartTransferDto,
  PrepareTransferDto,
  RejectTransferDto,
} from './dto/transfer.dto';

@Controller('transfers')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TransfersController {
  constructor(private readonly transfers: TransfersService) {}

  /**
   * Method: POST
   * URL: /api/transfers
   * Purpose: Doctor creates/submits a transfer request (no bed selection)
   * Required permission: transfer:create
   * Request body: { personId, admissionId?, transferType, priority?, fromWardId?, toWardId?, toWardPreference?, destinationLabel?, reason, clinicalNotes?, externalFacility?, skipPrepare? }
   * Response: { data: transfer }
   * Errors: 400, 401, 403, 404
   * Audit: transfer:create
   */
  @Post()
  @RequirePermissions(PERMISSIONS.TRANSFER_CREATE)
  async create(@Body() dto: CreateTransferDto, @CurrentUser() user: AuthUser) {
    const data = await this.transfers.create(dto, user);
    return { data };
  }

  /**
   * Method: GET
   * URL: /api/transfers?scope=mine|ward|all&status=&personId=&admissionId=&fromWardId=&toWardId=&q=&page=&limit=
   * Purpose: List patient transfers with filters
   * Required permission: transfer:read
   * Response: { data: { items, meta } }
   * Errors: 401, 403
   */
  @Get()
  @RequirePermissions(PERMISSIONS.TRANSFER_READ)
  async list(
    @CurrentUser() user: AuthUser,
    @Query('scope') scope?: string,
    @Query('status') status?: string,
    @Query('personId') personId?: string,
    @Query('admissionId') admissionId?: string,
    @Query('fromWardId') fromWardId?: string,
    @Query('toWardId') toWardId?: string,
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const data = await this.transfers.list(
      {
        scope,
        status,
        personId: personId ? Number(personId) : undefined,
        admissionId: admissionId ? Number(admissionId) : undefined,
        fromWardId: fromWardId ? Number(fromWardId) : undefined,
        toWardId: toWardId ? Number(toWardId) : undefined,
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
   * URL: /api/transfers/:id
   * Purpose: Transfer detail including immutable event log
   * Required permission: transfer:read
   * Errors: 401, 403, 404
   */
  @Get(':id')
  @RequirePermissions(PERMISSIONS.TRANSFER_READ)
  async findOne(@Param('id', ParseIntPipe) id: number) {
    const data = await this.transfers.findOne(id);
    return { data };
  }

  /**
   * Method: PATCH
   * URL: /api/transfers/:id/prepare
   * Purpose: Current ward nurse acknowledge / mark ready for bed allocation
   * Required permission: transfer:update
   * Request body: { note?, ready? }
   * Errors: 401, 403, 404, 409
   */
  @Patch(':id/prepare')
  @RequirePermissions(PERMISSIONS.TRANSFER_UPDATE)
  async prepare(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: PrepareTransferDto,
    @CurrentUser() user: AuthUser,
  ) {
    const data = await this.transfers.prepare(id, dto, user);
    return { data };
  }

  /**
   * Method: PATCH
   * URL: /api/transfers/:id/allocate
   * Purpose: Records or nurse allocate ward+bed (bed → RESERVED)
   * Required permission: transfer:allocate
   * Request body: { wardId, bedId, note? }
   * Errors: 400, 401, 403, 404, 409
   */
  @Patch(':id/allocate')
  @RequirePermissions(PERMISSIONS.TRANSFER_ALLOCATE)
  async allocate(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AllocateTransferDto,
    @CurrentUser() user: AuthUser,
  ) {
    const data = await this.transfers.allocate(id, dto, user);
    return { data };
  }

  /**
   * Method: PATCH
   * URL: /api/transfers/:id/accept
   * Purpose: Receiving ward nurse accepts reserved bed
   * Required permission: transfer:receive
   * Request body: { note? }
   * Errors: 401, 403, 404, 409
   */
  @Patch(':id/accept')
  @RequirePermissions(PERMISSIONS.TRANSFER_RECEIVE)
  async accept(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AcceptTransferDto,
    @CurrentUser() user: AuthUser,
  ) {
    const data = await this.transfers.accept(id, dto, user);
    return { data };
  }

  /**
   * Method: PATCH
   * URL: /api/transfers/:id/depart
   * Purpose: Current ward marks patient InTransit + handover notes
   * Required permission: transfer:update
   * Request body: { handoverNotes?, note? }
   * Errors: 401, 403, 404, 409
   */
  @Patch(':id/depart')
  @RequirePermissions(PERMISSIONS.TRANSFER_UPDATE)
  async depart(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: DepartTransferDto,
    @CurrentUser() user: AuthUser,
  ) {
    const data = await this.transfers.depart(id, dto, user);
    return { data };
  }

  /**
   * Method: PATCH
   * URL: /api/transfers/:id/confirm-arrival
   * Purpose: Receiving confirm → complete + occupy bed / update location
   * Required permission: transfer:receive
   * Request body: { note? }
   * Errors: 400, 401, 403, 404, 409
   */
  @Patch(':id/confirm-arrival')
  @RequirePermissions(PERMISSIONS.TRANSFER_RECEIVE)
  async confirmArrival(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ConfirmArrivalDto,
    @CurrentUser() user: AuthUser,
  ) {
    const data = await this.transfers.confirmArrival(id, dto, user);
    return { data };
  }

  /**
   * Method: PATCH
   * URL: /api/transfers/:id/reject
   * Purpose: Reject transfer with reason; release reserved bed
   * Required permission: transfer:update
   * Request body: { reason }
   * Errors: 401, 403, 404, 409
   */
  @Patch(':id/reject')
  @RequirePermissions(PERMISSIONS.TRANSFER_UPDATE)
  async reject(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RejectTransferDto,
    @CurrentUser() user: AuthUser,
  ) {
    const data = await this.transfers.reject(id, dto, user);
    return { data };
  }

  /**
   * Method: PATCH
   * URL: /api/transfers/:id/cancel
   * Purpose: Cancel if not completed / in transit
   * Required permission: transfer:update
   * Request body: { reason? }
   * Errors: 401, 403, 404, 409
   */
  @Patch(':id/cancel')
  @RequirePermissions(PERMISSIONS.TRANSFER_UPDATE)
  async cancel(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CancelTransferDto,
    @CurrentUser() user: AuthUser,
  ) {
    const data = await this.transfers.cancel(id, dto, user);
    return { data };
  }
}
