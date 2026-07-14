import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CardsService, type CardResponse } from './cards.service';
import { CreatePersonDto } from './dto/create-person.dto';
import { UpdatePersonDto } from './dto/update-person.dto';
import type { AuthUser } from '../auth/types/auth-user.type';

export type PersonResponse = {
  personId: number;
  hospitalNo: string | null;
  firstName: string | null;
  lastName: string | null;
  middleName: string | null;
  sex: string | null;
  dateOfBirth: string | null;
  maritalStatus: string | null;
  religion: string | null;
  tribe: string | null;
  ethnicGroup: string | null;
  residentialAddress: string | null;
  homeTown: string | null;
  stateOfOrigin: string | null;
  nationality: string | null;
  patientPhoneNo: string | null;
  email: string | null;
  occupation: string | null;
  nameOfEmployer: string | null;
  nameOfNextOfKin: string | null;
  relationship: string | null;
  addressOfNextOfKin: string | null;
  telephoneOfNextOfKin: string | null;
  identityType: string | null;
  identityNo: string | null;
  nhisNo: string | null;
  bloodGroup: string | null;
  patientType: string | null;
  regType: string | null;
  cardNo: string | null;
  status: string | null;
  dateOfRegistration: string | null;
  createdAt: string | null;
  /** Registration card opened at registration; payment starts Pending. */
  card?: CardResponse | null;
};

