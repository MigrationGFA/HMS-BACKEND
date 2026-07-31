import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreatePublicBookingDto } from './dto/public-booking.dto';

function parseHhMm(value: string): number {
  const [h, m] = value.split(':').map((x) => Number(x));
  if (
    !Number.isFinite(h) ||
    !Number.isFinite(m) ||
    h < 0 ||
    h > 23 ||
    m < 0 ||
    m > 59
  ) {
    throw new BadRequestException(`Invalid time: ${value}`);
  }
  return h * 60 + m;
}

function formatHhMm(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function modeAllowed(
  settingsMode: string,
  requested: 'PHYSICAL' | 'ONLINE',
): boolean {
  if (settingsMode === 'BOTH') return true;
  return settingsMode === requested;
}

function rangesOverlap(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number,
): boolean {
  return aStart < bEnd && bStart < aEnd;
}

function parseDateOnly(dateStr: string): Date {
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) {
    throw new BadRequestException(`Invalid date: ${dateStr}`);
  }
  return d;
}

@Injectable()
export class AppointmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private async loadBookableService(serviceId: number) {
    const service = await this.prisma.masterServices.findUnique({
      where: { SERVICE_ID: serviceId },
      include: { bookingSettings: true },
    });
    if (!service || service.STATUS !== 'ACTIVE') {
      throw new NotFoundException('Service not found or not active');
    }
    const settings = service.bookingSettings;
    const onlineBookable =
      settings?.ONLINE_BOOKABLE ?? service.ONLINE_BOOKABLE;
    if (!onlineBookable) {
      throw new BadRequestException('Service is not bookable online');
    }
    return {
      service,
      settings: {
        onlineBookable,
        deliveryMode:
          settings?.DELIVERY_MODE ??
          (service.ONLINE_BOOKABLE ? 'BOTH' : 'PHYSICAL'),
        durationMinutes:
          settings?.DURATION_MINUTES ?? service.DURATION_MINUTES ?? 30,
        dayStart: settings?.DAY_START ?? '08:00',
        dayEnd: settings?.DAY_END ?? '17:00',
      },
    };
  }

  async getPublicAvailability(params: {
    serviceId: number;
    date: string;
    mode: 'PHYSICAL' | 'ONLINE';
  }) {
    const { service, settings } = await this.loadBookableService(
      params.serviceId,
    );
    if (!modeAllowed(settings.deliveryMode, params.mode)) {
      throw new BadRequestException(
        `Mode ${params.mode} is not allowed for this service (allows ${settings.deliveryMode})`,
      );
    }
    if (service.GENERAL_PRICE == null) {
      throw new BadRequestException('Service is not priced');
    }

    const dayStart = parseHhMm(settings.dayStart);
    const dayEnd = parseHhMm(settings.dayEnd);
    const duration = settings.durationMinutes;
    if (duration < 1) {
      throw new BadRequestException('Invalid service duration');
    }
    if (dayEnd <= dayStart) {
      throw new BadRequestException('Invalid clinic day window');
    }

    const appointmentDate = parseDateOnly(params.date);
    const bookings = await this.prisma.serviceBookings.findMany({
      where: {
        SERVICE_ID: params.serviceId,
        APPOINTMENT_DATE: appointmentDate,
        STATUS: 'Booked',
      },
      select: { START_TIME: true, END_TIME: true },
    });
    const busy = bookings.map((b) => ({
      start: parseHhMm(b.START_TIME),
      end: parseHhMm(b.END_TIME),
    }));

    const slots: Array<{ start: string; end: string; available: boolean }> = [];
    for (let t = dayStart; t + duration <= dayEnd; t += duration) {
      const end = t + duration;
      const available = !busy.some((b) => rangesOverlap(t, end, b.start, b.end));
      slots.push({
        start: formatHhMm(t),
        end: formatHhMm(end),
        available,
      });
    }

    return {
      serviceId: service.SERVICE_ID,
      serviceName: service.NAME,
      date: params.date,
      mode: params.mode,
      durationMinutes: duration,
      price: Number(service.GENERAL_PRICE),
      dayStart: settings.dayStart,
      dayEnd: settings.dayEnd,
      slots,
    };
  }

  async createPublicBooking(dto: CreatePublicBookingDto) {
    const { service, settings } = await this.loadBookableService(dto.serviceId);
    if (!modeAllowed(settings.deliveryMode, dto.mode)) {
      throw new BadRequestException(
        `Mode ${dto.mode} is not allowed for this service (allows ${settings.deliveryMode})`,
      );
    }
    if (service.GENERAL_PRICE == null) {
      throw new BadRequestException('Service is not priced');
    }

    const duration = settings.durationMinutes;
    const startMin = parseHhMm(dto.startTime);
    const endMin = startMin + duration;
    const dayStart = parseHhMm(settings.dayStart);
    const dayEnd = parseHhMm(settings.dayEnd);
    if (startMin < dayStart || endMin > dayEnd) {
      throw new BadRequestException('Selected time is outside clinic hours');
    }

    const appointmentDate = parseDateOnly(dto.date);
    const endTime = formatHhMm(endMin);
    const price = Number(service.GENERAL_PRICE);
    const now = new Date();

    const booking = await this.prisma.$transaction(async (tx) => {
      const conflicts = await tx.serviceBookings.findMany({
        where: {
          SERVICE_ID: dto.serviceId,
          APPOINTMENT_DATE: appointmentDate,
          STATUS: 'Booked',
        },
        select: { START_TIME: true, END_TIME: true },
      });
      const busy = conflicts.some((b) =>
        rangesOverlap(
          startMin,
          endMin,
          parseHhMm(b.START_TIME),
          parseHhMm(b.END_TIME),
        ),
      );
      if (busy) {
        throw new BadRequestException('Selected time slot is no longer available');
      }

      const created = await tx.serviceBookings.create({
        data: {
          BOOKING_NO: `TMP-${Date.now()}`,
          SERVICE_ID: dto.serviceId,
          PATIENT_NAME: dto.patientName.trim(),
          PHONE: dto.phone.trim(),
          EMAIL: dto.email?.trim() || null,
          AGE: dto.age?.trim() || null,
          GENDER: dto.gender?.trim() || null,
          APPOINTMENT_DATE: appointmentDate,
          START_TIME: dto.startTime,
          END_TIME: endTime,
          DELIVERY_MODE: dto.mode,
          PRICE_AMOUNT: new Prisma.Decimal(price),
          NOTES: dto.notes?.trim() || null,
          STATUS: 'Booked',
          CREATED_BY: 'public',
          CREATED_DATE: now,
          UPDATED_BY: 'public',
          UPDATED_DATE: now,
        },
      });

      const year = now.getUTCFullYear();
      const bookingNo = `APT-${year}-${String(created.BOOKING_ID).padStart(5, '0')}`;
      return tx.serviceBookings.update({
        where: { BOOKING_ID: created.BOOKING_ID },
        data: { BOOKING_NO: bookingNo },
      });
    });

    const response = {
      bookingId: booking.BOOKING_ID,
      bookingNo: booking.BOOKING_NO,
      serviceId: booking.SERVICE_ID,
      serviceName: service.NAME,
      patientName: booking.PATIENT_NAME,
      phone: booking.PHONE,
      date: dto.date,
      startTime: booking.START_TIME,
      endTime: booking.END_TIME,
      mode: booking.DELIVERY_MODE,
      priceAmount: Number(booking.PRICE_AMOUNT),
      status: booking.STATUS,
    };

    await this.audit.log({
      type: 'appointment:public-book',
      entity: 'service_bookings',
      entityId: booking.BOOKING_ID,
      createdBy: 'public',
      item: `Public booking ${booking.BOOKING_NO}`,
      newValue: response,
    });

    return response;
  }
}
