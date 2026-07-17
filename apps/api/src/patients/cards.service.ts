import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../auth/types/auth-user.type';

export type CardResponse = {
  cardId: number;
  personId: number;
  cardNo: string;
  cardType: string;
  paymentStatus: string;
  cardFee: number;
  regFee: number;
  consultFee: number;
  totalAmount: number;
  paymentChannel: string | null;
  paymentRef: string | null;
  paidAt: string | null;
  confirmedBy: string | null;
  status: string;
  createdBy: string | null;
  createdAt: string | null;
  person?: {
    personId: number;
    hospitalNo: string | null;
    firstName: string | null;
    lastName: string | null;
    patientPhoneNo: string | null;
  } | null;
};

const PERSON_SELECT = {
  PERSON_ID: true,
  HOSPITAL_NO: true,
  FIRST_NAME: true,
  LAST_NAME: true,
  PATIENT_PHONE_NO: true,
} as const;

function actorLabelOf(actor?: AuthUser): string {
  return (
    actor?.email ||
    [actor?.firstName, actor?.lastName].filter(Boolean).join(' ') ||
    'SYSTEM'
  );
}

function dec(n?: number | null): Prisma.Decimal {
  return new Prisma.Decimal(n ?? 0);
}

@Injectable()
export class CardsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Opens a registration card for a newly registered person.
   * Payment always starts as Pending — only a cashier can confirm it.
   */
  async createForPerson(
    input: {
      personId: number;
      cardNo: string;
      cardFee?: number;
      regFee?: number;
      consultFee?: number;
    },
    actor?: AuthUser,
  ): Promise<CardResponse> {
    const actorLabel = actorLabelOf(actor);
    const total =
      (input.cardFee ?? 0) + (input.regFee ?? 0) + (input.consultFee ?? 0);

    const card = await this.prisma.patientCards.create({
      data: {
        PERSON_ID: input.personId,
        CARD_NO: input.cardNo,
        CARD_TYPE: 'Standard',
        PAYMENT_STATUS: 'Pending',
        CARD_FEE: dec(input.cardFee),
        REG_FEE: dec(input.regFee),
        CONSULT_FEE: dec(input.consultFee),
        TOTAL_AMOUNT: dec(total),
        STATUS: 'Pending Payment',
        CREATED_BY_ID: actor?.id ?? null,
        CREATED_BY: actorLabel,
        CREATED_DATE: new Date(),
      },
      include: { person: { select: PERSON_SELECT } },
    });

    await this.audit.log({
      type: 'card:create',
      entity: 'patient_cards',
      entityId: card.CARD_ID,
      personId: card.PERSON_ID,
      userId: actor?.id,
      createdBy: actorLabel,
      item: `Card ${card.CARD_NO} opened (payment pending)`,
      newValue: {
        cardId: card.CARD_ID,
        cardNo: card.CARD_NO,
        totalAmount: total,
        paymentStatus: 'Pending',
      },
    });

    return this.toResponse(card);
  }

  async list(params?: {
    paymentStatus?: string;
    personId?: number;
    q?: string;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(params?.page ?? 1, 1);
    const limit = Math.min(Math.max(params?.limit ?? 50, 1), 100);
    const term = params?.q?.trim();

    const where: Prisma.PatientCardsWhereInput = {
      ...(params?.paymentStatus ? { PAYMENT_STATUS: params.paymentStatus } : {}),
      ...(params?.personId != null ? { PERSON_ID: params.personId } : {}),
      ...(term
        ? {
            OR: [
              { CARD_NO: { contains: term, mode: 'insensitive' } },
              { person: { HOSPITAL_NO: { contains: term, mode: 'insensitive' } } },
              { person: { FIRST_NAME: { contains: term, mode: 'insensitive' } } },
              { person: { LAST_NAME: { contains: term, mode: 'insensitive' } } },
              { person: { PATIENT_PHONE_NO: { contains: term } } },
            ],
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.patientCards.findMany({
        where,
        orderBy: { CREATED_DATE: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { person: { select: PERSON_SELECT } },
      }),
      this.prisma.patientCards.count({ where }),
    ]);

    return {
      items: rows.map((r) => this.toResponse(r)),
      meta: { page, limit, total },
    };
  }

  /** Latest card for a person — used by Records to gate the workflow. */
  async latestForPerson(personId: number): Promise<CardResponse | null> {
    const card = await this.prisma.patientCards.findFirst({
      where: { PERSON_ID: personId },
      orderBy: { CREATED_DATE: 'desc' },
      include: { person: { select: PERSON_SELECT } },
    });
    return card ? this.toResponse(card) : null;
  }

  /** True when the person has no card blocking them (Paid/Waived or no card). */
  async isPaymentCleared(personId: number): Promise<boolean> {
    const card = await this.prisma.patientCards.findFirst({
      where: { PERSON_ID: personId },
      orderBy: { CREATED_DATE: 'desc' },
      select: { PAYMENT_STATUS: true },
    });
    return !card || card.PAYMENT_STATUS !== 'Pending';
  }

  /**
   * Throws 409 when latest registration card is still Pending.
   * Used by triage create and encounter start / consult routing.
   */
  async assertPaymentCleared(personId: number): Promise<void> {
    const card = await this.prisma.patientCards.findFirst({
      where: { PERSON_ID: personId },
      orderBy: { CREATED_DATE: 'desc' },
      select: { CARD_ID: true, CARD_NO: true, PAYMENT_STATUS: true },
    });
    if (card?.PAYMENT_STATUS === 'Pending') {
      throw new ConflictException({
        message:
          'Card payment is pending — the cashier must confirm payment before the patient can proceed',
        cardId: card.CARD_ID,
        cardNo: card.CARD_NO,
        paymentStatus: card.PAYMENT_STATUS,
      });
    }
  }

  /** Cashier confirms the card payment; unblocks the registration workflow. */
  async confirmPayment(
    cardId: number,
    input: { paymentChannel: string; paymentRef?: string },
    actor?: AuthUser,
  ): Promise<CardResponse> {
    const existing = await this.prisma.patientCards.findUnique({
      where: { CARD_ID: cardId },
    });
    if (!existing) throw new NotFoundException('Card not found');
    if (existing.PAYMENT_STATUS !== 'Pending') {
      throw new ConflictException(
        `Card payment already ${existing.PAYMENT_STATUS}`,
      );
    }

    const actorLabel = actorLabelOf(actor);
    const card = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.patientCards.update({
        where: { CARD_ID: cardId },
        data: {
          PAYMENT_STATUS: 'Paid',
          STATUS: 'Active',
          PAYMENT_CHANNEL: input.paymentChannel,
          PAYMENT_REF: input.paymentRef?.trim() || null,
          PAID_AT: new Date(),
          CONFIRMED_BY_ID: actor?.id ?? null,
          CONFIRMED_BY: actorLabel,
          UPDATED_BY: actorLabel,
          UPDATED_DATE: new Date(),
        },
        include: { person: { select: PERSON_SELECT } },
      });

      // Unlock Records to finish medical/review steps after payment.
      await tx.persons.update({
        where: { PERSON_ID: existing.PERSON_ID },
        data: {
          STATUS: 'Incomplete',
          CARD_STATUS: 'Active',
          UPDATED_BY: actorLabel,
          UPDATED_DATE: new Date(),
        },
      });

      return updated;
    });

    await this.audit.log({
      type: 'card:payment-confirm',
      entity: 'patient_cards',
      entityId: card.CARD_ID,
      personId: card.PERSON_ID,
      userId: actor?.id,
      createdBy: actorLabel,
      item: `Card ${card.CARD_NO} payment confirmed (${input.paymentChannel})`,
      oldValue: { paymentStatus: 'Pending', status: existing.STATUS },
      newValue: {
        paymentStatus: 'Paid',
        status: 'Active',
        personStatus: 'Incomplete',
        paymentChannel: input.paymentChannel,
        paymentRef: input.paymentRef ?? null,
      },
    });

    return this.toResponse(card);
  }

  async findById(cardId: number): Promise<CardResponse> {
    const card = await this.prisma.patientCards.findUnique({
      where: { CARD_ID: cardId },
      include: { person: { select: PERSON_SELECT } },
    });
    if (!card) throw new NotFoundException('Card not found');
    return this.toResponse(card);
  }

  private toResponse(row: {
    CARD_ID: number;
    PERSON_ID: number;
    CARD_NO: string;
    CARD_TYPE: string;
    PAYMENT_STATUS: string;
    CARD_FEE: Prisma.Decimal;
    REG_FEE: Prisma.Decimal;
    CONSULT_FEE: Prisma.Decimal;
    TOTAL_AMOUNT: Prisma.Decimal;
    PAYMENT_CHANNEL: string | null;
    PAYMENT_REF: string | null;
    PAID_AT: Date | null;
    CONFIRMED_BY: string | null;
    STATUS: string;
    CREATED_BY: string | null;
    CREATED_DATE: Date | null;
    person?: {
      PERSON_ID: number;
      HOSPITAL_NO: string | null;
      FIRST_NAME: string | null;
      LAST_NAME: string | null;
      PATIENT_PHONE_NO: string | null;
    } | null;
  }): CardResponse {
    return {
      cardId: row.CARD_ID,
      personId: row.PERSON_ID,
      cardNo: row.CARD_NO,
      cardType: row.CARD_TYPE,
      paymentStatus: row.PAYMENT_STATUS,
      cardFee: row.CARD_FEE.toNumber(),
      regFee: row.REG_FEE.toNumber(),
      consultFee: row.CONSULT_FEE.toNumber(),
      totalAmount: row.TOTAL_AMOUNT.toNumber(),
      paymentChannel: row.PAYMENT_CHANNEL,
      paymentRef: row.PAYMENT_REF,
      paidAt: row.PAID_AT?.toISOString() ?? null,
      confirmedBy: row.CONFIRMED_BY,
      status: row.STATUS,
      createdBy: row.CREATED_BY,
      createdAt: row.CREATED_DATE?.toISOString() ?? null,
      person: row.person
        ? {
            personId: row.person.PERSON_ID,
            hospitalNo: row.person.HOSPITAL_NO,
            firstName: row.person.FIRST_NAME,
            lastName: row.person.LAST_NAME,
            patientPhoneNo: row.person.PATIENT_PHONE_NO,
          }
        : null,
    };
  }
}
