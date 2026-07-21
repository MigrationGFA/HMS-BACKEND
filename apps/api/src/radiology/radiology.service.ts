import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../auth/types/auth-user.type';
import type {
  ConfirmImagingRequestPaymentDto,
  CreateImagingRequestDto,
  UpdateImagingRequestDto,
} from './dto/imaging.dto';

const PERSON_SELECT = {
  PERSON_ID: true,
  HOSPITAL_NO: true,
  FIRST_NAME: true,
  LAST_NAME: true,
  MIDDLE_NAME: true,
  SEX: true,
  DATE_OF_BIRTH: true,
  PATIENT_PHONE_NO: true,
} as const;

const REQUEST_INCLUDE = {
  person: { select: PERSON_SELECT },
  doctor: {
    select: { USER_ID: true, FIRST_NAME: true, LAST_NAME: true, EMAIL_ADDRESS: true },
  },
  items: { orderBy: { ITEM_ID: 'asc' as const } },
} satisfies Prisma.ImagingRequestsInclude;

function actorLabel(actor?: AuthUser): string {
  return (
    actor?.email ||
    [actor?.firstName, actor?.lastName].filter(Boolean).join(' ') ||
    'SYSTEM'
  );
}

function pad(n: number): string {
  return String(n).padStart(4, '0');
}

function isPaymentCleared(status: string): boolean {
  return status === 'Paid' || status === 'Waived';
}

function mapPerson(
  p: {
    PERSON_ID: number;
    HOSPITAL_NO: string | null;
    FIRST_NAME: string | null;
    LAST_NAME: string | null;
    MIDDLE_NAME: string | null;
    SEX: string | null;
    DATE_OF_BIRTH: Date | null;
    PATIENT_PHONE_NO: string | null;
  } | null,
) {
  if (!p) return null;
  return {
    personId: p.PERSON_ID,
    hospitalNo: p.HOSPITAL_NO,
    firstName: p.FIRST_NAME,
    lastName: p.LAST_NAME,
    middleName: p.MIDDLE_NAME,
    sex: p.SEX,
    dateOfBirth: p.DATE_OF_BIRTH?.toISOString() ?? null,
    phone: p.PATIENT_PHONE_NO,
  };
}

type RequestRow = Prisma.ImagingRequestsGetPayload<{ include: typeof REQUEST_INCLUDE }>;

function toRequestResponse(row: RequestRow) {
  const paymentCleared = isPaymentCleared(row.PAYMENT_STATUS);
  return {
    imagingRequestId: row.IMAGING_REQUEST_ID,
    requestNo: row.REQUEST_NO,
    personId: row.PERSON_ID,
    encounterId: row.ENCOUNTER_ID,
    doctorId: row.DOCTOR_ID,
    source: row.SOURCE,
    priority: row.PRIORITY,
    clinicalIndication: row.CLINICAL_INDICATION,
    clinicalNotes: row.CLINICAL_NOTES,
    contrast: row.CONTRAST,
    status: row.STATUS,
    paymentStatus: row.PAYMENT_STATUS,
    paymentChannel: row.PAYMENT_CHANNEL,
    paymentRef: row.PAYMENT_REF,
    paidAt: row.PAID_AT?.toISOString() ?? null,
    paidBy: row.PAID_BY,
    totalAmount: Number(row.TOTAL_AMOUNT),
    rejectionReason: row.REJECTION_REASON,
    paymentCleared,
    processingLocked: !paymentCleared,
    createdAt: row.CREATED_DATE?.toISOString() ?? null,
    updatedAt: row.UPDATED_DATE?.toISOString() ?? null,
    doctorName:
      [row.doctor?.FIRST_NAME, row.doctor?.LAST_NAME].filter(Boolean).join(' ') ||
      row.doctor?.EMAIL_ADDRESS ||
      null,
    items: row.items.map((i) => ({
      itemId: i.ITEM_ID,
      imagingStudyId: i.IMAGING_STUDY_ID,
      studyCode: i.STUDY_CODE,
      studyName: i.STUDY_NAME,
      modality: i.MODALITY,
      bodyRegion: i.BODY_REGION,
      unitPrice: Number(i.UNIT_PRICE),
      lineNotes: i.LINE_NOTES,
    })),
    person: mapPerson(row.person),
  };
}