@Injectable()
export class PatientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly cards: CardsService,
  ) {}

  async register(dto: CreatePersonDto, actor?: AuthUser): Promise<PersonResponse> {
    const phone = dto.patientPhoneNo.trim();
    const identityNo = dto.identityNo?.trim();

    if (identityNo) {
      const byIdentity = await this.prisma.persons.findFirst({
        where: {
          IDENTITY_NO: identityNo,
          DISCONTINUE_FLAG: { not: 'Y' },
        },
      });
      if (byIdentity) {
        throw new ConflictException({
          message: 'A person with this identity number already exists',
          existingPersonId: byIdentity.PERSON_ID,
          existingHospitalNo: byIdentity.HOSPITAL_NO,
        });
      }
    }

    const byPhone = await this.prisma.persons.findFirst({
      where: {
        PATIENT_PHONE_NO: phone,
        LAST_NAME: { equals: dto.lastName.trim(), mode: 'insensitive' },
        FIRST_NAME: { equals: dto.firstName.trim(), mode: 'insensitive' },
        DISCONTINUE_FLAG: { not: 'Y' },
      },
    });
    if (byPhone) {
      throw new ConflictException({
        message: 'A person with this name and phone already exists',
        existingPersonId: byPhone.PERSON_ID,
        existingHospitalNo: byPhone.HOSPITAL_NO,
      });
    }

    const hospitalNo = await this.nextHospitalNo();
    const actorLabel =
      actor?.email ||
      [actor?.firstName, actor?.lastName].filter(Boolean).join(' ') ||
      'SYSTEM';

    const created = await this.prisma.persons.create({
      data: {
        HOSPITAL_NO: hospitalNo,
        FIRST_NAME: dto.firstName.trim(),
        LAST_NAME: dto.lastName.trim(),
        MIDDLE_NAME: dto.middleName?.trim() || null,
        SEX: dto.sex,
        M_STATUS: dto.maritalStatus?.trim() || null,
        DATE_OF_BIRTH: dto.dateOfBirth ? new Date(dto.dateOfBirth) : null,
        RELIGON: dto.religion?.trim() || null,
        TRIBE: dto.tribe?.trim() || null,
        ETHNIC_GROUP: dto.ethnicGroup?.trim() || null,
        RESIDENTIAL_ADDRESS: dto.residentialAddress?.trim() || null,
        HOME_TOWN: dto.homeTown?.trim() || null,
        STATE_OF_ORIGIN: dto.stateOfOrigin?.trim() || null,
        NATIONALITY: dto.nationality?.trim() || 'Nigerian',
        PATIENT_PHONE_NO: phone,
        E_MAIL: dto.email?.trim() || null,
        OCCUPATION: dto.occupation?.trim() || null,
        NAME_OF_EMPLOYER: dto.nameOfEmployer?.trim() || null,
        NAME_OF_NEXT_OF_KIN: dto.nameOfNextOfKin?.trim() || null,
        RELATIONSHIP: dto.relationship?.trim() || null,
        ADDRESS_OF_NEXT_OF_KIN: dto.addressOfNextOfKin?.trim() || null,
        TELEPHONE_OF_NEXT_OF_KIN: dto.telephoneOfNextOfKin?.trim() || null,
        IDENTITY_TYPE: dto.identityType?.trim() || (identityNo ? 'NIN' : null),
        IDENTITY_NO: identityNo || null,
        NHIS_NO: dto.nhisNo?.trim() || null,
        BLOOD_GROUP: dto.bloodGroup?.trim() || null,
        PATIENT_TYPE: dto.patientType?.trim() || null,
        REG_TYPE: dto.regType?.trim() || 'Walk-In',
        CARD_NO: dto.cardNo?.trim() || hospitalNo,
        CARD_STATUS: 'Pending Payment',
        // Awaiting cashier confirmation — Records finishes after payment.
        STATUS: 'Pending Payment',
        DISCONTINUE_FLAG: 'N',
        DATE_OF_REGISTRATION: new Date(),
        CREATED_BY: actorLabel,
        CREATED_DATE: new Date(),
      },
    });

    await this.audit.log({
      type: 'person:create',
      entity: 'persons',
      entityId: created.PERSON_ID,
      personId: created.PERSON_ID,
      userId: actor?.id,
      createdBy: actorLabel,
      item: `Person registered ${created.HOSPITAL_NO}`,
      newValue: {
        personId: created.PERSON_ID,
        hospitalNo: created.HOSPITAL_NO,
        firstName: created.FIRST_NAME,
        lastName: created.LAST_NAME,
      },
    });

    // Open the registration card. Payment stays Pending until a cashier
    // confirms it — Records cannot continue the workflow before that.
    const card = await this.cards.createForPerson(
      {
        personId: created.PERSON_ID,
        cardNo: created.CARD_NO ?? hospitalNo,
        cardFee: dto.cardFee,
        regFee: dto.regFee,
        consultFee: dto.consultFee,
      },
      actor,
    );

    return { ...this.toResponse(created), card };
  }

  async update(
    personId: number,
    dto: UpdatePersonDto,
    actor?: AuthUser,
  ): Promise<PersonResponse> {
    const existing = await this.prisma.persons.findUnique({
      where: { PERSON_ID: personId },
    });
    if (!existing || existing.DISCONTINUE_FLAG === 'Y') {
      throw new NotFoundException('Person not found');
    }

    const actorLabel =
      actor?.email ||
      [actor?.firstName, actor?.lastName].filter(Boolean).join(' ') ||
      'SYSTEM';

    const updated = await this.prisma.persons.update({
      where: { PERSON_ID: personId },
      data: {
        ...(dto.middleName !== undefined
          ? { MIDDLE_NAME: dto.middleName.trim() || null }
          : {}),
        ...(dto.sex !== undefined ? { SEX: dto.sex } : {}),
        ...(dto.dateOfBirth !== undefined
          ? { DATE_OF_BIRTH: dto.dateOfBirth ? new Date(dto.dateOfBirth) : null }
          : {}),
        ...(dto.maritalStatus !== undefined
          ? { M_STATUS: dto.maritalStatus.trim() || null }
          : {}),
        ...(dto.religion !== undefined
          ? { RELIGON: dto.religion.trim() || null }
          : {}),
        ...(dto.tribe !== undefined ? { TRIBE: dto.tribe.trim() || null } : {}),
        ...(dto.ethnicGroup !== undefined
          ? { ETHNIC_GROUP: dto.ethnicGroup.trim() || null }
          : {}),
        ...(dto.residentialAddress !== undefined
          ? { RESIDENTIAL_ADDRESS: dto.residentialAddress.trim() || null }
          : {}),
        ...(dto.homeTown !== undefined
          ? { HOME_TOWN: dto.homeTown.trim() || null }
          : {}),
        ...(dto.stateOfOrigin !== undefined
          ? { STATE_OF_ORIGIN: dto.stateOfOrigin.trim() || null }
          : {}),
        ...(dto.nationality !== undefined
          ? { NATIONALITY: dto.nationality.trim() || null }
          : {}),
        ...(dto.patientPhoneNo !== undefined
          ? { PATIENT_PHONE_NO: dto.patientPhoneNo.trim() }
          : {}),
        ...(dto.email !== undefined
          ? { E_MAIL: dto.email.trim() || null }
          : {}),
        ...(dto.occupation !== undefined
          ? { OCCUPATION: dto.occupation.trim() || null }
          : {}),
        ...(dto.nameOfEmployer !== undefined
          ? { NAME_OF_EMPLOYER: dto.nameOfEmployer.trim() || null }
          : {}),
        ...(dto.nameOfNextOfKin !== undefined
          ? { NAME_OF_NEXT_OF_KIN: dto.nameOfNextOfKin.trim() || null }
          : {}),
        ...(dto.relationship !== undefined
          ? { RELATIONSHIP: dto.relationship.trim() || null }
          : {}),
        ...(dto.addressOfNextOfKin !== undefined
          ? { ADDRESS_OF_NEXT_OF_KIN: dto.addressOfNextOfKin.trim() || null }
          : {}),
        ...(dto.telephoneOfNextOfKin !== undefined
          ? { TELEPHONE_OF_NEXT_OF_KIN: dto.telephoneOfNextOfKin.trim() || null }
          : {}),
        ...(dto.identityType !== undefined
          ? { IDENTITY_TYPE: dto.identityType.trim() || null }
          : {}),
        ...(dto.identityNo !== undefined
          ? { IDENTITY_NO: dto.identityNo.trim() || null }
          : {}),
        ...(dto.nhisNo !== undefined
          ? { NHIS_NO: dto.nhisNo.trim() || null }
          : {}),
        ...(dto.bloodGroup !== undefined
          ? { BLOOD_GROUP: dto.bloodGroup.trim() || null }
          : {}),
        ...(dto.patientType !== undefined
          ? { PATIENT_TYPE: dto.patientType.trim() || null }
          : {}),
        ...(dto.regType !== undefined
          ? { REG_TYPE: dto.regType.trim() || null }
          : {}),
        ...(dto.status !== undefined ? { STATUS: dto.status } : {}),
        UPDATED_BY: actorLabel,
        UPDATED_DATE: new Date(),
      },
    });

    await this.audit.log({
      type: 'person:update',
      entity: 'persons',
      entityId: updated.PERSON_ID,
      personId: updated.PERSON_ID,
      userId: actor?.id,
      createdBy: actorLabel,
      item: `Person ${updated.HOSPITAL_NO} updated`,
      newValue: dto,
    });

    return this.toResponse(updated);
  }

  async findById(personId: number): Promise<PersonResponse> {
    const person = await this.prisma.persons.findUnique({
      where: { PERSON_ID: personId },
    });
    if (!person || person.DISCONTINUE_FLAG === 'Y') {
      throw new NotFoundException('Person not found');
    }
    return this.toResponse(person);
  }

  async search(q?: string, page = 1, limit = 20) {
    const take = Math.min(Math.max(limit, 1), 100);
    const skip = (Math.max(page, 1) - 1) * take;
    const term = q?.trim();

    const where = term
      ? {
          DISCONTINUE_FLAG: { not: 'Y' as const },
          OR: [
            { HOSPITAL_NO: { contains: term, mode: 'insensitive' as const } },
            { FIRST_NAME: { contains: term, mode: 'insensitive' as const } },
            { LAST_NAME: { contains: term, mode: 'insensitive' as const } },
            { PATIENT_PHONE_NO: { contains: term } },
            { IDENTITY_NO: { contains: term } },
            { NHIS_NO: { contains: term } },
          ],
        }
      : { DISCONTINUE_FLAG: { not: 'Y' as const } };

    const [rows, total] = await Promise.all([
      this.prisma.persons.findMany({
        where,
        orderBy: { CREATED_DATE: 'desc' },
        skip,
        take,
      }),
      this.prisma.persons.count({ where }),
    ]);

    return {
      items: rows.map((r) => this.toResponse(r)),
      meta: { page: Math.max(page, 1), limit: take, total },
    };
  }

  private async nextHospitalNo(): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `FNPH/ARO/${year}/`;
    const latest = await this.prisma.persons.findFirst({
      where: { HOSPITAL_NO: { startsWith: prefix } },
      orderBy: { HOSPITAL_NO: 'desc' },
      select: { HOSPITAL_NO: true },
    });

    let seq = 1;
    if (latest?.HOSPITAL_NO) {
      const tail = latest.HOSPITAL_NO.slice(prefix.length);
      const n = Number.parseInt(tail, 10);
      if (!Number.isNaN(n)) seq = n + 1;
    }

    return `${prefix}${String(seq).padStart(6, '0')}`;
  }

  private toResponse(row: {
    PERSON_ID: number;
    HOSPITAL_NO: string | null;
    FIRST_NAME: string | null;
    LAST_NAME: string | null;
    MIDDLE_NAME: string | null;
    SEX: string | null;
    DATE_OF_BIRTH: Date | null;
    M_STATUS: string | null;
    RELIGON: string | null;
    TRIBE: string | null;
    ETHNIC_GROUP: string | null;
    RESIDENTIAL_ADDRESS: string | null;
    HOME_TOWN: string | null;
    STATE_OF_ORIGIN: string | null;
    NATIONALITY: string | null;
    PATIENT_PHONE_NO: string | null;
    E_MAIL: string | null;
    OCCUPATION: string | null;
    NAME_OF_EMPLOYER: string | null;
    NAME_OF_NEXT_OF_KIN: string | null;
    RELATIONSHIP: string | null;
    ADDRESS_OF_NEXT_OF_KIN: string | null;
    TELEPHONE_OF_NEXT_OF_KIN: string | null;
    IDENTITY_TYPE: string | null;
    IDENTITY_NO: string | null;
    NHIS_NO: string | null;
    BLOOD_GROUP: string | null;
    PATIENT_TYPE: string | null;
    REG_TYPE: string | null;
    CARD_NO: string | null;
    STATUS: string | null;
    DATE_OF_REGISTRATION: Date | null;
    CREATED_DATE: Date | null;
  }): PersonResponse {
    return {
      personId: row.PERSON_ID,
      hospitalNo: row.HOSPITAL_NO,
      firstName: row.FIRST_NAME,
      lastName: row.LAST_NAME,
      middleName: row.MIDDLE_NAME,
      sex: row.SEX,
      dateOfBirth: row.DATE_OF_BIRTH?.toISOString() ?? null,
      maritalStatus: row.M_STATUS,
      religion: row.RELIGON,
      tribe: row.TRIBE,
      ethnicGroup: row.ETHNIC_GROUP,
      residentialAddress: row.RESIDENTIAL_ADDRESS,
      homeTown: row.HOME_TOWN,
      stateOfOrigin: row.STATE_OF_ORIGIN,
      nationality: row.NATIONALITY,
      patientPhoneNo: row.PATIENT_PHONE_NO,
      email: row.E_MAIL,
      occupation: row.OCCUPATION,
      nameOfEmployer: row.NAME_OF_EMPLOYER,
      nameOfNextOfKin: row.NAME_OF_NEXT_OF_KIN,
      relationship: row.RELATIONSHIP,
      addressOfNextOfKin: row.ADDRESS_OF_NEXT_OF_KIN,
      telephoneOfNextOfKin: row.TELEPHONE_OF_NEXT_OF_KIN,
      identityType: row.IDENTITY_TYPE,
      identityNo: row.IDENTITY_NO,
      nhisNo: row.NHIS_NO,
      bloodGroup: row.BLOOD_GROUP,
      patientType: row.PATIENT_TYPE,
      regType: row.REG_TYPE,
      cardNo: row.CARD_NO,
      status: row.STATUS,
      dateOfRegistration: row.DATE_OF_REGISTRATION?.toISOString() ?? null,
      createdAt: row.CREATED_DATE?.toISOString() ?? null,
    };
  }
}
