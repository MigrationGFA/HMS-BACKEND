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
import { CreateLabRequestDto } from './dto/lab.dto';
import { LaboratoryService } from './laboratory.service';

@Controller('laboratory/requests')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class LabRequestsController {
  constructor(private readonly laboratoryService: LaboratoryService) {}

  /**
   * Method: POST
   * URL: /api/laboratory/requests
   * Purpose: Create and send a lab request (PAYMENT_STATUS always Unpaid — cashier bills). source: Doctor | WalkIn
   * Required permission: lab:create
   * Request body: { personId, encounterId?, priority?, clinicalIndication?, clinicalNotes?, source?, items: [{ testId, lineNotes? }] }
   * Response example: { data: { labRequestId, requestNo, source, paymentStatus: "Unpaid", status: "Sent", items, totalAmount } }
   * Error cases: 400 invalid tests / encounter mismatch, 401, 403, 404 patient
   * Audit: lab:request-create
   */
  @Post()
  @RequirePermissions(PERMISSIONS.LAB_CREATE)
  async create(
    @Body() dto: CreateLabRequestDto,
    @CurrentUser() user: AuthUser,
  ) {
    const request = await this.laboratoryService.createRequest(dto, user);
    return { data: request };
  }

  /**
   * Method: GET
   * URL: /api/laboratory/requests?personId=&encounterId=&status=&paymentStatus=&source=&workQueue=&q=&page=&limit=
   * Purpose: List lab requests (includes Unpaid). Optional workQueue=true → Paid/Waived only. LAB unpaid rows are redacted.
   * Required permission: lab:read
   * Request body: none
   * Response example: { data: { items: [{ paymentCleared, processingLocked, ... }], meta } }
   * Error cases: 401, 403
   */
  @Get()
  @RequirePermissions(PERMISSIONS.LAB_READ)
  async list(
    @CurrentUser() user: AuthUser,
    @Query('personId') personId?: string,
    @Query('encounterId') encounterId?: string,
    @Query('status') status?: string,
    @Query('paymentStatus') paymentStatus?: string,
    @Query('source') source?: string,
    @Query('workQueue') workQueue?: string,
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const result = await this.laboratoryService.listRequests(
      {
        personId: personId ? Number(personId) : undefined,
        encounterId: encounterId ? Number(encounterId) : undefined,
        status,
        paymentStatus,
        source,
        workQueue: workQueue === 'true' || workQueue === '1',
        q,
        page: page ? Number(page) : 1,
        limit: limit ? Number(limit) : 50,
      },
      user,
    );
    return { data: result };
  }

  /**
   * Method: GET
   * URL: /api/laboratory/requests/:id
   * Purpose: Lab request detail with items and person. LAB role receives redacted clinical fields when unpaid (`processingLocked`).
   * Required permission: lab:read
   * Request body: none
   * Response example: { data: { labRequestId, requestNo, source, paymentCleared, processingLocked, items, person, paymentStatus } }
   * Error cases: 401, 403, 404
   */
  @Get(':id')
  @RequirePermissions(PERMISSIONS.LAB_READ)
  async findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
  ) {
    const request = await this.laboratoryService.findRequestById(id, user);
    return { data: request };
  }

  /**
   * Method: POST
   * URL: /api/laboratory/requests/:id/cancel
   * Purpose: Cancel an unpaid lab request
   * Required permission: lab:update
   * Request body: none
   * Response example: { data: { labRequestId, status: "Cancelled" } }
   * Error cases: 400 already cancelled/paid, 401, 403, 404
   * Audit: lab:request-cancel
   */
  @Post(':id/cancel')
  @RequirePermissions(PERMISSIONS.LAB_UPDATE)
  async cancel(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
  ) {
    const request = await this.laboratoryService.cancelRequest(id, user);
    return { data: request };
  }
}
