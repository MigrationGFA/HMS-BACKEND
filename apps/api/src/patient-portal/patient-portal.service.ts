import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../auth/types/auth-user.type';
import {
  CreatePortalAppointmentDto,
  PortalListQueryDto,
  UpdatePortalProfileDto,
} from './dto/patient-portal.dto';

function pagination(page?: number, limit?: number) {
  const p = Math.max(page ?? 1, 1);
  const l = Math.min(Math.max(limit ?? 50, 1), 200);
  return { page: p, limit: l, skip: (p - 1) * l };
}

function actorLabel(user: AuthUser): string {
  return (
    [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email
  );
}

function decimalToNumber(value: Prisma.Decimal | null | undefined): number {
  return value == null ? 0 : Number(value);
}

/**
 * Portal person-scope guard (Plan §36.8): every portal query MUST filter by
 * the authenticated user's own PERSON_ID — never a client-supplied id.
 * Throws 403 if the account (ROLES.PATIENT) is not linked to a PERSONS row.
 */
export function assertPortalPerson(user: AuthUser): number {
  if (user.personId == null) {
    throw new ForbiddenException(
      'Your account is not linked to a patient record',
    );
  }
  return user.personId;
}

@Injectable()
export class PatientPortalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async getMe(user: AuthUser) {
    const personId = assertPortalPerson(user);
    const person = await this.prisma.persons.findUnique({
      where: { PERSON_ID: personId },
    });
    if (!person) throw new NotFoundException('Patient record not found');

    return {
      personId: person.PERSON_ID,
      hospitalNo: person.HOSPITAL_NO,
      firstName: person.FIRST_NAME,
      lastName: person.LAST_NAME,
      sex: person.SEX,
      dateOfBirth: person.DATE_OF_BIRTH?.toISOString() ?? null,
      phone: person.PATIENT_PHONE_NO,
      email: person.E_MAIL,
      bloodGroup: person.BLOOD_GROUP,
      address: person.RESIDENTIAL_ADDRESS,
      cardStatus: person.CARD_STATUS,
      registeredAt: person.DATE_OF_REGISTRATION?.toISOString() ?? null,
    };
  }

  async getDashboard(user: AuthUser) {
    const personId = assertPortalPerson(user);
    const [
      upcomingAppointments,
      unpaidInvoicesAgg,
      pendingLabResults,
      activePrescriptions,
      unreadNotifications,
    ] = await Promise.all([
      this.prisma.serviceBookings.count({
        where: {
          PERSON_ID: personId,
          STATUS: 'Booked',
          APPOINTMENT_DATE: { gte: new Date(new Date().toDateString()) },
        },
      }),
      this.prisma.cashierPaymentReceipts.aggregate({
        _sum: { AMOUNT: true, AMOUNT_REFUNDED: true },
        where: { PERSON_ID: personId, NOT: { DELETED_FLAG: 'Y' } },
      }),
      this.prisma.labResults.count({
        where: { request: { PERSON_ID: personId }, STATUS: 'Validated' },
      }),
      this.prisma.prescriptions.count({
        where: {
          PERSON_ID: personId,
          STATUS: { in: ['Sent', 'Partially Dispensed'] },
        },
      }),
      this.prisma.notifications.count({
        where: { PERSON_ID: personId, IS_READ: false },
      }),
    ]);

    return {
      asOf: new Date().toISOString(),
      upcomingAppointments,
      totalPaidToDate: decimalToNumber(unpaidInvoicesAgg._sum.AMOUNT),
      newLabResults: pendingLabResults,
      activePrescriptions,
      unreadNotifications,
    };
  }

  async listAppointments(user: AuthUser, query: PortalListQueryDto) {
    const personId = assertPortalPerson(user);
    const { page, limit, skip } = pagination(query.page, query.limit);

    const [rows, total] = await Promise.all([
      this.prisma.serviceBookings.findMany({
        where: { PERSON_ID: personId },
        include: { service: true },
        orderBy: { APPOINTMENT_DATE: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.serviceBookings.count({ where: { PERSON_ID: personId } }),
    ]);

    return {
      items: rows.map((r) => ({
        bookingId: r.BOOKING_ID,
        bookingNo: r.BOOKING_NO,
        serviceId: r.SERVICE_ID,
        serviceName: r.service.NAME,
        appointmentDate: r.APPOINTMENT_DATE.toISOString().slice(0, 10),
        startTime: r.START_TIME,
        endTime: r.END_TIME,
        deliveryMode: r.DELIVERY_MODE,
        meetingUrl: r.MEETING_URL ?? null,
        priceAmount: Number(r.PRICE_AMOUNT),
        paymentStatus: r.PAYMENT_STATUS,
        status: r.STATUS,
        notes: r.NOTES,
        createdAt: r.CREATED_DATE?.toISOString() ?? null,
      })),
      meta: { page, limit, total },
    };
  }

  async createAppointment(user: AuthUser, dto: CreatePortalAppointmentDto) {
    const personId = assertPortalPerson(user);
    const person = await this.prisma.persons.findUnique({
      where: { PERSON_ID: personId },
    });
    if (!person) throw new NotFoundException('Patient record not found');

    const service = await this.prisma.masterServices.findUnique({
      where: { SERVICE_ID: dto.serviceId },
      include: { bookingSettings: true },
    });
    if (!service || service.STATUS !== 'ACTIVE') {
      throw new BadRequestException('Service is not available for booking');
    }
    if (!service.ONLINE_BOOKABLE) {
      throw new BadRequestException(
        'This service is not open for self-service booking — please contact Records',
      );
    }

    const durationMinutes =
      service.bookingSettings?.DURATION_MINUTES ??
      service.DURATION_MINUTES ??
      30;
    const [h, m] = dto.startTime.split(':').map((n) => Number(n));
    const endTotal = h * 60 + m + durationMinutes;
    const endTime = `${String(Math.floor(endTotal / 60) % 24).padStart(2, '0')}:${String(endTotal % 60).padStart(2, '0')}`;

    const price = Number(service.GENERAL_PRICE ?? 0);
    const appointmentDate = new Date(`${dto.appointmentDate.slice(0, 10)}T00:00:00.000Z`);
    const now = new Date();
    const year = now.getFullYear();

    const created = await this.prisma.$transaction(async (tx) => {
      const row = await tx.serviceBookings.create({
        data: {
          BOOKING_NO: `PORTAL-${year}-PENDING`,
          SERVICE_ID: dto.serviceId,
          PERSON_ID: personId,
          PATIENT_TYPE: 'RETURNING',
          PATIENT_NAME: [person.FIRST_NAME, person.LAST_NAME]
            .filter(Boolean)
            .join(' '),
          PHONE: person.PATIENT_PHONE_NO ?? '',
          EMAIL: person.E_MAIL,
          APPOINTMENT_DATE: appointmentDate,
          START_TIME: dto.startTime,
          END_TIME: endTime,
          DELIVERY_MODE: service.bookingSettings?.DELIVERY_MODE ?? 'PHYSICAL',
          PRICE_AMOUNT: price,
          PAYMENT_STATUS: 'Pending',
          NOTES: dto.notes?.trim() ?? null,
          STATUS: 'Booked',
          CREATED_BY: actorLabel(user),
          CREATED_DATE: now,
        },
      });
      return tx.serviceBookings.update({
        where: { BOOKING_ID: row.BOOKING_ID },
        data: { BOOKING_NO: `PORTAL-${year}-${String(row.BOOKING_ID).padStart(5, '0')}` },
        include: { service: true },
      });
    });

    await this.audit.log({
      type: 'portal:appointment:create',
      entity: 'SERVICE_BOOKINGS',
      entityId: created.BOOKING_ID,
      personId,
      userId: user.id,
      createdBy: actorLabel(user),
      newValue: { bookingNo: created.BOOKING_NO, serviceId: dto.serviceId },
    });

    return {
      bookingId: created.BOOKING_ID,
      bookingNo: created.BOOKING_NO,
      serviceName: created.service.NAME,
      appointmentDate: created.APPOINTMENT_DATE.toISOString().slice(0, 10),
      startTime: created.START_TIME,
      endTime: created.END_TIME,
      priceAmount: Number(created.PRICE_AMOUNT),
      paymentStatus: created.PAYMENT_STATUS,
      status: created.STATUS,
    };
  }

  async cancelAppointment(user: AuthUser, bookingId: number) {
    const personId = assertPortalPerson(user);
    const existing = await this.prisma.serviceBookings.findUnique({
      where: { BOOKING_ID: bookingId },
    });
    if (!existing || existing.PERSON_ID !== personId) {
      throw new NotFoundException('Appointment not found');
    }
    if (existing.STATUS !== 'Booked') {
      throw new BadRequestException(
        `Cannot cancel an appointment that is ${existing.STATUS}`,
      );
    }

    const updated = await this.prisma.serviceBookings.update({
      where: { BOOKING_ID: bookingId },
      data: { STATUS: 'Cancelled', UPDATED_DATE: new Date() },
    });

    await this.audit.log({
      type: 'portal:appointment:cancel',
      entity: 'SERVICE_BOOKINGS',
      entityId: bookingId,
      personId,
      userId: user.id,
      createdBy: actorLabel(user),
    });

    return { bookingId: updated.BOOKING_ID, status: updated.STATUS };
  }

  async listInvoices(user: AuthUser, query: PortalListQueryDto) {
    const personId = assertPortalPerson(user);
    const { page, limit, skip } = pagination(query.page, query.limit);

    const [rows, total] = await Promise.all([
      this.prisma.cashierPaymentReceipts.findMany({
        where: { PERSON_ID: personId, NOT: { DELETED_FLAG: 'Y' } },
        orderBy: { PAID_AT: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.cashierPaymentReceipts.count({
        where: { PERSON_ID: personId, NOT: { DELETED_FLAG: 'Y' } },
      }),
    ]);

    return {
      items: rows.map((r) => ({
        receiptId: r.RECEIPT_ID,
        receiptNo: r.RECEIPT_NO,
        sourceType: r.SOURCE_TYPE,
        amount: Number(r.AMOUNT),
        amountRefunded: Number(r.AMOUNT_REFUNDED),
        channel: r.CHANNEL,
        status: r.STATUS,
        paidAt: r.PAID_AT.toISOString(),
      })),
      meta: { page, limit, total },
    };
  }

  async listLabResults(user: AuthUser, query: PortalListQueryDto) {
    const personId = assertPortalPerson(user);
    const { page, limit, skip } = pagination(query.page, query.limit);

    const where: Prisma.LabResultsWhereInput = {
      request: { PERSON_ID: personId },
      STATUS: 'Validated',
    };

    const [rows, total] = await Promise.all([
      this.prisma.labResults.findMany({
        where,
        include: { item: { include: { test: true } }, request: true },
        orderBy: { VALIDATED_AT: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.labResults.count({ where }),
    ]);

    return {
      items: rows.map((r) => ({
        labResultId: r.LAB_RESULT_ID,
        requestNo: r.request.REQUEST_NO,
        testName: r.item.TEST_NAME,
        comment: r.COMMENT,
        criticalFlag: r.CRITICAL_FLAG === 'Y',
        validatedAt: r.VALIDATED_AT?.toISOString() ?? null,
      })),
      meta: { page, limit, total },
    };
  }

  async listPrescriptions(user: AuthUser, query: PortalListQueryDto) {
    const personId = assertPortalPerson(user);
    const { page, limit, skip } = pagination(query.page, query.limit);

    const [rows, total] = await Promise.all([
      this.prisma.prescriptions.findMany({
        where: { PERSON_ID: personId },
        include: { items: true },
        orderBy: { CREATED_DATE: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.prescriptions.count({ where: { PERSON_ID: personId } }),
    ]);

    return {
      items: rows.map((r) => ({
        prescriptionId: r.PRESCRIPTION_ID,
        rxNo: r.RX_NO,
        status: r.STATUS,
        paymentStatus: r.PAYMENT_STATUS,
        diagnosis: r.DIAGNOSIS,
        items: r.items.map((i) => ({
          drugName: i.DRUG_NAME,
          dose: i.DOSE,
          frequency: i.FREQUENCY,
          duration: i.DURATION,
          lineStatus: i.LINE_STATUS,
        })),
        createdAt: r.CREATED_DATE?.toISOString() ?? null,
      })),
      meta: { page, limit, total },
    };
  }

  async getRecordsSummary(user: AuthUser) {
    const personId = assertPortalPerson(user);
    const [admissionsCount, encountersCount, diagnosesCount, referralsCount] =
      await Promise.all([
        this.prisma.admissions.count({ where: { PERSON_ID: personId } }),
        this.prisma.encounters.count({ where: { PERSON_ID: personId } }),
        this.prisma.patientDiagnoses.count({
          where: { PERSON_ID: personId, ON_PROBLEM_LIST: true },
        }),
        this.prisma.clinicalReferrals.count({
          where: { PERSON_ID: personId },
        }),
      ]);

    return {
      admissionsCount,
      encountersCount,
      activeDiagnosesCount: diagnosesCount,
      referralsCount,
    };
  }

  async listNotifications(user: AuthUser, query: PortalListQueryDto) {
    const personId = assertPortalPerson(user);
    const { page, limit, skip } = pagination(query.page, query.limit);

    const [rows, total] = await Promise.all([
      this.prisma.notifications.findMany({
        where: { PERSON_ID: personId },
        orderBy: { CREATED_DATE: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.notifications.count({ where: { PERSON_ID: personId } }),
    ]);

    return {
      items: rows.map((r) => ({
        notificationId: r.NOTIFICATION_ID,
        type: r.TYPE,
        title: r.TITLE,
        body: r.BODY,
        isRead: r.IS_READ,
        createdAt: r.CREATED_DATE.toISOString(),
      })),
      meta: { page, limit, total },
    };
  }

  async getProfile(user: AuthUser) {
    const personId = assertPortalPerson(user);
    const [person, prefs] = await Promise.all([
      this.prisma.persons.findUnique({ where: { PERSON_ID: personId } }),
      this.prisma.portalPatientPrefs.findUnique({
        where: { PERSON_ID: personId },
      }),
    ]);
    if (!person) throw new NotFoundException('Patient record not found');

    return {
      personId: person.PERSON_ID,
      firstName: person.FIRST_NAME,
      lastName: person.LAST_NAME,
      phone: person.PATIENT_PHONE_NO,
      email: person.E_MAIL,
      address: person.RESIDENTIAL_ADDRESS,
      notifyEnabled: prefs?.NOTIFY_ENABLED ?? true,
    };
  }

  async updateProfile(user: AuthUser, dto: UpdatePortalProfileDto) {
    const personId = assertPortalPerson(user);
    const person = await this.prisma.persons.findUnique({
      where: { PERSON_ID: personId },
    });
    if (!person) throw new NotFoundException('Patient record not found');

    const prefs = await this.prisma.portalPatientPrefs.upsert({
      where: { PERSON_ID: personId },
      create: {
        PERSON_ID: personId,
        NOTIFY_ENABLED: dto.notifyEnabled ?? true,
      },
      update: {
        ...(dto.notifyEnabled !== undefined
          ? { NOTIFY_ENABLED: dto.notifyEnabled }
          : {}),
      },
    });

    await this.audit.log({
      type: 'portal:profile:update',
      entity: 'PORTAL_PATIENT_PREFS',
      entityId: personId,
      personId,
      userId: user.id,
      createdBy: actorLabel(user),
      newValue: { notifyEnabled: prefs.NOTIFY_ENABLED },
    });

    return { personId, notifyEnabled: prefs.NOTIFY_ENABLED };
  }
}
