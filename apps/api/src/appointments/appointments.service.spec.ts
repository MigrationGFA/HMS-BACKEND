import {
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { AppointmentsService } from './appointments.service';

describe('AppointmentsService', () => {
  const audit = { log: jest.fn() };
  const catalog = {
    resolveRegistrationCharges: jest.fn().mockResolvedValue({
      regFee: 1500,
      cardFee: 500,
      consultFee: 5500,
      total: 7500,
      items: [
        { code: 'SVC-REG-FEE', label: 'Registration Fee', amount: 1500, serviceId: 1, source: 'GENERAL' },
        { code: 'SVC-CARD-FEE', label: 'Card Fee', amount: 500, serviceId: 2, source: 'GENERAL' },
        { code: 'SVC-REG-CONSULT', label: 'Consultation Fee', amount: 5500, serviceId: 3, source: 'GENERAL' },
      ],
    }),
  };
  const cards = {
    createForPerson: jest.fn().mockResolvedValue({ cardId: 1 }),
  };
  const prisma: Record<string, any> = {
    masterServices: { findUnique: jest.fn() },
    serviceBookings: {
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    persons: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
    },
    publicBookingVerifications: {
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  let service: AppointmentsService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation(async (fn: any) => fn(prisma));
    service = new AppointmentsService(
      prisma as any,
      audit as any,
      catalog as any,
      cards as any,
    );
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
      STAFF_POOL_SIZE: 5,
      ONLINE_SLOT_LIMIT: 1,
    },
  };

  describe('getPublicAvailability', () => {
    it('marks slots unavailable when onlineSlotLimit reached', async () => {
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
      expect(result.onlineSlotLimit).toBe(1);
      expect(result.slots).toEqual([
        { start: '08:00', end: '08:30', available: true, bookedCount: 0, remainingSpots: 1 },
        { start: '08:30', end: '09:00', available: false, bookedCount: 1, remainingSpots: 0 },
        { start: '09:00', end: '09:30', available: true, bookedCount: 0, remainingSpots: 1 },
        { start: '09:30', end: '10:00', available: true, bookedCount: 0, remainingSpots: 1 },
      ]);
    });

    it('allows multiple bookings when onlineSlotLimit > 1', async () => {
      prisma.masterServices.findUnique.mockResolvedValue({
        ...activeService,
        bookingSettings: {
          ...activeService.bookingSettings,
          ONLINE_SLOT_LIMIT: 2,
        },
      });
      prisma.serviceBookings.findMany.mockResolvedValue([
        { START_TIME: '08:00', END_TIME: '08:30' },
      ]);

      const result = await service.getPublicAvailability({
        serviceId: 1,
        date: '2026-08-01',
        mode: 'PHYSICAL',
      });

      const slot = result.slots.find((s) => s.start === '08:00');
      expect(slot).toEqual({
        start: '08:00',
        end: '08:30',
        available: true,
        bookedCount: 1,
        remainingSpots: 1,
      });
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
    it('creates NEW patient booking with fee breakdown', async () => {
      prisma.masterServices.findUnique.mockResolvedValue(activeService);
      prisma.serviceBookings.findMany.mockResolvedValue([]);
      prisma.persons.findFirst.mockResolvedValue(null);
      prisma.persons.create.mockResolvedValue({
        PERSON_ID: 55,
        HOSPITAL_NO: 'FNPH-2026-00001',
        CARD_NO: 'FNPH-2026-00001',
      });
      prisma.persons.findUnique.mockResolvedValue({
        PERSON_ID: 55,
        HOSPITAL_NO: 'FNPH-2026-00001',
        CARD_NO: 'FNPH-2026-00001',
      });
      prisma.serviceBookings.create.mockResolvedValue({
        BOOKING_ID: 12,
        BOOKING_NO: 'TMP',
        SERVICE_ID: 1,
        PATIENT_NAME: 'Ada Obi',
        PHONE: '08012345678',
        START_TIME: '08:00',
        END_TIME: '08:30',
        DELIVERY_MODE: 'PHYSICAL',
        PRICE_AMOUNT: 7000,
        PAYMENT_STATUS: 'Pending',
        STATUS: 'Booked',
      });
      prisma.serviceBookings.update.mockResolvedValue({
        BOOKING_ID: 12,
        BOOKING_NO: 'APT-2026-00012',
        SERVICE_ID: 1,
        PATIENT_NAME: 'Ada Obi',
        PHONE: '08012345678',
        START_TIME: '08:00',
        END_TIME: '08:30',
        DELIVERY_MODE: 'PHYSICAL',
        PRICE_AMOUNT: 7000,
        PAYMENT_STATUS: 'Pending',
        STATUS: 'Booked',
      });

      const created = await service.createPublicBooking({
        serviceId: 1,
        date: '2026-08-01',
        startTime: '08:00',
        mode: 'PHYSICAL',
        patientType: 'NEW',
        firstName: 'Ada',
        lastName: 'Obi',
        phone: '08012345678',
      });
      expect(created.bookingNo).toBe('APT-2026-00012');
      expect(created.feeBreakdown).toEqual({
        service: 5000,
        registration: 1500,
        card: 500,
        total: 7000,
      });
      expect(cards.createForPerson).toHaveBeenCalled();
    });

    it('rejects when slot capacity is full', async () => {
      prisma.masterServices.findUnique.mockResolvedValue(activeService);
      prisma.serviceBookings.findMany.mockResolvedValue([
        { START_TIME: '08:00', END_TIME: '08:30' },
      ]);
      await expect(
        service.createPublicBooking({
          serviceId: 1,
          date: '2026-08-01',
          startTime: '08:00',
          mode: 'PHYSICAL',
          patientType: 'NEW',
          firstName: 'Ada',
          lastName: 'Obi',
          phone: '08012345678',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('getPublicRegistrationCharges', () => {
    it('returns reg and card only', async () => {
      const result = await service.getPublicRegistrationCharges();
      expect(result.regFee).toBe(1500);
      expect(result.cardFee).toBe(500);
      expect(result.items).toHaveLength(2);
    });
  });
});
