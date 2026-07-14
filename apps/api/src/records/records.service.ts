import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CardsService } from '../patients/cards.service';
import { PatientsService } from '../patients/patients.service';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../auth/types/auth-user.type';
import type { CreatePersonDto } from '../patients/dto/create-person.dto';
import type { UpdatePersonDto } from '../patients/dto/update-person.dto';

/**
 * Records / front-desk workflows for Patient Entry Engine.
 * Reuses PatientsService + CardsService — no duplicated business logic.
 */
@Injectable()
export class RecordsService {
  constructor(
    private readonly patients: PatientsService,
    private readonly cards: CardsService,
    private readonly prisma: PrismaService,
  ) {}

  /** Create PERSONS + pending PATIENT_CARDS after Next of Kin (steps 1–3). */
  async createRegistration(dto: CreatePersonDto, actor?: AuthUser) {
    return this.patients.register(dto, actor);
  }

  /**
   * Live summary cards for Patient Entry Engine (/hms/identity).
   * Derived from PERSONS, PATIENT_CARDS, and TRIAGE (no duplicated counters).
   */
  async dashboardStats(params?: { timezoneOffsetMinutes?: number }) {
    const offsetMin = params?.timezoneOffsetMinutes ?? 60; // WAT default
    const now = new Date();
    const localMs = now.getTime() + offsetMin * 60_000;
    const local = new Date(localMs);
    const startLocal = new Date(
      Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()),
    );
    const startOfDay = new Date(startLocal.getTime() - offsetMin * 60_000);
    const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

    const todayPersons = {
      CREATED_DATE: { gte: startOfDay, lt: endOfDay },
    };
    const todayTriage = {
      ARRIVAL_AT: { gte: startOfDay, lt: endOfDay },
    };

    const [
      newToday,
      walkInToday,
      emergencyToday,
      returningToday,
      pendingRegistration,
      awaitingTriage,
      awaitingConsultation,
    ] = await Promise.all([
      this.prisma.persons.count({ where: todayPersons }),
      this.prisma.persons.count({
        where: {
          ...todayPersons,
          OR: [
            { REG_TYPE: { contains: 'Walk', mode: 'insensitive' } },
            { REG_TYPE: { equals: 'Walk-In' } },
            { REG_TYPE: { equals: 'Walk-In Patient' } },
          ],
        },
      }),
      this.prisma.persons.count({
        where: {
          ...todayPersons,
          OR: [
            { PATIENT_TYPE: { contains: 'Emergency', mode: 'insensitive' } },
            { REG_TYPE: { contains: 'Emergency', mode: 'insensitive' } },
          ],
        },
      }),
      this.prisma.triage.count({
        where: {
          ...todayTriage,
          OR: [
            { PATIENT_TYPE: { equals: 'Returning' } },
            { PATIENT_TYPE: { contains: 'Return', mode: 'insensitive' } },
          ],
        },
      }),
      this.prisma.patientCards.count({
        where: { PAYMENT_STATUS: 'Pending' },
      }),
      this.prisma.triage.count({
        where: { STATUS: 'Waiting' },
      }),
      this.prisma.triage.count({
        where: {
          STATUS: { in: ['Triage Completed', 'Sent to Consultation'] },
        },
      }),
    ]);

    const totalToday = newToday + returningToday;

    return {
      asOf: now.toISOString(),
      timezoneOffsetMinutes: offsetMin,
      totalToday,
      newToday,
      returningToday,
      walkInToday,
      emergencyToday,
      pendingRegistration,
      awaitingTriage,
      awaitingConsultation,
    };
  }

  /**
   * Queue for Patient Entry Engine:
   * - Pending: awaiting Accounts/Cashier payment
   * - Paid: payment done, Records can continue Medical → Complete
   */
  async registrationQueue(params?: {
    paymentStatus?: string;
    q?: string;
    page?: number;
    limit?: number;
  }) {
    return this.cards.list(params);
  }

  /** Check whether a registration card has been paid. */
  async paymentStatusByCardId(cardId: number) {
    const card = await this.cards.findById(cardId);
    return {
      card,
      paymentCleared: card.paymentStatus !== 'Pending',
    };
  }

  /** Check payment status for the latest card on a person. */
  async paymentStatusByPersonId(personId: number) {
    const card = await this.cards.latestForPerson(personId);
    if (!card) {
      throw new NotFoundException('No registration card found for this person');
    }
    return {
      card,
      paymentCleared: card.paymentStatus !== 'Pending',
    };
  }

  /** Load person + card for continuing registration from the queue. */
  async getRegistration(personId: number) {
    const person = await this.patients.findById(personId);
    const card = await this.cards.latestForPerson(personId);
    return {
      person,
      card,
      paymentCleared: !card || card.paymentStatus !== 'Pending',
    };
  }

  /** Complete registration after payment (medical/details + Active status). */
  async completeRegistration(
    personId: number,
    dto: UpdatePersonDto,
    actor?: AuthUser,
  ) {
    const card = await this.cards.latestForPerson(personId);
    if (card?.paymentStatus === 'Pending') {
      throw new ConflictException({
        message:
          'Card payment is pending — Accounts must confirm payment before registration can be completed',
        cardId: card.cardId,
        cardNo: card.cardNo,
        paymentStatus: card.paymentStatus,
      });
    }

    return this.patients.update(
      personId,
      { ...dto, status: dto.status ?? 'Active' },
      actor,
    );
  }
}
