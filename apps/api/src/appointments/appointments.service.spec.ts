import {
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { AppointmentsService } from './appointments.service';

describe('AppointmentsService', () => {
  const audit = { log: jest.fn() };
  const prisma: Record<string, any> = {
    masterServices: { findUnique: jest.fn() },
    serviceBookings: {
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  let service: AppointmentsService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation(async (fn: any) => fn(prisma));
    service = new AppointmentsService(prisma as any, audit as any);
  });

  const activeService = {
    SERVICE_ID: 1,
    NAME: 'GMPC General Consultation',
    STATUS: 'ACTIVE',
    ONLINE_BOOKABLE: true,
    GENERAL_PRICE: 5000,
    DURATION_MINUTES: 30,
    bookingSettings: {
      ONLINE_BOOKABLE: true,
      DELIVERY_MODE: 'BOTH',
      DURATION_MINUTES: 30,
      DAY_START: '08:00',
      DAY_END: '10:00',
    },
  };

  describe('getPublicAvailability', () => {
    it('marks overlapping booked slots unavailable', async () => {
      prisma.masterServices.findUnique.mockResolvedValue(activeService);
      prisma.serviceBookings.findMany.mockResolvedValue([
        { START_TIME: '08:30', END_TIME: '09:00' },
      ]);

      const result = await service.getPublicAvailability({
        serviceId: 1,
        date: '2026-08-01',
        mode: 'PHYSICAL',
      });

      expect(result.price).toBe(5000);
      expect(result.durationMinutes).toBe(30);
      expect(result.slots).toEqual([
        { start: '08:00', end: '08:30', available: true },
        { start: '08:30', end: '09:00', available: false },
        { start: '09:00', end: '09:30', available: true },
        { start: '09:30', end: '10:00', available: true },
      ]);
    });

    it('rejects disallowed mode', async () => {
      prisma.masterServices.findUnique.mockResolvedValue({
        ...activeService,
        bookingSettings: {
          ...activeService.bookingSettings,
          DELIVERY_MODE: 'PHYSICAL',
        },
      });
      await expect(
        service.getPublicAvailability({
          serviceId: 1,
          date: '2026-08-01',
          mode: 'ONLINE',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('404 when service missing', async () => {
      prisma.masterServices.findUnique.mockResolvedValue(null);
      await expect(
        service.getPublicAvailability({
          serviceId: 99,
          date: '2026-08-01',
          mode: 'PHYSICAL',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('createPublicBooking', () => {
    it('creates booking and rejects double-book', async () => {
      prisma.masterServices.findUnique.mockResolvedValue(activeService);
      prisma.serviceBookings.findMany.mockResolvedValue([]);
      prisma.serviceBookings.create.mockResolvedValue({
        BOOKING_ID: 12,
        BOOKING_NO: 'TMP',
        SERVICE_ID: 1,
        PATIENT_NAME: 'Ada',
        PHONE: '0801',
        START_TIME: '08:00',
        END_TIME: '08:30',
        DELIVERY_MODE: 'PHYSICAL',
        PRICE_AMOUNT: 5000,
        STATUS: 'Booked',
      });
      prisma.serviceBookings.update.mockResolvedValue({
        BOOKING_ID: 12,
        BOOKING_NO: 'APT-2026-00012',
        SERVICE_ID: 1,
        PATIENT_NAME: 'Ada',
        PHONE: '0801',
        START_TIME: '08:00',
        END_TIME: '08:30',
        DELIVERY_MODE: 'PHYSICAL',
        PRICE_AMOUNT: 5000,
        STATUS: 'Booked',
      });

      const created = await service.createPublicBooking({
        serviceId: 1,
        date: '2026-08-01',
        startTime: '08:00',
        mode: 'PHYSICAL',
        patientName: 'Ada',
        phone: '0801',
      });
      expect(created.bookingNo).toBe('APT-2026-00012');
      expect(created.priceAmount).toBe(5000);

      prisma.serviceBookings.findMany.mockResolvedValue([
        { START_TIME: '08:00', END_TIME: '08:30' },
      ]);
      await expect(
        service.createPublicBooking({
          serviceId: 1,
          date: '2026-08-01',
          startTime: '08:00',
          mode: 'PHYSICAL',
          patientName: 'Ada',
          phone: '0801',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
