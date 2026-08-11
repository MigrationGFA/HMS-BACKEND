import {
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { RecordsService } from './records.service';

describe('RecordsService online bookings', () => {
  const patients = {};
  const cards = {};
  const prisma = {};
  const triage = {};
  const audit = { log: jest.fn() };
  const serviceCatalog = {};
  const appointments = {
    getStaffBooking: jest.fn(),
    markBookingCheckedIn: jest.fn(),
  };

  let service: RecordsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new RecordsService(
      patients as any,
      cards as any,
      prisma as any,
      triage as any,
      audit as any,
      serviceCatalog as any,
      appointments as any,
    );
  });

  describe('convertOnlineBooking', () => {
    it('rejects RETURNING bookings', async () => {
      appointments.getStaffBooking.mockResolvedValue({
        bookingId: 1,
        patientType: 'RETURNING',
        status: 'Booked',
        personId: 10,
      });
      await expect(service.convertOnlineBooking(1)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('returns resume payload for NEW bookings', async () => {
      appointments.getStaffBooking.mockResolvedValue({
        bookingId: 2,
        bookingNo: 'APT-1',
        patientType: 'NEW',
        status: 'Booked',
        personId: 22,
      });
      const resumeSpy = jest
        .spyOn(service, 'resumeRegistration')
        .mockResolvedValue({
          person: { personId: 22 } as any,
          card: null,
          paymentCleared: false,
          suggestedStep: 4,
          registrationComplete: false,
        });

      const result = await service.convertOnlineBooking(2, {
        id: 1,
        email: 'r@t',
        firstName: 'A',
        lastName: 'B',
      } as any);

      expect(resumeSpy).toHaveBeenCalledWith({ personId: 22 });
      expect(result.booking.bookingId).toBe(2);
      expect(result.resume.suggestedStep).toBe(4);
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'appointment:convert' }),
      );
    });
  });

  describe('checkInOnlineBooking', () => {
    it('rejects unpaid RETURNING with 409 payload', async () => {
      appointments.getStaffBooking.mockResolvedValue({
        bookingId: 3,
        bookingNo: 'APT-3',
        patientType: 'RETURNING',
        status: 'Booked',
        personId: 33,
        paymentStatus: 'Pending',
        amountDue: 5000,
        feeBreakdown: { service: 5000 },
      });

      await expect(service.checkInOnlineBooking(3)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('rejects NEW bookings', async () => {
      appointments.getStaffBooking.mockResolvedValue({
        bookingId: 4,
        patientType: 'NEW',
        status: 'Booked',
        personId: 44,
        paymentStatus: 'Paid',
      });
      await expect(service.checkInOnlineBooking(4)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('routes triage and completes booking when paid', async () => {
      appointments.getStaffBooking.mockResolvedValue({
        bookingId: 5,
        bookingNo: 'APT-5',
        patientType: 'RETURNING',
        status: 'Booked',
        personId: 55,
        paymentStatus: 'Paid',
        department: 'GMPC',
        serviceName: 'Consult',
      });
      const routeSpy = jest.spyOn(service, 'routeArrival').mockResolvedValue({
        arrivalNo: 'T-1',
      } as any);
      appointments.markBookingCheckedIn.mockResolvedValue({
        bookingId: 5,
        status: 'Completed',
      });

      const result = await service.checkInOnlineBooking(5, {
        id: 1,
        email: 'r@t',
        firstName: 'A',
        lastName: 'B',
      } as any);

      expect(routeSpy).toHaveBeenCalledWith(
        expect.objectContaining({ personId: 55, action: 'triage' }),
        expect.any(Object),
      );
      expect(appointments.markBookingCheckedIn).toHaveBeenCalledWith(5, expect.any(Object));
      expect(result.booking.status).toBe('Completed');
    });
  });
});
