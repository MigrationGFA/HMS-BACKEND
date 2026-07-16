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
import {
  CreatePrescriptionDto,
  UpdatePrescriptionDto,
} from './dto/prescription.dto';
import { PrescriptionsService } from './prescriptions.service';

@Controller('prescriptions')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PrescriptionsController {
  constructor(private readonly prescriptionsService: PrescriptionsService) {}

  /**
   * Method: POST
   * URL: /api/prescriptions
   * Purpose: Create a prescription (optionally send immediately to pharmacy)
   * Required permission: prescription:create
   * Request body: CreatePrescriptionDto { personId, items[{ drugId, dose, frequency, quantity, ... }], send?, urgency?, diagnosis?, ... }
   * Response example: { data: { prescriptionId, rxNo, status: "Sent", items: [...], person: {...} } }
   * Error cases: 400 validation / unknown drug, 401 unauthorized, 403 missing permission, 404 person not found
   */
  @Post()
  @RequirePermissions(PERMISSIONS.PRESCRIPTION_CREATE)
  async create(
    @Body() dto: CreatePrescriptionDto,
    @CurrentUser() user: AuthUser,
  ) {
    const rx = await this.prescriptionsService.create(dto, user);
    return { data: rx };
  }

  /**
   * Method: GET
   * URL: /api/prescriptions?q=&status=&personId=&page=&limit=
   * Purpose: List prescriptions for doctor history or pharmacy inbound queue
   * Required permission: prescription:read
   * Request body: none
   * Response example: { data: { items: [...], meta: { page, limit, total } } }
   * Error cases: 401 unauthorized, 403 missing permission
   */
  @Get()
  @RequirePermissions(PERMISSIONS.PRESCRIPTION_READ)
  async list(
    @Query('q') q?: string,
    @Query('status') status?: string,
    @Query('personId') personId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const result = await this.prescriptionsService.list({
      q,
      status,
      personId: personId ? Number(personId) : undefined,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 50,
    });
    return { data: result };
  }

  /**
   * Method: GET
   * URL: /api/prescriptions/:id
   * Purpose: Prescription detail with items and patient summary
   * Required permission: prescription:read
   * Request body: none
   * Response example: { data: { prescriptionId, rxNo, items: [...], person: {...} } }
   * Error cases: 401, 403, 404
   */
  @Get(':id')
  @RequirePermissions(PERMISSIONS.PRESCRIPTION_READ)
  async findOne(@Param('id', ParseIntPipe) id: number) {
    const rx = await this.prescriptionsService.findById(id);
    return { data: rx };
  }

  /**
   * Method: PATCH
   * URL: /api/prescriptions/:id
   * Purpose: Update prescription status / payment / pharmacy notes
   * Required permission: prescription:update
   * Request body: UpdatePrescriptionDto (partial)
   * Response example: { data: { prescriptionId, status, paymentStatus, ... } }
   * Error cases: 400, 401, 403, 404
   */
  @Patch(':id')
  @RequirePermissions(PERMISSIONS.PRESCRIPTION_UPDATE)
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePrescriptionDto,
    @CurrentUser() user: AuthUser,
  ) {
    const rx = await this.prescriptionsService.update(id, dto, user);
    return { data: rx };
  }
}
