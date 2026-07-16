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
import { CreatePersonDto } from '../patients/dto/create-person.dto';
import { UpdatePersonDto } from '../patients/dto/update-person.dto';
import { RecordsService } from './records.service';

/**
 * Patient Entry Engine endpoints under /api/records.
 * Used by /hms/identity for create-after-NOK, payment gate, and continuation queue.
 */
@Controller('records')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class RecordsController {
  constructor(private readonly recordsService: RecordsService) {}

  /**
   * Method: GET
   * URL: /api/records/dashboard-stats?timezoneOffsetMinutes=60
   * Purpose: Live summary cards on Patient Entry Engine (/hms/identity)
   * Required permission: patient:read
   * Request body: none
   * Response example: {
   *   data: {
   *     asOf, totalToday, newToday, returningToday, walkInToday,
   *     emergencyToday, pendingRegistration, awaitingTriage, awaitingConsultation
   *   }
   * }
   * Error cases: 401, 403
   */
  @Get('dashboard-stats')
  @RequirePermissions(PERMISSIONS.PATIENT_READ)
  async dashboardStats(
    @Query('timezoneOffsetMinutes') timezoneOffsetMinutes?: string,
  ) {
    const result = await this.recordsService.dashboardStats({
      timezoneOffsetMinutes: timezoneOffsetMinutes
        ? Number(timezoneOffsetMinutes)
        : undefined,
    });
    return { data: result };
  }

  /**
   * Method: GET
   * URL: /api/records/directory-stats?timezoneOffsetMinutes=60
   * Purpose: Summary cards on Patient Directory (/records/directory)
   * Required permission: patient:read
   * Request body: none
   * Response example: { data: { totalPatients, newThisMonth, active, inpatients, outpatients, hmoNhia, incompleteProfiles, duplicatesFlagged } }
   * Error cases: 401, 403
   */
  @Get('directory-stats')
  @RequirePermissions(PERMISSIONS.PATIENT_READ)
  async directoryStats(
    @Query('timezoneOffsetMinutes') timezoneOffsetMinutes?: string,
  ) {
    const result = await this.recordsService.directoryStats({
      timezoneOffsetMinutes: timezoneOffsetMinutes
        ? Number(timezoneOffsetMinutes)
        : undefined,
    });
    return { data: result };
  }

  /**
   * Method: GET
   * URL: /api/records/directory?q=&sex=&insurance=&page=&limit=
   * Purpose: Patient Directory searchable list
   * Required permission: patient:read
   * Request body: none
   * Response example: { data: { items: [...], meta } }
   * Error cases: 401, 403
   */
  @Get('directory')
  @RequirePermissions(PERMISSIONS.PATIENT_READ)
  async directory(
    @Query('q') q?: string,
    @Query('sex') sex?: string,
    @Query('insurance') insurance?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const result = await this.recordsService.directory({
      q,
      sex,
      insurance,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 50,
    });
    return { data: result };
  }

  /**
   * Method: GET
   * URL: /api/records/audit-stats?timezoneOffsetMinutes=60
   * Purpose: Summary cards on Records Audit Trail (/records/audit)
   * Required permission: audit:read
   * Request body: none
   * Response example: { data: { activitiesToday, created, edited, uploaded, printed, deleted, suspicious } }
   * Error cases: 401, 403
   */
  @Get('audit-stats')
  @RequirePermissions(PERMISSIONS.AUDIT_READ)
  async auditStats(
    @Query('timezoneOffsetMinutes') timezoneOffsetMinutes?: string,
  ) {
    const result = await this.recordsService.auditStats({
      timezoneOffsetMinutes: timezoneOffsetMinutes
        ? Number(timezoneOffsetMinutes)
        : undefined,
    });
    return { data: result };
  }

  /**
   * Method: GET
   * URL: /api/records/audit?q=&type=&status=&page=&limit=
   * Purpose: Records Audit Trail table
   * Required permission: audit:read
   * Request body: none
   * Response example: { data: { items: [{ auditId, time, officer, action, hospitalId, patient, module, status }], meta } }
   * Error cases: 401, 403
   */
  @Get('audit')
  @RequirePermissions(PERMISSIONS.AUDIT_READ)
  async auditTrail(
    @Query('q') q?: string,
    @Query('type') type?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const result = await this.recordsService.auditTrail({
      q,
      type,
      status,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 50,
    });
    return { data: result };
  }

  /**
   * Method: POST
   * URL: /api/records/registrations
   * Purpose: Create patient (PERSONS) + registration card (PATIENT_CARDS, payment Pending) after Next of Kin
   * Required permission: patient:create
   * Request body: CreatePersonDto
   * Response example: { data: { personId, hospitalNo, status: "Pending Payment", card: { cardId, paymentStatus: "Pending", totalAmount } } }
   * Error cases: 400 validation, 401, 403, 409 duplicate identity/phone+name
   */
  @Post('registrations')
  @RequirePermissions(PERMISSIONS.PATIENT_CREATE)
  async createRegistration(
    @Body() dto: CreatePersonDto,
    @CurrentUser() user: AuthUser,
  ) {
    const person = await this.recordsService.createRegistration(dto, user);
    return { data: person };
  }

  /**
   * Method: GET
   * URL: /api/records/registrations?paymentStatus=&q=&page=&limit=
   * Purpose: Patient Entry Engine registration queue (pending payment / paid-ready to continue)
   * Required permission: card:read
   * Request body: none
   * Response example: { data: { items: [{ cardId, personId, cardNo, paymentStatus, totalAmount, person }], meta } }
   * Error cases: 401, 403
   */
  @Get('registrations')
  @RequirePermissions(PERMISSIONS.CARD_READ)
  async registrationQueue(
    @Query('paymentStatus') paymentStatus?: string,
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const result = await this.recordsService.registrationQueue({
      paymentStatus,
      q,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 50,
    });
    return { data: result };
  }

  /**
   * Method: GET
   * URL: /api/records/registrations/:personId
   * Purpose: Load person + card for continuing registration from the queue
   * Required permission: patient:read
   * Request body: none
   * Response example: { data: { person, card, paymentCleared } }
   * Error cases: 401, 403, 404
   */
  @Get('registrations/:personId')
  @RequirePermissions(PERMISSIONS.PATIENT_READ)
  async getRegistration(@Param('personId', ParseIntPipe) personId: number) {
    const result = await this.recordsService.getRegistration(personId);
    return { data: result };
  }

  /**
   * Method: GET
   * URL: /api/records/cards/:cardId/payment-status
   * Purpose: Check whether a registration card has been paid
   * Required permission: card:read
   * Request body: none
   * Response example: { data: { card: {...}, paymentCleared: true|false } }
   * Error cases: 401, 403, 404
   */
  @Get('cards/:cardId/payment-status')
  @RequirePermissions(PERMISSIONS.CARD_READ)
  async paymentStatusByCard(
    @Param('cardId', ParseIntPipe) cardId: number,
  ) {
    const result = await this.recordsService.paymentStatusByCardId(cardId);
    return { data: result };
  }

  /**
   * Method: GET
   * URL: /api/records/persons/:personId/payment-status
   * Purpose: Check whether the person's latest registration card has been paid
   * Required permission: card:read
   * Request body: none
   * Response example: { data: { card: {...}, paymentCleared: true|false } }
   * Error cases: 401, 403, 404 no card
   */
  @Get('persons/:personId/payment-status')
  @RequirePermissions(PERMISSIONS.CARD_READ)
  async paymentStatusByPerson(
    @Param('personId', ParseIntPipe) personId: number,
  ) {
    const result =
      await this.recordsService.paymentStatusByPersonId(personId);
    return { data: result };
  }

  /**
   * Method: PATCH
   * URL: /api/records/registrations/:personId/complete
   * Purpose: Complete registration after payment (medical details + Active)
   * Required permission: patient:update
   * Request body: UpdatePersonDto (partial; status defaults to Active)
   * Response example: { data: { personId, hospitalNo, status: "Active", ... } }
   * Error cases: 400, 401, 403, 404, 409 if card payment still Pending
   */
  @Patch('registrations/:personId/complete')
  @RequirePermissions(PERMISSIONS.PATIENT_UPDATE)
  async completeRegistration(
    @Param('personId', ParseIntPipe) personId: number,
    @Body() dto: UpdatePersonDto,
    @CurrentUser() user: AuthUser,
  ) {
    const person = await this.recordsService.completeRegistration(
      personId,
      dto,
      user,
    );
    return { data: person };
  }
}
