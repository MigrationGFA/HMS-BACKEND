import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
} from '@nestjs/common';
import { AppointmentsService } from './appointments.service';
import { CreatePublicBookingDto } from './dto/public-booking.dto';

/**
 * Public (no JWT) appointment endpoints for the marketing landing page.
 */
@Controller('appointments/public')
export class PublicAppointmentsController {
  constructor(private readonly appointments: AppointmentsService) {}

  /**
   * Method: GET
   * URL: /api/appointments/public/availability?serviceId=&date=YYYY-MM-DD&mode=PHYSICAL|ONLINE
   * Purpose: Slot grid for a bookable service on a date (duration intervals; booked slots marked unavailable)
   * Required permission: public (no auth)
   * Response: { data: { serviceId, date, durationMinutes, mode, price, slots: [{ start, end, available }] } }
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
   * URL: /api/appointments/public/book
   * Purpose: Create a public service booking (price snapshot + slot lock)
   * Required permission: public (no auth)
   * Request body: { serviceId, date, startTime, mode, patientName, phone, email?, age?, gender?, notes? }
   * Response: { data: { bookingId, bookingNo, priceAmount, startTime, endTime, … } }
   * Errors: 400 (mode/slot taken/unpriced), 404
   */
  @Post('book')
  async book(@Body() dto: CreatePublicBookingDto) {
    return { data: await this.appointments.createPublicBooking(dto) };
  }
}
