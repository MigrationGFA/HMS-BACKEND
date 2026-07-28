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
  DispensePrescriptionDto,
  EmergencyDispensePrescriptionDto,
  CreateExternalPrescriptionDto,
  StopPrescriptionItemDto,
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
   * URL: /api/prescriptions/medications?personId=&scope=active|stopped|external|history
   * Purpose: Active / stopped / external / history medication lines for a patient
   * Required permission: prescription:read
   */
  @Get('medications')
  @RequirePermissions(PERMISSIONS.PRESCRIPTION_READ)
  async medications(
    @Query('personId') personId?: string,
    @Query('scope') scope?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const data = await this.prescriptionsService.listMedications({
      personId: personId ? Number(personId) : 0,
      scope,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 100,
    });
    return { data };
  }

  /**
   * Method: GET
   * URL: /api/prescriptions/external?personId=
   * Purpose: List external purchase prescriptions
   * Required permission: prescription:read
   */
  @Get('external')
  @RequirePermissions(PERMISSIONS.PRESCRIPTION_READ)
  async listExternal(
    @Query('personId') personId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const data = await this.prescriptionsService.listExternal({
      personId: personId ? Number(personId) : undefined,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 50,
    });
    return { data };
  }

  /**
   * Method: POST
   * URL: /api/prescriptions/external
   * Purpose: Log an external drug purchase for a patient
   * Required permission: prescription:create
   */
  @Post('external')
  @RequirePermissions(PERMISSIONS.PRESCRIPTION_CREATE)
  async createExternal(
    @Body() dto: CreateExternalPrescriptionDto,
    @CurrentUser() user: AuthUser,
  ) {
    const data = await this.prescriptionsService.createExternal(dto, user);
    return { data };
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
    @Query('paymentStatus') paymentStatus?: string,
    @Query('personId') personId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const result = await this.prescriptionsService.list({
      q,
      status,
      paymentStatus,
      personId: personId ? Number(personId) : undefined,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 50,
    });
    return { data: result };
  }

  /**
   * Method: GET
   * URL: /api/prescriptions/by-rx/:rxNo
   * Purpose: Load prescription by human Rx number (e.g. RX-2026-0001) for pharmacy detail/dispense
   * Required permission: prescription:read
   * Request body: none
   * Response example: { data: { prescriptionId, rxNo, items, person, auditTrail } }
   * Error cases: 401, 403, 404
   */
  @Get('by-rx/:rxNo')
  @RequirePermissions(PERMISSIONS.PRESCRIPTION_READ)
  async findByRxNo(@Param('rxNo') rxNo: string) {
    const rx = await this.prescriptionsService.findByRxNo(rxNo);
    return { data: rx };
  }

  /**
   * Method: GET
   * URL: /api/prescriptions/:id
   * Purpose: Prescription detail with items, person summary, and audit trail
   * Required permission: prescription:read
   * Request body: none
   * Response example: { data: { prescriptionId, rxNo, items: [...], person: {...}, auditTrail: [...] } }
   * Error cases: 401, 403, 404
   */
  @Get(':id')
  @RequirePermissions(PERMISSIONS.PRESCRIPTION_READ)
  async findOne(@Param('id', ParseIntPipe) id: number) {
    const rx = await this.prescriptionsService.findById(id);
    return { data: rx };
  }

  /**
   * Method: POST
   * URL: /api/prescriptions/:id/items/:itemId/stop
   * Purpose: Stop an active medication line
   * Required permission: prescription:update
   * Request body: { reason, comment? }
   */
  @Post(':id/items/:itemId/stop')
  @RequirePermissions(PERMISSIONS.PRESCRIPTION_UPDATE)
  async stopItem(
    @Param('id', ParseIntPipe) id: number,
    @Param('itemId', ParseIntPipe) itemId: number,
    @Body() dto: StopPrescriptionItemDto,
    @CurrentUser() user: AuthUser,
  ) {
    const data = await this.prescriptionsService.stopItem(id, itemId, dto, user);
    return { data };
  }

  /**
   * Method: POST
   * URL: /api/prescriptions/:id/refill
   * Purpose: Clone a Sent/Dispensed Rx as a new Sent prescription
   * Required permission: prescription:create
   */
  @Post(':id/refill')
  @RequirePermissions(PERMISSIONS.PRESCRIPTION_CREATE)
  async refill(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
  ) {
    const data = await this.prescriptionsService.refill(id, user);
    return { data };
  }

  /**
   * Method: POST
   * URL: /api/prescriptions/:id/dispense
   * Purpose: Dispense prescription (FEFO batch stock deduction + mark Dispensed). Requires Paid, Waived, or Emergency payment status.
   * Required permission: pharmacy:dispense
   * Request body: DispensePrescriptionDto { items?: [{ itemId, quantity? }], pharmacyNotes? }
   * Response example: { data: { prescriptionId, rxNo, status: "Dispensed", dispensedBy, items, auditTrail } }
   * Error cases: 400 unpaid / insufficient stock / already dispensed, 401, 403, 404
   */
  @Post(':id/dispense')
  @RequirePermissions(PERMISSIONS.PHARMACY_DISPENSE)
  async dispense(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: DispensePrescriptionDto,
    @CurrentUser() user: AuthUser,
  ) {
    const rx = await this.prescriptionsService.dispense(id, dto ?? {}, user);
    return { data: rx };
  }

  /**
   * Method: POST
   * URL: /api/prescriptions/:id/emergency-dispense
   * Purpose: Emergency unpaid dispense — records receiver staff name; leaves PAYMENT_STATUS=Emergency for later cashier collection
   * Required permission: pharmacy:dispense
   * Request body: { receivedBy, note?, items?, pharmacyNotes? }
   * Response example: { data: { prescriptionId, paymentStatus: "Emergency", emergencyReceivedBy, status: "Dispensed", ... } }
   * Error cases: 400 already paid / missing receivedBy / stock, 401, 403, 404
   */
  @Post(':id/emergency-dispense')
  @RequirePermissions(PERMISSIONS.PHARMACY_DISPENSE)
  async emergencyDispense(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: EmergencyDispensePrescriptionDto,
    @CurrentUser() user: AuthUser,
  ) {
    const rx = await this.prescriptionsService.emergencyDispense(id, dto, user);
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
