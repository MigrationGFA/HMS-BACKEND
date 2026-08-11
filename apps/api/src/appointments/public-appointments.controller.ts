import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
} from '@nestjs/common';
import { AppointmentsService } from './appointments.service';
import {
  CreatePublicBookingDto,
  PublicPatientLookupDto,
  PublicVerifyConfirmDto,
  PublicVerifySendDto,
} from './dto/public-booking.dto';

/**
 * Public (no JWT) appointment endpoints for the marketing landing page.
 */
@Controller('appointments/public')
export class PublicAppointmentsController {
  constructor(private readonly appointments: AppointmentsService) {}

  /**
   * Method: GET
   * URL: /api/appointments/public/registration-charges
   * Purpose: Read-only registration + card fees for new-patient public booking totals
   * Required permission: public (no auth)
   * Response: { data: { regFee, cardFee, items: [...] } }
   * Errors: 400 if catalog fees missing
   */
  @Get('registration-charges')
  async registrationCharges() {
    return { data: await this.appointments.getPublicRegistrationCharges() };
  }

  /**
   * Method: GET
   * URL: /api/appointments/public/availability?serviceId=&date=YYYY-MM-DD&mode=PHYSICAL|ONLINE
   * Purpose: Slot grid with remainingSpots based on ONLINE_SLOT_LIMIT
   * Required permission: public (no auth)
   * Response: { data: { serviceId, date, onlineSlotLimit, slots: [{ start, end, available, bookedCount, remainingSpots }] } }
   * Errors: 400 (mode/price/window), 404 (service)
   */
  @Get('availability')
  async availability(
    @Query('serviceId') serviceId?: string,
    @Query('date') date?: string,
    @Query('mode') mode?: string,
  ) {
    const id = Number(serviceId);
    if (!serviceId || !Number.isFinite(id) || id < 1) {
      throw new BadRequestException('serviceId is required');
    }
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new BadRequestException('date is required (YYYY-MM-DD)');
    }
    if (mode !== 'PHYSICAL' && mode !== 'ONLINE') {
      throw new BadRequestException('mode must be PHYSICAL or ONLINE');
    }
    const data = await this.appointments.getPublicAvailability({
      serviceId: id,
      date,
      mode,
    });
    return { data };
  }

  /**
   * Method: POST
   * URL: /api/appointments/public/patient-lookup
   * Purpose: Masked patient search for returning-patient booking
   * Required permission: public (no auth)
   * Request body: { q: string }
   * Response: { data: { items: [{ personId, displayName, phoneMasked, hospitalNoMasked }] } }
   * Errors: 400 rate limit
   */
  @Post('patient-lookup')
  async patientLookup(@Body() dto: PublicPatientLookupDto) {
    return { data: await this.appointments.lookupPublicPatient(dto) };
  }

  /**
   * Method: POST
   * URL: /api/appointments/public/verify/send
   * Purpose: Issue OTP for returning patient (returns displayCode for mock/testing)
   * Required permission: public (no auth)
   * Request body: { personId }
   * Response: { data: { displayCode, phoneMasked, expiresAt, … } }
   * Errors: 400, 404
   */
  @Post('verify/send')
  async verifySend(@Body() dto: PublicVerifySendDto) {
    return { data: await this.appointments.sendPublicVerification(dto) };
  }

  /**
   * Method: POST
   * URL: /api/appointments/public/verify/confirm
   * Purpose: Confirm OTP and return verificationToken for booking
   * Required permission: public (no auth)
   * Request body: { personId, code }
   * Response: { data: { verificationToken, personId, person } }
   * Errors: 400 invalid/expired, 404
   */
  @Post('verify/confirm')
  async verifyConfirm(@Body() dto: PublicVerifyConfirmDto) {
    return { data: await this.appointments.confirmPublicVerification(dto) };
  }

  /**
   * Method: POST
   * URL: /api/appointments/public/book
   * Purpose: Create public booking; NEW creates person+card; RETURNING requires verificationToken
   * Required permission: public (no auth)
   * Request body: { serviceId, date, startTime, mode, patientType, phone, firstName?, lastName?, personId?, verificationToken?, nin?, email?, notes? }
   * Response: { data: { bookingNo, feeBreakdown, paymentStatus, personId, … } }
   * Errors: 400 (mode/slot/capacity/verification), 404
   */
  @Post('book')
  async book(@Body() dto: CreatePublicBookingDto) {
    return { data: await this.appointments.createPublicBooking(dto) };
  }
}
