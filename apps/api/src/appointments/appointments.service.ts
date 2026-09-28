import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomBytes, randomInt } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthService } from '../auth/auth.service';
import { ServiceCatalogService } from '../billing/service-catalog.service';
import { ROLES } from '../common/constants/roles.constants';
import { EmailService } from '../notifications/email.service';
import { CardsService } from '../patients/cards.service';
import type { AuthUser } from '../auth/types/auth-user.type';
import {
  CreatePublicBookingDto,
  PublicGuestRegisterDto,
  PublicPatientLookupDto,
  PublicVerifyConfirmDto,
  PublicVerifySendDto,
} from './dto/public-booking.dto';

function actorLabelOf(actor?: AuthUser): string {
  if (!actor) return 'SYSTEM';
  return (
    [actor.firstName, actor.lastName].filter(Boolean).join(' ') ||
    actor.email ||
    'SYSTEM'
  );
}

type FeeBreakdown = {
  service?: number;
  registration?: number;
  card?: number;
  total?: number;
};

function parseFeeBreakdown(raw: unknown): FeeBreakdown | null {
  if (!raw || typeof raw !== 'object') return null;
  return raw;
}

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

function maskName(first?: string | null, last?: string | null): string {
  const f = (first ?? '').trim();
  const l = (last ?? '').trim();
  const mask = (s: string) =>
    s.length <= 1
      ? `${s}***`
      : `${s[0]}${'*'.repeat(Math.min(3, s.length - 1))}`;
  if (!f && !l) return 'Patient';
  return [f ? mask(f) : null, l ? mask(l) : null].filter(Boolean).join(' ');
}

function maskPhone(phone?: string | null): string {
  const p = (phone ?? '').replace(/\s+/g, '');
  if (p.length < 7) return '***';
  return `${p.slice(0, 4)}***${p.slice(-3)}`;
}

function maskHospitalNo(no?: string | null): string {
  const n = (no ?? '').trim();
  if (n.length < 4) return '***';
  return `${n.slice(0, 3)}***${n.slice(-2)}`;
}

