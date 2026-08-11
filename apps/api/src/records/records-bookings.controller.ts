import {
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
import { AppointmentsService } from '../appointments/appointments.service';
import { RecordsService } from './records.service';

/**
 * Staff online-booking queue for Records Patient Entry (/hms/identity).
 */
@Controller('records/bookings')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class RecordsBookingsController {
  constructor(
    private readonly appointments: AppointmentsService,
    private readonly records: RecordsService,
  ) {}

  /**
   * Method: GET
   * URL: /api/records/bookings?date=&status=&paymentStatus=&patientType=&q=&page=&limit=
   * Purpose: List public/online ServiceBookings for Records convert / check-in
   * Required permission: patient:read
   * Response: { data: { items, meta } }
   * Errors: 401, 403
   */
  @Get()
  @RequirePermissions(PERMISSIONS.PATIENT_READ)
  async list(
    @Query('date') date?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('status') status?: string,
    @Query('paymentStatus') paymentStatus?: string,
    @Query('patientType') patientType?: string,
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const data = await this.appointments.listStaffBookings({
      date,
      from,
      to,
      status,
      paymentStatus,
      patientType,
      q,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 50,
    });
    return { data };
  }

  /**
   * Method: GET
   * URL: /api/records/bookings/:id
   * Purpose: Booking detail + person/card payment snapshot
   * Required permission: patient:read
   * Errors: 401, 403, 404
   */
  @Get(':id')
  @RequirePermissions(PERMISSIONS.PATIENT_READ)
  async get(@Param('id', ParseIntPipe) id: number) {
    return { data: await this.appointments.getStaffBooking(id) };
  }

  /**
   * Method: POST
   * URL: /api/records/bookings/:id/convert
   * Purpose: NEW patient — validate booking and return resumeRegistration payload for Patient Entry wizard
   * Required permission: patient:update
   * Response: { data: { booking, resume } }
   * Errors: 400 wrong type, 401, 403, 404, 409 already completed
   */
  @Post(':id/convert')
  @RequirePermissions(PERMISSIONS.PATIENT_UPDATE)
  async convert(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
  ) {
    return { data: await this.records.convertOnlineBooking(id, user) };
  }

  /**
   * Method: POST
   * URL: /api/records/bookings/:id/check-in
   * Purpose: RETURNING patient — payment gate then triage + mark booking Completed
   * Required permission: triage:create
   * Response: { data: { booking, arrival } }
   * Errors: 400 wrong type, 401, 403, 404, 409 payment pending
   */
  @Post(':id/check-in')
  @RequirePermissions(PERMISSIONS.TRIAGE_CREATE)
  async checkIn(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
  ) {
    return { data: await this.records.checkInOnlineBooking(id, user) };
  }

  /**
   * Method: POST
   * URL: /api/records/bookings/:id/complete
   * Purpose: Mark NEW booking Completed after Patient Entry triage queue
   * Required permission: triage:create
   * Request body: none (uses linked person on booking)
   * Errors: 400, 401, 403, 404
   */
  @Post(':id/complete')
  @RequirePermissions(PERMISSIONS.TRIAGE_CREATE)
  async complete(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
  ) {
    const booking = await this.appointments.getStaffBooking(id);
    if (!booking.personId) {
      return { data: await this.appointments.markBookingCheckedIn(id, user) };
    }
    return {
      data: await this.records.completeBookingAfterTriage(
        id,
        booking.personId,
        user,
      ),
    };
  }
}