function toStudyResponse(s: {
  IMAGING_STUDY_ID: number;
  STUDY_CODE: string;
  NAME: string;
  MODALITY: string;
  BODY_REGION: string | null;
  TURNAROUND: string | null;
  UNIT_PRICE: Prisma.Decimal;
  STATUS: string;
  CREATED_DATE: Date | null;
  UPDATED_DATE: Date | null;
}) {
  return {
    imagingStudyId: s.IMAGING_STUDY_ID,
    studyCode: s.STUDY_CODE,
    name: s.NAME,
    modality: s.MODALITY,
    bodyRegion: s.BODY_REGION,
    turnaround: s.TURNAROUND,
    unitPrice: Number(s.UNIT_PRICE),
    status: s.STATUS,
    createdAt: s.CREATED_DATE?.toISOString() ?? null,
    updatedAt: s.UPDATED_DATE?.toISOString() ?? null,
  };
}

@Injectable()
export class RadiologyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async listStudies(params?: {
    modality?: string;
    status?: string;
    q?: string;
  }) {
    const where: Prisma.ImagingStudiesWhereInput = {
      STATUS: params?.status?.trim() || 'Active',
    };
    if (params?.modality?.trim()) where.MODALITY = params.modality.trim();
    if (params?.q?.trim()) {
      const q = params.q.trim();
      where.OR = [
        { NAME: { contains: q, mode: 'insensitive' } },
        { STUDY_CODE: { contains: q, mode: 'insensitive' } },
        { MODALITY: { contains: q, mode: 'insensitive' } },
        { BODY_REGION: { contains: q, mode: 'insensitive' } },
      ];
    }
    const rows = await this.prisma.imagingStudies.findMany({
      where,
      orderBy: [{ MODALITY: 'asc' }, { NAME: 'asc' }],
    });
    return { items: rows.map(toStudyResponse) };
  }

  async createRequest(dto: CreateImagingRequestDto, actor?: AuthUser) {
    if (!actor?.id) {
      throw new BadRequestException('Authenticated user required');
    }
    const source = dto.source?.trim() || 'Doctor';
    const person = await this.prisma.persons.findUnique({
      where: { PERSON_ID: dto.personId },
      select: { PERSON_ID: true },
    });
    if (!person) throw new NotFoundException('Patient not found');

    if (dto.encounterId) {
      const enc = await this.prisma.encounters.findUnique({
        where: { ENCOUNTER_ID: dto.encounterId },
        select: { ENCOUNTER_ID: true, PERSON_ID: true },
      });
      if (!enc) throw new NotFoundException('Encounter not found');
      if (enc.PERSON_ID !== dto.personId) {
        throw new BadRequestException('Encounter does not belong to this patient');
      }
    }

    const studyIds = [...new Set(dto.items.map((i) => i.studyId))];
    const studies = await this.prisma.imagingStudies.findMany({
      where: { IMAGING_STUDY_ID: { in: studyIds }, STATUS: 'Active' },
    });
    const studyMap = new Map(studies.map((s) => [s.IMAGING_STUDY_ID, s]));
    const missing = studyIds.filter((id) => !studyMap.has(id));
    if (missing.length > 0) {
      throw new BadRequestException(
        `Unknown or inactive imaging study id(s): ${missing.join(', ')}`,
      );
    }

    const now = new Date();
    const year = now.getFullYear();
    const label = actorLabel(actor);
    let total = 0;
    const itemCreates = dto.items.map((item) => {
      const study = studyMap.get(item.studyId)!;
      total += Number(study.UNIT_PRICE);
      return {
        IMAGING_STUDY_ID: study.IMAGING_STUDY_ID,
        STUDY_CODE: study.STUDY_CODE,
        STUDY_NAME: study.NAME,
        MODALITY: study.MODALITY,
        BODY_REGION: study.BODY_REGION,
        UNIT_PRICE: study.UNIT_PRICE,
        LINE_NOTES: item.lineNotes?.trim() ?? null,
      };
    });

    const created = await this.prisma.$transaction(async (tx) => {
      const row = await tx.imagingRequests.create({
        data: {
          REQUEST_NO: `IMG-${year}-PENDING`,
          PERSON_ID: dto.personId,
          ENCOUNTER_ID: dto.encounterId ?? null,
          DOCTOR_ID: actor.id,
          SOURCE: source,
          PRIORITY: dto.priority ?? 'Routine',
          CLINICAL_INDICATION: dto.clinicalIndication?.trim() ?? null,
          CLINICAL_NOTES: dto.clinicalNotes?.trim() ?? null,
          CONTRAST: dto.contrast?.trim() ?? null,
          STATUS: 'Sent',
          PAYMENT_STATUS: 'Unpaid',
          TOTAL_AMOUNT: total,
          CREATED_BY_ID: actor.id,
          CREATED_BY: label,
          CREATED_DATE: now,
          items: { create: itemCreates },
        },
        include: REQUEST_INCLUDE,
      });
      return tx.imagingRequests.update({
        where: { IMAGING_REQUEST_ID: row.IMAGING_REQUEST_ID },
        data: { REQUEST_NO: `IMG-${year}-${pad(row.IMAGING_REQUEST_ID)}` },
        include: REQUEST_INCLUDE,
      });
    });

    const response = toRequestResponse(created);
    await this.audit.log({
      type: 'imaging:request-create',
      entity: 'imaging_requests',
      entityId: created.IMAGING_REQUEST_ID,
      personId: dto.personId,
      userId: actor.id,
      createdBy: label,
      item: `Imaging request sent (${source}): ${response.requestNo}`,
      newValue: response,
    });
    return response;
  }

  async listRequests(
    params: {
      personId?: number;
      encounterId?: number;
      status?: string;
      paymentStatus?: string;
      source?: string;
      workQueue?: boolean;
      q?: string;
      page?: number;
      limit?: number;
    },
    _actor?: AuthUser,
  ) {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(100, Math.max(1, params.limit ?? 50));
    const where: Prisma.ImagingRequestsWhereInput = {};
    if (params.personId) where.PERSON_ID = params.personId;
    if (params.encounterId) where.ENCOUNTER_ID = params.encounterId;
    if (params.source?.trim()) where.SOURCE = params.source.trim();
    if (params.status?.trim()) {
      const parts = params.status.split(',').map((s) => s.trim()).filter(Boolean);
      where.STATUS = parts.length > 1 ? { in: parts } : parts[0];
    }
    if (params.workQueue === true) {
      where.PAYMENT_STATUS = { in: ['Paid', 'Waived'] };
      where.STATUS = { notIn: ['Cancelled', 'Rejected'] };
    } else if (params.paymentStatus?.trim()) {
      const parts = params.paymentStatus.split(',').map((s) => s.trim()).filter(Boolean);
      where.PAYMENT_STATUS = parts.length > 1 ? { in: parts } : parts[0];
    }
    if (params.q?.trim()) {
      const q = params.q.trim();
      where.OR = [
        { REQUEST_NO: { contains: q, mode: 'insensitive' } },
        { CLINICAL_INDICATION: { contains: q, mode: 'insensitive' } },
        { person: { HOSPITAL_NO: { contains: q, mode: 'insensitive' } } },
        { person: { FIRST_NAME: { contains: q, mode: 'insensitive' } } },
        { person: { LAST_NAME: { contains: q, mode: 'insensitive' } } },
      ];
    }

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.imagingRequests.count({ where }),
      this.prisma.imagingRequests.findMany({
        where,
        include: REQUEST_INCLUDE,
        orderBy: { CREATED_DATE: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      items: rows.map(toRequestResponse),
      meta: { page, limit, total },
    };
  }

  async findRequestById(id: number) {
    const row = await this.prisma.imagingRequests.findUnique({
      where: { IMAGING_REQUEST_ID: id },
      include: REQUEST_INCLUDE,
    });
    if (!row) throw new NotFoundException('Imaging request not found');
    return toRequestResponse(row);
  }

  async updateRequest(
    id: number,
    dto: UpdateImagingRequestDto,
    actor?: AuthUser,
  ) {
    const existing = await this.prisma.imagingRequests.findUnique({
      where: { IMAGING_REQUEST_ID: id },
      include: REQUEST_INCLUDE,
    });
    if (!existing) throw new NotFoundException('Imaging request not found');

    if (dto.status === 'Accepted' || dto.status === 'Scheduled' || dto.status === 'InProgress') {
      if (!isPaymentCleared(existing.PAYMENT_STATUS)) {
        throw new BadRequestException(
          'Payment required before radiology can attend to this request',
        );
      }
    }

    const now = new Date();
    const label = actorLabel(actor);
    const row = await this.prisma.imagingRequests.update({
      where: { IMAGING_REQUEST_ID: id },
      data: {
        ...(dto.status != null ? { STATUS: dto.status } : {}),
        ...(dto.rejectionReason !== undefined
          ? { REJECTION_REASON: dto.rejectionReason.trim() || null }
          : {}),
        UPDATED_BY_ID: actor?.id ?? null,
        UPDATED_BY: label,
        UPDATED_DATE: now,
      },
      include: REQUEST_INCLUDE,
    });
    const response = toRequestResponse(row);
    await this.audit.log({
      type: 'imaging:request-update',
      entity: 'imaging_requests',
      entityId: id,
      personId: existing.PERSON_ID,
      userId: actor?.id,
      createdBy: label,
      item: `Imaging request updated: ${response.requestNo}`,
      oldValue: toRequestResponse(existing),
      newValue: response,
    });
    return response;
  }

  async cancelRequest(id: number, actor?: AuthUser) {
    const existing = await this.prisma.imagingRequests.findUnique({
      where: { IMAGING_REQUEST_ID: id },
      include: REQUEST_INCLUDE,
    });
    if (!existing) throw new NotFoundException('Imaging request not found');
    if (existing.STATUS === 'Cancelled') {
      throw new BadRequestException('Already cancelled');
    }
    if (isPaymentCleared(existing.PAYMENT_STATUS)) {
      throw new BadRequestException('Cannot cancel a paid imaging request');
    }
    const now = new Date();
    const label = actorLabel(actor);
    const row = await this.prisma.imagingRequests.update({
      where: { IMAGING_REQUEST_ID: id },
      data: {
        STATUS: 'Cancelled',
        UPDATED_BY_ID: actor?.id ?? null,
        UPDATED_BY: label,
        UPDATED_DATE: now,
      },
      include: REQUEST_INCLUDE,
    });
    const response = toRequestResponse(row);
    await this.audit.log({
      type: 'imaging:request-cancel',
      entity: 'imaging_requests',
      entityId: id,
      personId: existing.PERSON_ID,
      userId: actor?.id,
      createdBy: label,
      item: `Imaging request cancelled: ${response.requestNo}`,
      oldValue: toRequestResponse(existing),
      newValue: response,
    });
    return response;
  }

  async confirmPayment(
    id: number,
    dto: ConfirmImagingRequestPaymentDto,
    actor?: AuthUser,
  ) {
    const existing = await this.prisma.imagingRequests.findUnique({
      where: { IMAGING_REQUEST_ID: id },
      include: REQUEST_INCLUDE,
    });
    if (!existing) throw new NotFoundException('Imaging request not found');
    if (existing.STATUS === 'Cancelled' || existing.STATUS === 'Rejected') {
      throw new BadRequestException('Cannot pay a cancelled/rejected imaging request');
    }
    if (existing.PAYMENT_STATUS === 'Paid') {
      throw new BadRequestException('Imaging request already paid');
    }
    if (existing.PAYMENT_STATUS === 'Waived') {
      throw new BadRequestException('Imaging request payment was waived');
    }
    const now = new Date();
    const label = actorLabel(actor);
    const row = await this.prisma.imagingRequests.update({
      where: { IMAGING_REQUEST_ID: id },
      data: {
        PAYMENT_STATUS: 'Paid',
        PAYMENT_CHANNEL: dto.paymentChannel,
        PAYMENT_REF: dto.paymentRef?.trim() ?? null,
        PAID_AT: now,
        PAID_BY: label,
        UPDATED_BY_ID: actor?.id ?? null,
        UPDATED_BY: label,
        UPDATED_DATE: now,
      },
      include: REQUEST_INCLUDE,
    });
    const response = toRequestResponse(row);
    await this.audit.log({
      type: 'imaging:pay',
      entity: 'imaging_requests',
      entityId: id,
      personId: existing.PERSON_ID,
      userId: actor?.id,
      createdBy: label,
      item: `Imaging request paid: ${response.requestNo}`,
      oldValue: { paymentStatus: existing.PAYMENT_STATUS },
      newValue: response,
    });
    return response;
  }
}