@Injectable()
export class AppointmentsService {
  /** Simple in-memory rate limit: key -> timestamps */
  private readonly rateBuckets = new Map<string, number[]>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly catalog: ServiceCatalogService,
    private readonly cards: CardsService,
    private readonly auth: AuthService,
    private readonly email: EmailService,
    private readonly config: ConfigService,
  ) {}

  private assertRateLimit(key: string, max = 8, windowMs = 60_000) {
    const now = Date.now();
    const prev = (this.rateBuckets.get(key) ?? []).filter(
      (t) => now - t < windowMs,
    );
    if (prev.length >= max) {
      throw new BadRequestException('Too many requests — try again shortly');
    }
    prev.push(now);
    this.rateBuckets.set(key, prev);
  }

  private async loadBookableService(serviceId: number) {
    const service = await this.prisma.masterServices.findUnique({
      where: { SERVICE_ID: serviceId },
      include: { bookingSettings: true },
    });
    if (!service || service.STATUS !== 'ACTIVE') {
      throw new NotFoundException('Service not found or not active');
    }
    const settings = service.bookingSettings;
    const onlineBookable = settings?.ONLINE_BOOKABLE ?? service.ONLINE_BOOKABLE;
    if (!onlineBookable) {
      throw new BadRequestException('Service is not bookable online');
    }
    const staffPool = Math.max(1, settings?.STAFF_POOL_SIZE ?? 1);
    const onlineSlotLimit = Math.max(
      1,
      Math.min(staffPool, settings?.ONLINE_SLOT_LIMIT ?? 1),
    );
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
        staffPoolSize: staffPool,
        onlineSlotLimit,
      },
    };
  }

  async getPublicRegistrationCharges() {
    const charges = await this.catalog.resolveRegistrationCharges();
    return {
      regFee: charges.regFee,
      cardFee: charges.cardFee,
      registration: charges.regFee,
      card: charges.cardFee,
      items: charges.items.filter(
        (i) => i.code === 'SVC-REG-FEE' || i.code === 'SVC-CARD-FEE',
      ),
    };
  }

  async lookupPublicPatient(dto: PublicPatientLookupDto) {
    const q = dto.q.trim();
    this.assertRateLimit(`lookup:${q.toLowerCase()}`, 10);
    const terms = q.split(/\s+/).filter(Boolean);
    const rows = await this.prisma.persons.findMany({
      where: {
        DISCONTINUE_FLAG: { not: 'Y' },
        OR: [
          { HOSPITAL_NO: { contains: q, mode: 'insensitive' } },
          { PATIENT_PHONE_NO: { contains: q } },
          { FIRST_NAME: { contains: q, mode: 'insensitive' } },
          { LAST_NAME: { contains: q, mode: 'insensitive' } },
          ...(terms.length >= 2
            ? [
                {
                  AND: [
                    {
                      FIRST_NAME: {
                        contains: terms[0],
                        mode: 'insensitive' as const,
                      },
                    },
                    {
                      LAST_NAME: {
                        contains: terms[terms.length - 1],
                        mode: 'insensitive' as const,
                      },
                    },
                  ],
                },
              ]
            : []),
        ],
      },
      take: 8,
      orderBy: { UPDATED_DATE: 'desc' },
      select: {
        PERSON_ID: true,
        HOSPITAL_NO: true,
        FIRST_NAME: true,
        LAST_NAME: true,
        PATIENT_PHONE_NO: true,
        E_MAIL: true,
      },
    });

    await this.audit.log({
      type: 'appointment:public-lookup',
      entity: 'persons',
      createdBy: 'public',
      item: `Public patient lookup q=${q.slice(0, 40)}`,
      newValue: { matchCount: rows.length },
    });

    return {
      items: rows.map((r) => ({
        personId: r.PERSON_ID,
        displayName: maskName(r.FIRST_NAME, r.LAST_NAME),
        phoneMasked: maskPhone(r.PATIENT_PHONE_NO),
        hospitalNoMasked: maskHospitalNo(r.HOSPITAL_NO),
        hasEmail: Boolean(r.E_MAIL),
      })),
    };
  }

  async sendPublicVerification(dto: PublicVerifySendDto) {
    this.assertRateLimit(`otp-send:${dto.personId}`, 5);
    const person = await this.prisma.persons.findUnique({
      where: { PERSON_ID: dto.personId },
    });
    if (!person || person.DISCONTINUE_FLAG === 'Y') {
      throw new NotFoundException('Patient not found');
    }
    const phone = person.PATIENT_PHONE_NO?.trim();
    if (!phone || phone.length < 10) {
      throw new BadRequestException('Patient has no phone number on file');
    }

    const code = String(randomInt(100000, 999999));
    const token = randomBytes(24).toString('hex');
    const expiresAt = new Date(Date.now() + 15 * 60_000);

    const row = await this.prisma.publicBookingVerifications.create({
      data: {
        TOKEN: token,
        PERSON_ID: person.PERSON_ID,
        PHONE: phone,
        EMAIL: person.E_MAIL,
        CODE: code,
        EXPIRES_AT: expiresAt,
      },
    });

    await this.audit.log({
      type: 'appointment:public-otp-send',
      entity: 'public_booking_verifications',
      entityId: row.VERIFICATION_ID,
      personId: person.PERSON_ID,
      createdBy: 'public',
      item: `OTP issued for person ${person.PERSON_ID}`,
    });

    let emailDelivered = false;
    if (person.E_MAIL?.trim()) {
      const sent = await this.email.send({
        to: person.E_MAIL.trim(),
        subject: 'Your verification code — FNPH Aro',
        html: `<p>Hello${person.FIRST_NAME ? ` ${person.FIRST_NAME}` : ''},</p>
<p>Your verification code is <strong style="font-size:20px;letter-spacing:4px">${code}</strong>.</p>
<p>It expires in 15 minutes. If you did not request this code, you can ignore this email.</p>
<p>— Federal Neuro-Psychiatric Hospital, Aro</p>`,
        text: `Your verification code is ${code}. It expires in 15 minutes.`,
      });
      emailDelivered = sent.delivered;
    } else if (this.email.isConfigured()) {
      throw new BadRequestException(
        'Patient has no email on file — cannot send verification code',
      );
    }

    const exposeCode = !this.email.isConfigured() || !emailDelivered;

    return {
      personId: person.PERSON_ID,
      verificationId: row.VERIFICATION_ID,
      expiresAt: expiresAt.toISOString(),
      /** Only returned when Resend is not delivering (dev/testing fallback) */
      displayCode: exposeCode ? code : undefined,
      channelHint: emailDelivered
        ? 'Code sent to your email'
        : person.E_MAIL
          ? 'Shown on screen for testing (configure RESEND_API_KEY to email codes)'
          : 'Shown on screen for testing (add email to receive codes via Resend)',
      phoneMasked: maskPhone(phone),
      emailMasked: person.E_MAIL
        ? `${person.E_MAIL[0]}***@${person.E_MAIL.split('@')[1] ?? '…'}`
        : null,
      emailDelivered,
    };
  }

  /**
   * Create PERSON + PATIENT user from guest booking details, then issue OTP.
   * Account stays locked until OTP confirm.
   */
  async registerGuestPatient(dto: PublicGuestRegisterDto) {
    const firstName = dto.firstName.trim();
    const lastName = dto.lastName.trim();
    const phone = dto.phone.trim();
    const email = dto.email.trim().toLowerCase();
    const password = dto.password;
    const confirmPassword = dto.confirmPassword;

    if (!firstName || !lastName) {
      throw new BadRequestException('firstName and lastName are required');
    }
    if (phone.length < 10) {
      throw new BadRequestException('Phone number is required (min 10 digits)');
    }
    if (!email.includes('@')) {
      throw new BadRequestException('A valid email is required');
    }
    if (password.length < 8) {
      throw new BadRequestException('Password must be at least 8 characters');
    }
    if (password !== confirmPassword) {
      throw new BadRequestException('Passwords do not match');
    }

    this.assertRateLimit(`guest-reg:${email}`, 5);

    const existingUser = await this.prisma.users.findFirst({
      where: {
        EMAIL_ADDRESS: { equals: email, mode: 'insensitive' },
      },
    });
    if (existingUser) {
      throw new ConflictException(
        'An account with this email already exists — sign in or book as a returning patient',
      );
    }

    const patientRole = await this.prisma.roles.findFirst({
      where: { ROLE_NAME: ROLES.PATIENT },
    });
    if (!patientRole) {
      throw new BadRequestException('PATIENT role is not configured');
    }

    const now = new Date();
    const hash = await bcrypt.hash(password, 12);
    const userNameBase = email.split('@')[0].replace(/[^a-zA-Z0-9._-]/g, '') || 'patient';
    let userName = userNameBase.slice(0, 80);
    const nameTaken = await this.prisma.users.findFirst({
      where: { USER_NAME: userName },
    });
    if (nameTaken) {
      userName = `${userNameBase.slice(0, 70)}_${Date.now().toString(36)}`.slice(
        0,
        100,
      );
    }

    const linked = await this.prisma.$transaction(async (tx) => {
      const hospitalNo = await this.nextHospitalNo(tx);
      const person = await tx.persons.create({
        data: {
          HOSPITAL_NO: hospitalNo,
          FIRST_NAME: firstName,
          LAST_NAME: lastName,
          PATIENT_PHONE_NO: phone,
          E_MAIL: email,
          IDENTITY_TYPE: dto.nin?.trim() ? 'NIN' : null,
          IDENTITY_NO: dto.nin?.trim() || null,
          CARD_NO: hospitalNo,
          CARD_STATUS: 'Pending Payment',
          STATUS: 'Pending Payment',
          REG_TYPE: 'Online Booking',
          PATIENT_TYPE: 'NEW',
          DISCONTINUE_FLAG: 'N',
          DATE_OF_REGISTRATION: now,
          CREATED_BY: 'public-guest-register',
          CREATED_DATE: now,
        },
      });

      const user = await tx.users.create({
        data: {
          USER_NAME: userName,
          EMAIL_ADDRESS: email,
          PHONE_NO: phone,
          PASSWORD: hash,
          PWD: hash,
          FIRST_NAME: firstName,
          LAST_NAME: lastName,
          ROLE_ID: patientRole.ROLE_ID,
          PERSON_ID: person.PERSON_ID,
          LOCK_ACCOUNT: 'Y',
          GENERATE_PIN: 'N',
          USER_TYPE: 'PATIENT',
          CREATED_BY: 'public-guest-register',
          CREATED_DATE: now,
        },
      });

      return { person, user };
    });

    await this.audit.log({
      type: 'auth:guest-register',
      entity: 'USERS',
      entityId: linked.user.USER_ID,
      personId: linked.person.PERSON_ID,
      createdBy: 'public',
      item: `Guest patient registered ${email}`,
    });

    const otp = await this.sendPublicVerification({
      personId: linked.person.PERSON_ID,
    });

    return {
      ...otp,
      email,
      accountCreated: true,
    };
  }

  async confirmPublicVerification(dto: PublicVerifyConfirmDto) {
    this.assertRateLimit(`otp-confirm:${dto.personId}`, 10);
    const row = await this.prisma.publicBookingVerifications.findFirst({
      where: {
        PERSON_ID: dto.personId,
        CODE: dto.code.trim(),
        VERIFIED_AT: null,
        EXPIRES_AT: { gt: new Date() },
      },
      orderBy: { CREATED_DATE: 'desc' },
    });
    if (!row) {
      throw new BadRequestException('Invalid or expired verification code');
    }

    const verifiedAt = new Date();
    const updated = await this.prisma.publicBookingVerifications.update({
      where: { VERIFICATION_ID: row.VERIFICATION_ID },
      data: { VERIFIED_AT: verifiedAt },
    });

    const person = await this.prisma.persons.findUnique({
      where: { PERSON_ID: dto.personId },
      select: {
        PERSON_ID: true,
        FIRST_NAME: true,
        LAST_NAME: true,
        HOSPITAL_NO: true,
        PATIENT_PHONE_NO: true,
        E_MAIL: true,
      },
    });

    await this.audit.log({
      type: 'appointment:public-otp-confirm',
      entity: 'public_booking_verifications',
      entityId: updated.VERIFICATION_ID,
      personId: dto.personId,
      createdBy: 'public',
      item: `OTP verified for person ${dto.personId}`,
    });

    // Unlock guest PATIENT accounts created during public register
    await this.prisma.users.updateMany({
      where: { PERSON_ID: dto.personId, LOCK_ACCOUNT: 'Y' },
      data: {
        LOCK_ACCOUNT: 'N',
        UPDATED_BY: 'public-otp',
        UPDATED_DATE: verifiedAt,
      },
    });

    return {
      verificationToken: updated.TOKEN,
      personId: dto.personId,
      expiresAt: updated.EXPIRES_AT.toISOString(),
      person: person
        ? {
            personId: person.PERSON_ID,
            firstName: person.FIRST_NAME,
            lastName: person.LAST_NAME,
            hospitalNo: person.HOSPITAL_NO,
            phone: person.PATIENT_PHONE_NO,
            email: person.E_MAIL,
          }
        : null,
    };
  }

  private async assertVerificationToken(personId: number, token?: string) {
    if (!token?.trim()) {
      throw new BadRequestException(
        'verificationToken is required — please verify your account with OTP first',
      );
    }
    const row = await this.prisma.publicBookingVerifications.findFirst({
      where: {
        TOKEN: token.trim(),
        PERSON_ID: personId,
        VERIFIED_AT: { not: null },
        EXPIRES_AT: { gt: new Date() },
      },
    });
    if (!row) {
      throw new BadRequestException(
        'Verification expired — please verify again',
      );
    }
    return row;
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
    const limit = settings.onlineSlotLimit;
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

    const slots: Array<{
      start: string;
      end: string;
      available: boolean;
      bookedCount: number;
      remainingSpots: number;
    }> = [];
    for (let t = dayStart; t + duration <= dayEnd; t += duration) {
      const end = t + duration;
      const bookedCount = busy.filter((b) =>
        rangesOverlap(t, end, b.start, b.end),
      ).length;
      const remainingSpots = Math.max(0, limit - bookedCount);
      slots.push({
        start: formatHhMm(t),
        end: formatHhMm(end),
        available: remainingSpots > 0,
        bookedCount,
        remainingSpots,
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
      onlineSlotLimit: limit,
      staffPoolSize: settings.staffPoolSize,
      slots,
    };
  }

  private async nextHospitalNo(tx: Prisma.TransactionClient): Promise<string> {
    const year = new Date().getUTCFullYear();
    const prefix = `FNPH-${year}-`;
    const latest = await tx.persons.findFirst({
      where: { HOSPITAL_NO: { startsWith: prefix } },
      orderBy: { HOSPITAL_NO: 'desc' },
      select: { HOSPITAL_NO: true },
    });
    let seq = 1;
    if (latest?.HOSPITAL_NO) {
      const n = Number(latest.HOSPITAL_NO.slice(prefix.length));
      if (Number.isFinite(n)) seq = n + 1;
    }
    return `${prefix}${String(seq).padStart(5, '0')}`;
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

    const patientType = dto.patientType ?? 'NEW';
    const phone = dto.phone.trim();
    if (phone.length < 10) {
      throw new BadRequestException('Phone number is required (min 10 digits)');
    }

    let firstName = dto.firstName?.trim() || '';
    let lastName = dto.lastName?.trim() || '';
    if ((!firstName || !lastName) && dto.patientName?.trim()) {
      const parts = dto.patientName.trim().split(/\s+/);
      firstName = firstName || parts[0] || 'Patient';
      lastName = lastName || parts.slice(1).join(' ') || 'Unknown';
    }
    if (patientType === 'NEW' && (!firstName || !lastName)) {
      throw new BadRequestException(
        'firstName and lastName are required for new patients',
      );
    }

    let personId: number | null = null;
    let verificationId: string | null = null;
    let preRegisteredNew = false;
    let resolvedEmail = dto.email?.trim() || '';

    if (patientType === 'RETURNING') {
      if (!dto.personId) {
        throw new BadRequestException(
          'personId is required for returning patients',
        );
      }
      const v = await this.assertVerificationToken(
        dto.personId,
        dto.verificationToken,
      );
      personId = dto.personId;
      verificationId = String(v.VERIFICATION_ID);
      const existing = await this.prisma.persons.findUnique({
        where: { PERSON_ID: personId },
      });
      if (!existing || existing.DISCONTINUE_FLAG === 'Y') {
        throw new NotFoundException('Patient not found');
      }
      firstName = existing.FIRST_NAME?.trim() || firstName || 'Patient';
      lastName = existing.LAST_NAME?.trim() || lastName || 'Unknown';
      if (!resolvedEmail && existing.E_MAIL) {
        resolvedEmail = existing.E_MAIL.trim();
      }
    } else if (dto.personId && dto.verificationToken) {
      // NEW guest who already registered + verified OTP before booking
      const v = await this.assertVerificationToken(
        dto.personId,
        dto.verificationToken,
      );
      personId = dto.personId;
      verificationId = String(v.VERIFICATION_ID);
      preRegisteredNew = true;
      const existing = await this.prisma.persons.findUnique({
        where: { PERSON_ID: personId },
      });
      if (!existing || existing.DISCONTINUE_FLAG === 'Y') {
        throw new NotFoundException('Patient not found');
      }
      firstName = existing.FIRST_NAME?.trim() || firstName || 'Patient';
      lastName = existing.LAST_NAME?.trim() || lastName || 'Unknown';
      if (!resolvedEmail && existing.E_MAIL) {
        resolvedEmail = existing.E_MAIL.trim();
      }
    }

    const appointmentDate = parseDateOnly(dto.date);
    const endTime = formatHhMm(endMin);
    const servicePrice = Number(service.GENERAL_PRICE);
    const now = new Date();

    let regFee = 0;
    let cardFee = 0;
    if (patientType === 'NEW') {
      const charges = await this.catalog.resolveRegistrationCharges();
      regFee = charges.regFee;
      cardFee = charges.cardFee;
    }
    const total = servicePrice + regFee + cardFee;
    const feeBreakdown = {
      service: servicePrice,
      registration: regFee,
      card: cardFee,
      total,
    };
    const patientName = `${firstName} ${lastName}`.trim();

    const booking = await this.prisma.$transaction(async (tx) => {
      const conflicts = await tx.serviceBookings.findMany({
        where: {
          SERVICE_ID: dto.serviceId,
          APPOINTMENT_DATE: appointmentDate,
          STATUS: 'Booked',
        },
        select: { START_TIME: true, END_TIME: true },
      });
      const bookedCount = conflicts.filter((b) =>
        rangesOverlap(
          startMin,
          endMin,
          parseHhMm(b.START_TIME),
          parseHhMm(b.END_TIME),
        ),
      ).length;
      if (bookedCount >= settings.onlineSlotLimit) {
        throw new BadRequestException(
          'Selected time slot is no longer available',
        );
      }

      let linkedPersonId = personId;
      if (patientType === 'NEW' && !preRegisteredNew) {
        const hospitalNo = await this.nextHospitalNo(tx);
        const createdPerson = await tx.persons.create({
          data: {
            HOSPITAL_NO: hospitalNo,
            FIRST_NAME: firstName,
            LAST_NAME: lastName,
            PATIENT_PHONE_NO: phone,
            E_MAIL: dto.email?.trim() || null,
            IDENTITY_TYPE: dto.nin?.trim() ? 'NIN' : null,
            IDENTITY_NO: dto.nin?.trim() || null,
            SEX: dto.gender?.trim() || null,
            CARD_NO: hospitalNo,
            CARD_STATUS: 'Pending Payment',
            STATUS: 'Pending Payment',
            REG_TYPE: 'Online Booking',
            PATIENT_TYPE: 'NEW',
            DISCONTINUE_FLAG: 'N',
            DATE_OF_REGISTRATION: now,
            CREATED_BY: 'public-booking',
            CREATED_DATE: now,
          },
        });
        linkedPersonId = createdPerson.PERSON_ID;
      }

      const created = await tx.serviceBookings.create({
        data: {
          BOOKING_NO: `TMP-${Date.now()}`,
          SERVICE_ID: dto.serviceId,
          PERSON_ID: linkedPersonId,
          PATIENT_TYPE: patientType,
          PATIENT_NAME: patientName,
          PHONE: phone,
          EMAIL: resolvedEmail || null,
          AGE: dto.age?.trim() || null,
          GENDER: dto.gender?.trim() || null,
          APPOINTMENT_DATE: appointmentDate,
          START_TIME: dto.startTime,
          END_TIME: endTime,
          DELIVERY_MODE: dto.mode,
          PRICE_AMOUNT: new Prisma.Decimal(total),
          PAYMENT_STATUS: 'Pending',
          FEE_BREAKDOWN: feeBreakdown,
          VERIFICATION_ID: verificationId,
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
      return {
        booking: await tx.serviceBookings.update({
          where: { BOOKING_ID: created.BOOKING_ID },
          data: { BOOKING_NO: bookingNo },
        }),
        linkedPersonId,
      };
    });

    // Card creation outside booking txn (uses CardsService audits) for NEW patients
    if (patientType === 'NEW' && booking.linkedPersonId) {
      const person = await this.prisma.persons.findUnique({
        where: { PERSON_ID: booking.linkedPersonId },
      });
      if (person) {
        const existingCard = await this.prisma.patientCards.findFirst({
          where: { PERSON_ID: person.PERSON_ID },
        });
        if (!existingCard) {
          await this.cards.createForPerson({
            personId: person.PERSON_ID,
            cardNo:
              person.CARD_NO ?? person.HOSPITAL_NO ?? `CARD-${person.PERSON_ID}`,
            cardFee,
            regFee,
            consultFee: 0,
          });
        }
        await this.audit.log({
          type: 'person:create',
          entity: 'persons',
          entityId: person.PERSON_ID,
          personId: person.PERSON_ID,
          createdBy: 'public-booking',
          item: `Person registered via public booking ${booking.booking.BOOKING_NO}`,
        });
      }
    }

    const response: Record<string, unknown> = {
      bookingId: booking.booking.BOOKING_ID,
      bookingNo: booking.booking.BOOKING_NO,
      serviceId: booking.booking.SERVICE_ID,
      serviceName: service.NAME,
      personId: booking.linkedPersonId,
      patientType,
      patientName: booking.booking.PATIENT_NAME,
      phone: booking.booking.PHONE,
      email: booking.booking.EMAIL,
      date: dto.date,
      startTime: booking.booking.START_TIME,
      endTime: booking.booking.END_TIME,
      mode: booking.booking.DELIVERY_MODE,
      priceAmount: Number(booking.booking.PRICE_AMOUNT),
      paymentStatus: booking.booking.PAYMENT_STATUS,
      feeBreakdown,
      status: booking.booking.STATUS,
    };

    await this.audit.log({
      type: 'appointment:public-book',
      entity: 'service_bookings',
      entityId: booking.booking.BOOKING_ID,
      personId: booking.linkedPersonId ?? undefined,
      createdBy: 'public',
      item: `Public booking ${booking.booking.BOOKING_NO}`,
      newValue: response,
    });

    // Welcome + booking confirmation emails; auto-login session for linked PATIENT user
    if (booking.linkedPersonId) {
      const linkedUser = await this.prisma.users.findFirst({
        where: { PERSON_ID: booking.linkedPersonId },
        orderBy: { USER_ID: 'asc' },
      });
      const recipient =
        booking.booking.EMAIL?.trim() ||
        linkedUser?.EMAIL_ADDRESS?.trim() ||
        resolvedEmail ||
        '';
      const frontendUrl = (
        this.config.get<string>('app.frontendUrl') ||
        process.env.FRONTEND_URL ||
        'http://localhost:8080'
      ).replace(/\/$/, '');
      const dashUrl = `${frontendUrl}/dashboard/patient`;
      const patientLabel =
        booking.booking.PATIENT_NAME || `${firstName} ${lastName}`.trim();

      if (recipient) {
        await this.email.send({
          to: recipient,
          subject: `Welcome to Federal Neuro-Psychiatric Hospital, Aro`,
          html: `<p>Dear ${patientLabel},</p>
<p>Welcome to <strong>Federal Neuro-Psychiatric Hospital, Aro</strong>. Your patient account is ready.</p>
<p>You can open your portal anytime: <a href="${dashUrl}">${dashUrl}</a></p>
<p>— FNPH Aro</p>`,
          text: `Welcome to Federal Neuro-Psychiatric Hospital, Aro. Your patient account is ready. Portal: ${dashUrl}`,
        });
        await this.email.send({
          to: recipient,
          subject: `Booking confirmed — ${booking.booking.BOOKING_NO}`,
          html: `<p>Dear ${patientLabel},</p>
<p>Your appointment <strong>${booking.booking.BOOKING_NO}</strong> is booked.</p>
<ul>
<li>Date: ${dto.date}</li>
<li>Time: ${booking.booking.START_TIME} – ${booking.booking.END_TIME}</li>
<li>Service: ${service.NAME}</li>
<li>Mode: ${booking.booking.DELIVERY_MODE}</li>
<li>Amount due at hospital: ₦${feeBreakdown.total.toLocaleString()}</li>
</ul>
<p>Please arrive early and pay at the cashier on arrival.</p>
<p><a href="${dashUrl}">Go to your dashboard</a></p>`,
          text: `Booking ${booking.booking.BOOKING_NO} confirmed for ${dto.date} at ${booking.booking.START_TIME}. Amount due: ₦${feeBreakdown.total}. Dashboard: ${dashUrl}`,
        });
      }

      if (linkedUser && linkedUser.LOCK_ACCOUNT?.toUpperCase() !== 'Y') {
        try {
          const session = await this.auth.issueSessionForUserId(
            linkedUser.USER_ID,
          );
          response.session = session;
        } catch {
          // Session is best-effort; booking already succeeded
        }
      }
    }

    return response;
  }

  /** Amount due at cashier for service booking (service fee only for NEW). */
  amountDueForBooking(row: {
    PATIENT_TYPE: string;
    PRICE_AMOUNT: Prisma.Decimal | number;
    FEE_BREAKDOWN: unknown;
  }): number {
    const breakdown = parseFeeBreakdown(row.FEE_BREAKDOWN);
    if (row.PATIENT_TYPE === 'NEW') {
      if (
        breakdown?.service != null &&
        Number.isFinite(Number(breakdown.service))
      ) {
        return Number(breakdown.service);
      }
      const total = Number(row.PRICE_AMOUNT);
      const reg = Number(breakdown?.registration ?? 0);
      const card = Number(breakdown?.card ?? 0);
      return Math.max(0, total - reg - card);
    }
    if (
      breakdown?.service != null &&
      Number.isFinite(Number(breakdown.service))
    ) {
      return Number(breakdown.service);
    }
    return Number(row.PRICE_AMOUNT);
  }

  private toStaffBookingRow(row: {
    BOOKING_ID: number;
    BOOKING_NO: string;
    SERVICE_ID: number;
    PERSON_ID: number | null;
    PATIENT_TYPE: string;
    PATIENT_NAME: string;
    PHONE: string;
    EMAIL: string | null;
    APPOINTMENT_DATE: Date;
    START_TIME: string;
    END_TIME: string;
    DELIVERY_MODE: string;
    MEETING_URL?: string | null;
    PRICE_AMOUNT: Prisma.Decimal;
    PAYMENT_STATUS: string;
    FEE_BREAKDOWN: unknown;
    STATUS: string;
    CHECKED_IN_AT: Date | null;
    CHECKED_IN_BY: string | null;
    NOTES: string | null;
    service?: {
      NAME: string;
      department?: { NAME: string } | null;
    } | null;
    person?: {
      HOSPITAL_NO: string | null;
      FIRST_NAME: string | null;
      LAST_NAME: string | null;
      cards?: Array<{
        CARD_ID: number;
        PAYMENT_STATUS: string;
        CARD_NO: string;
      }>;
    } | null;
  }) {
    const card = row.person?.cards?.[0] ?? null;
    const feeBreakdown = parseFeeBreakdown(row.FEE_BREAKDOWN);
    const amountDue = this.amountDueForBooking(row);
    return {
      bookingId: row.BOOKING_ID,
      bookingNo: row.BOOKING_NO,
      serviceId: row.SERVICE_ID,
      serviceName: row.service?.NAME ?? 'Service',
      department: row.service?.department?.NAME ?? null,
      personId: row.PERSON_ID,
      hospitalNo: row.person?.HOSPITAL_NO ?? null,
      patientType: row.PATIENT_TYPE,
      patientName: row.PATIENT_NAME,
      phone: row.PHONE,
      email: row.EMAIL,
      appointmentDate: row.APPOINTMENT_DATE.toISOString().slice(0, 10),
      startTime: row.START_TIME,
      endTime: row.END_TIME,
      deliveryMode: row.DELIVERY_MODE,
      meetingUrl: row.MEETING_URL ?? null,
      priceAmount: Number(row.PRICE_AMOUNT),
      amountDue,
      paymentStatus: row.PAYMENT_STATUS,
      feeBreakdown,
      status: row.STATUS,
      checkedInAt: row.CHECKED_IN_AT?.toISOString() ?? null,
      checkedInBy: row.CHECKED_IN_BY,
      notes: row.NOTES,
      cardId: card?.CARD_ID ?? null,
      cardNo: card?.CARD_NO ?? null,
      cardPaymentStatus: card?.PAYMENT_STATUS ?? null,
    };
  }

  async listStaffBookings(params?: {
    date?: string;
    from?: string;
    to?: string;
    status?: string;
    paymentStatus?: string;
    patientType?: string;
    q?: string;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(1, params?.page ?? 1);
    const limit = Math.min(100, Math.max(1, params?.limit ?? 50));
    const where: Prisma.ServiceBookingsWhereInput = {};

    if (params?.status) {
      where.STATUS = params.status;
    } else {
      where.STATUS = { in: ['Booked', 'Completed'] };
    }
    if (params?.paymentStatus) where.PAYMENT_STATUS = params.paymentStatus;
    if (params?.patientType) where.PATIENT_TYPE = params.patientType;

    if (params?.date) {
      where.APPOINTMENT_DATE = parseDateOnly(params.date);
    } else if (params?.from || params?.to) {
      where.APPOINTMENT_DATE = {};
      if (params.from) {
        where.APPOINTMENT_DATE.gte = parseDateOnly(params.from);
      }
      if (params.to) {
        where.APPOINTMENT_DATE.lte = parseDateOnly(params.to);
      }
    } else {
      // Default: today
      const today = new Date().toISOString().slice(0, 10);
      where.APPOINTMENT_DATE = parseDateOnly(today);
    }

    const q = params?.q?.trim();
    if (q) {
      where.OR = [
        { BOOKING_NO: { contains: q, mode: 'insensitive' } },
        { PATIENT_NAME: { contains: q, mode: 'insensitive' } },
        { PHONE: { contains: q } },
        { person: { HOSPITAL_NO: { contains: q, mode: 'insensitive' } } },
      ];
    }

    const [total, rows] = await Promise.all([
      this.prisma.serviceBookings.count({ where }),
      this.prisma.serviceBookings.findMany({
        where,
        include: {
          service: {
            select: {
              NAME: true,
              department: { select: { NAME: true } },
            },
          },
          person: {
            select: {
              HOSPITAL_NO: true,
              FIRST_NAME: true,
              LAST_NAME: true,
              cards: {
                orderBy: { CREATED_DATE: 'desc' },
                take: 1,
                select: { CARD_ID: true, PAYMENT_STATUS: true, CARD_NO: true },
              },
            },
          },
        },
        orderBy: [{ APPOINTMENT_DATE: 'asc' }, { START_TIME: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      items: rows.map((r) => this.toStaffBookingRow(r)),
      meta: { page, limit, total },
    };
  }

  async getStaffBooking(bookingId: number) {
    const row = await this.prisma.serviceBookings.findUnique({
      where: { BOOKING_ID: bookingId },
      include: {
        service: {
          select: {
            NAME: true,
            department: { select: { NAME: true } },
          },
        },
        person: {
          select: {
            HOSPITAL_NO: true,
            FIRST_NAME: true,
            LAST_NAME: true,
            cards: {
              orderBy: { CREATED_DATE: 'desc' },
              take: 1,
              select: { CARD_ID: true, PAYMENT_STATUS: true, CARD_NO: true },
            },
          },
        },
      },
    });
    if (!row) throw new NotFoundException('Booking not found');
    return this.toStaffBookingRow(row);
  }

  async confirmBookingPayment(
    bookingId: number,
    input: { paymentChannel: string; paymentRef?: string },
    actor?: AuthUser,
  ) {
    const existing = await this.prisma.serviceBookings.findUnique({
      where: { BOOKING_ID: bookingId },
      include: {
        service: {
          select: {
            NAME: true,
            department: { select: { NAME: true } },
          },
        },
        person: {
          select: {
            HOSPITAL_NO: true,
            FIRST_NAME: true,
            LAST_NAME: true,
            cards: {
              orderBy: { CREATED_DATE: 'desc' },
              take: 1,
              select: { CARD_ID: true, PAYMENT_STATUS: true, CARD_NO: true },
            },
          },
        },
      },
    });
    if (!existing) throw new NotFoundException('Booking not found');
    if (existing.STATUS === 'Cancelled') {
      throw new ConflictException('Cannot pay a cancelled booking');
    }
    if (existing.PAYMENT_STATUS !== 'Pending') {
      throw new ConflictException(
        `Booking payment already ${existing.PAYMENT_STATUS}`,
      );
    }

    const amountDue = this.amountDueForBooking(existing);
    const label = actorLabelOf(actor);
    const now = new Date();
    const updated = await this.prisma.serviceBookings.update({
      where: { BOOKING_ID: bookingId },
      data: {
        PAYMENT_STATUS: 'Paid',
        PAYMENT_CHANNEL: input.paymentChannel,
        PAYMENT_REF: input.paymentRef?.trim() || null,
        PAID_AT: now,
        UPDATED_BY: label,
        UPDATED_DATE: now,
      },
      include: {
        service: {
          select: {
            NAME: true,
            department: { select: { NAME: true } },
          },
        },
        person: {
          select: {
            HOSPITAL_NO: true,
            FIRST_NAME: true,
            LAST_NAME: true,
            cards: {
              orderBy: { CREATED_DATE: 'desc' },
              take: 1,
              select: { CARD_ID: true, PAYMENT_STATUS: true, CARD_NO: true },
            },
          },
        },
      },
    });

    const response = this.toStaffBookingRow(updated);
    await this.audit.log({
      type: 'appointment:payment-confirm',
      entity: 'service_bookings',
      entityId: bookingId,
      personId: existing.PERSON_ID ?? undefined,
      userId: actor?.id,
      createdBy: label,
      item: `Booking ${existing.BOOKING_NO} payment confirmed (${input.paymentChannel})`,
      oldValue: { paymentStatus: 'Pending' },
      newValue: {
        paymentStatus: 'Paid',
        amountDue,
        paymentChannel: input.paymentChannel,
        paymentRef: input.paymentRef ?? null,
      },
    });

    return { ...response, collectedAmount: amountDue };
  }

  async markBookingCheckedIn(bookingId: number, actor?: AuthUser) {
    const existing = await this.prisma.serviceBookings.findUnique({
      where: { BOOKING_ID: bookingId },
      include: {
        service: {
          select: {
            NAME: true,
            department: { select: { NAME: true } },
          },
        },
        person: {
          select: {
            HOSPITAL_NO: true,
            FIRST_NAME: true,
            LAST_NAME: true,
            cards: {
              orderBy: { CREATED_DATE: 'desc' },
              take: 1,
              select: { CARD_ID: true, PAYMENT_STATUS: true, CARD_NO: true },
            },
          },
        },
      },
    });
    if (!existing) throw new NotFoundException('Booking not found');
    if (existing.STATUS === 'Cancelled') {
      throw new ConflictException('Cannot check in a cancelled booking');
    }
    if (existing.STATUS === 'Completed' && existing.CHECKED_IN_AT) {
      return this.toStaffBookingRow(existing);
    }

    const label = actorLabelOf(actor);
    const now = new Date();
    const updated = await this.prisma.serviceBookings.update({
      where: { BOOKING_ID: bookingId },
      data: {
        STATUS: 'Completed',
        CHECKED_IN_AT: now,
        CHECKED_IN_BY: label,
        UPDATED_BY: label,
        UPDATED_DATE: now,
      },
      include: {
        service: {
          select: {
            NAME: true,
            department: { select: { NAME: true } },
          },
        },
        person: {
          select: {
            HOSPITAL_NO: true,
            FIRST_NAME: true,
            LAST_NAME: true,
            cards: {
              orderBy: { CREATED_DATE: 'desc' },
              take: 1,
              select: { CARD_ID: true, PAYMENT_STATUS: true, CARD_NO: true },
            },
          },
        },
      },
    });

    await this.audit.log({
      type: 'appointment:check-in',
      entity: 'service_bookings',
      entityId: bookingId,
      personId: existing.PERSON_ID ?? undefined,
      userId: actor?.id,
      createdBy: label,
      item: `Booking ${existing.BOOKING_NO} checked in`,
      newValue: { status: 'Completed', checkedInAt: now.toISOString() },
    });

    return this.toStaffBookingRow(updated);
  }

  async setMeetingUrl(
    bookingId: number,
    meetingUrl: string | null,
    actor?: { id?: number; email?: string },
  ) {
    const existing = await this.prisma.serviceBookings.findUnique({
      where: { BOOKING_ID: bookingId },
    });
    if (!existing) throw new NotFoundException(`Booking ${bookingId} not found`);
    if (existing.DELIVERY_MODE !== 'ONLINE') {
      throw new BadRequestException('Meeting URL only applies to ONLINE bookings');
    }
    const url = meetingUrl?.trim() || null;
    if (url && !/^https?:\/\//i.test(url)) {
      throw new BadRequestException('Meeting URL must start with http:// or https://');
    }
    const label = actor?.email ?? 'SYSTEM';
    const updated = await this.prisma.serviceBookings.update({
      where: { BOOKING_ID: bookingId },
      data: {
        MEETING_URL: url,
        UPDATED_BY: label,
        UPDATED_DATE: new Date(),
      },
      include: {
        service: {
          select: {
            NAME: true,
            department: { select: { NAME: true } },
          },
        },
        person: {
          select: {
            HOSPITAL_NO: true,
            FIRST_NAME: true,
            LAST_NAME: true,
            cards: {
              orderBy: { CREATED_DATE: 'desc' },
              take: 1,
              select: { CARD_ID: true, PAYMENT_STATUS: true, CARD_NO: true },
            },
          },
        },
      },
    });
    await this.audit.log({
      type: 'appointment:meeting-url',
      entity: 'service_bookings',
      entityId: bookingId,
      personId: existing.PERSON_ID ?? undefined,
      userId: actor?.id,
      createdBy: label,
      item: `Meeting URL ${url ? 'set' : 'cleared'} for ${existing.BOOKING_NO}`,
      newValue: { meetingUrl: url },
    });
    return this.toStaffBookingRow(updated);
  }
}
