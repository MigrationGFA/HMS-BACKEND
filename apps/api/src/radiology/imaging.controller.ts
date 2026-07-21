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
import { RadiologyService } from './radiology.service';
import {
  CreateImagingRequestDto,
  UpdateImagingRequestDto,
} from './dto/imaging.dto';

@Controller('radiology/imaging')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ImagingController {
  constructor(private readonly radiologyService: RadiologyService) {}

  /**
   * Method: GET
   * URL: /api/radiology/imaging/studies?modality=&status=Active&q=
   * Purpose: Priced imaging study catalog for doctors (and radiology)
   * Required permission: imaging:read
   * Response: { data: { items: [{ imagingStudyId, studyCode, name, modality, unitPrice, … }] } }
   * Errors: 401, 403
   */
  @Get('studies')
  @RequirePermissions(PERMISSIONS.IMAGING_READ)
  async listStudies(
    @Query('modality') modality?: string,
    @Query('status') status?: string,
    @Query('q') q?: string,
  ) {
    const data = await this.radiologyService.listStudies({ modality, status, q });
    return { data };
  }

  /**
   * Method: POST
   * URL: /api/radiology/imaging/requests
   * Purpose: Doctor imaging request — always Unpaid; cashier collects configured study prices
   * Required permission: imaging:create
   * Request body: { personId, encounterId?, priority?, clinicalIndication?, clinicalNotes?, contrast?, source?, items: [{ studyId, lineNotes? }] }
   * Response: { data: { imagingRequestId, requestNo, paymentStatus: "Unpaid", totalAmount, items, … } }
   * Errors: 400 invalid studies, 401, 403, 404 patient
   * Audit: imaging:request-create
   */
  @Post('requests')
  @RequirePermissions(PERMISSIONS.IMAGING_CREATE)
  async createRequest(
    @Body() dto: CreateImagingRequestDto,
    @CurrentUser() user: AuthUser,
  ) {
    const data = await this.radiologyService.createRequest(dto, user);
    return { data };
  }

  /**
   * Method: GET
   * URL: /api/radiology/imaging/requests?personId=&status=&paymentStatus=&workQueue=&q=&page=&limit=
   * Purpose: List imaging requests. workQueue=true → Paid/Waived only (radiology attend queue)
   * Required permission: imaging:read
   * Response: { data: { items: [{ paymentCleared, processingLocked, … }], meta } }
   * Errors: 401, 403
   */
  @Get('requests')
  @RequirePermissions(PERMISSIONS.IMAGING_READ)
  async listRequests(
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
    const data = await this.radiologyService.listRequests(
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
    return { data };
  }

  /**
   * Method: GET
   * URL: /api/radiology/imaging/requests/:id
   * Purpose: Imaging request detail
   * Required permission: imaging:read
   * Errors: 401, 403, 404
   */
  @Get('requests/:id')
  @RequirePermissions(PERMISSIONS.IMAGING_READ)
  async findOne(@Param('id', ParseIntPipe) id: number) {
    const data = await this.radiologyService.findRequestById(id);
    return { data };
  }

  /**
   * Method: PATCH
   * URL: /api/radiology/imaging/requests/:id
   * Purpose: Accept / reject / schedule (Accept/Schedule blocked until Paid)
   * Required permission: imaging:update
   * Request body: { status?, rejectionReason? }
   * Errors: 400 payment required, 401, 403, 404
   */
  @Patch('requests/:id')
  @RequirePermissions(PERMISSIONS.IMAGING_UPDATE)
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateImagingRequestDto,
    @CurrentUser() user: AuthUser,
  ) {
    const data = await this.radiologyService.updateRequest(id, dto, user);
    return { data };
  }

  /**
   * Method: POST
   * URL: /api/radiology/imaging/requests/:id/cancel
   * Purpose: Cancel unpaid imaging request
   * Required permission: imaging:update
   * Errors: 400 paid/already cancelled, 401, 403, 404
   */
  @Post('requests/:id/cancel')
  @RequirePermissions(PERMISSIONS.IMAGING_UPDATE)
  async cancel(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
  ) {
    const data = await this.radiologyService.cancelRequest(id, user);
    return { data };
  }
}
