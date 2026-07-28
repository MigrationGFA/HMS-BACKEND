import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import type { AuthUser } from '../../auth/types/auth-user.type';
import type {
  CancelCertificateDto,
  CreateCertificateDto,
  NoteDto,
  UpdateCertificateDto,
} from './dto/certificate.dto';

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

const EDITABLE = new Set(['Draft']);
const TERMINAL = new Set(['Issued', 'Expired', 'Cancelled']);

function actorLabelOf(actor?: AuthUser): string {
  return (
    [actor?.firstName, actor?.lastName].filter(Boolean).join(' ') ||
    actor?.email ||
    'SYSTEM'
  );
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
  } | null | undefined,
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
    fullName: [p.FIRST_NAME, p.MIDDLE_NAME, p.LAST_NAME]
      .filter(Boolean)
      .join(' '),
  };
}

function mapTemplate(t: {
  TEMPLATE_ID: number;
  CODE: string;
  NAME: string;
  DESCRIPTION: string | null;
  CATEGORY: string;
  FIELD_SCHEMA: Prisma.JsonValue;
  APPROVAL_REQUIRED: boolean;
  LAYOUT: string;
  STATUS: string;
}) {
  return {
    templateId: t.TEMPLATE_ID,
    code: t.CODE,
    name: t.NAME,
    description: t.DESCRIPTION,
    category: t.CATEGORY,
    fieldSchema: t.FIELD_SCHEMA,
    approvalRequired: t.APPROVAL_REQUIRED,
    layout: t.LAYOUT,
    status: t.STATUS,
  };
}

const INCLUDE = {
  person: { select: PERSON_SELECT },
  template: true,
  events: { orderBy: { CREATED_DATE: 'asc' as const } },
} satisfies Prisma.ClinicalCertificatesInclude;

type Row = Prisma.ClinicalCertificatesGetPayload<{ include: typeof INCLUDE }>;

@Injectable()
export class CertificatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private toResponse(row: Row) {
    return {
      certificateId: row.CERTIFICATE_ID,
      docNo: row.DOC_NO,
      personId: row.PERSON_ID,
      templateId: row.TEMPLATE_ID,
      status: row.STATUS,
      fields: row.FIELDS,
      layout: row.LAYOUT,
      validityUntil: row.VALIDITY_UNTIL?.toISOString() ?? null,
      locked: row.LOCKED,
      qrCode: row.QR_CODE,
      signedAt: row.SIGNED_AT?.toISOString() ?? null,
      signedBy: row.SIGNED_BY,
      signedByUserId: row.SIGNED_BY_USER_ID,
      issuedAt: row.ISSUED_AT?.toISOString() ?? null,
      issuedBy: row.ISSUED_BY,
      issuedByUserId: row.ISSUED_BY_USER_ID,
      approvedAt: row.APPROVED_AT?.toISOString() ?? null,
      approvedBy: row.APPROVED_BY,
      approvedByUserId: row.APPROVED_BY_USER_ID,
      authorUserId: row.AUTHOR_USER_ID,
      createdBy: row.CREATED_BY,
      createdAt: row.CREATED_DATE?.toISOString() ?? null,
      updatedAt: row.UPDATED_DATE?.toISOString() ?? null,
      person: mapPerson(row.person),
      template: mapTemplate(row.template),
      events: row.events.map((e) => ({
        eventId: e.EVENT_ID,
        eventType: e.EVENT_TYPE,
        actorUserId: e.ACTOR_USER_ID,
        actorLabel: e.ACTOR_LABEL,
        note: e.NOTE,
        oldStatus: e.OLD_STATUS,
        newStatus: e.NEW_STATUS,
        createdAt: e.CREATED_DATE.toISOString(),
      })),
    };
  }

  private async nextDocNo(tx: Prisma.TransactionClient): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `DOC-${year}-`;
    const latest = await tx.clinicalCertificates.findFirst({
      where: { DOC_NO: { startsWith: prefix } },
      orderBy: { DOC_NO: 'desc' },
      select: { DOC_NO: true },
    });
    let seq = 1;
    if (latest?.DOC_NO) {
      const n = Number(latest.DOC_NO.slice(prefix.length));
      if (!Number.isNaN(n)) seq = n + 1;
    }
    return `${prefix}${String(seq).padStart(4, '0')}`;
  }

  private async addEvent(
    tx: Prisma.TransactionClient,
    input: {
      certificateId: number;
      eventType: string;
      actor?: AuthUser;
      note?: string;
      oldStatus?: string;
      newStatus?: string;
    },
  ) {
    await tx.clinicalCertificateEvents.create({
      data: {
        CERTIFICATE_ID: input.certificateId,
        EVENT_TYPE: input.eventType,
        ACTOR_USER_ID: input.actor?.id ?? null,
        ACTOR_LABEL: actorLabelOf(input.actor),
        NOTE: input.note ?? null,
        OLD_STATUS: input.oldStatus ?? null,
        NEW_STATUS: input.newStatus ?? null,
      },
    });
  }

  async listTemplates() {
    const rows = await this.prisma.certificateTemplates.findMany({
      where: { STATUS: 'Active' },
      orderBy: { NAME: 'asc' },
    });
    return rows.map(mapTemplate);
  }

  async getTemplate(id: number) {
    const row = await this.prisma.certificateTemplates.findUnique({
      where: { TEMPLATE_ID: id },
    });
    if (!row) throw new NotFoundException('Template not found');
    return mapTemplate(row);
  }

  async summary(user: AuthUser) {
    const authorFilter = { AUTHOR_USER_ID: user.id };
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);

    const [drafts, pendingSig, pendingApproval, issuedMonth, totalMine] =
      await Promise.all([
        this.prisma.clinicalCertificates.count({
          where: { ...authorFilter, STATUS: 'Draft' },
        }),
        this.prisma.clinicalCertificates.count({
          where: { ...authorFilter, STATUS: 'PendingSignature' },
        }),
        this.prisma.clinicalCertificates.count({
          where: { ...authorFilter, STATUS: 'PendingApproval' },
        }),
        this.prisma.clinicalCertificates.count({
          where: {
            ...authorFilter,
            STATUS: 'Issued',
            ISSUED_AT: { gte: monthStart },
          },
        }),
        this.prisma.clinicalCertificates.count({ where: authorFilter }),
      ]);

    return {
      drafts,
      pendingSignature: pendingSig,
      pendingApproval,
      issuedMonth,
      total: totalMine,
    };
  }

  async list(
    params: {
      scope?: string;
      status?: string;
      personId?: number;
      q?: string;
      page?: number;
      limit?: number;
    },
    user: AuthUser,
  ) {
    const page = Math.max(params.page ?? 1, 1);
    const limit = Math.min(Math.max(params.limit ?? 50, 1), 200);
    const scope = params.scope ?? 'mine';
    const q = params.q?.trim();

    const where: Prisma.ClinicalCertificatesWhereInput = {
      ...(scope === 'mine' ? { AUTHOR_USER_ID: user.id } : {}),
      ...(params.status ? { STATUS: params.status } : {}),
      ...(params.personId != null ? { PERSON_ID: params.personId } : {}),
      ...(q
        ? {
            OR: [
              { DOC_NO: { contains: q, mode: 'insensitive' } },
              {
                person: {
                  OR: [
                    { HOSPITAL_NO: { contains: q, mode: 'insensitive' } },
                    { FIRST_NAME: { contains: q, mode: 'insensitive' } },
                    { LAST_NAME: { contains: q, mode: 'insensitive' } },
                  ],
                },
              },
              {
                template: {
                  NAME: { contains: q, mode: 'insensitive' },
                },
              },
            ],
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.clinicalCertificates.findMany({
        where,
        include: INCLUDE,
        orderBy: { CREATED_DATE: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.clinicalCertificates.count({ where }),
    ]);

    return {
      items: rows.map((r) => this.toResponse(r)),
      meta: { page, limit, total },
    };
  }

  async findOne(id: number) {
    const row = await this.prisma.clinicalCertificates.findUnique({
      where: { CERTIFICATE_ID: id },
      include: INCLUDE,
    });
    if (!row) throw new NotFoundException('Certificate not found');
    return this.toResponse(row);
  }

  async create(dto: CreateCertificateDto, user: AuthUser) {
    const person = await this.prisma.persons.findUnique({
      where: { PERSON_ID: dto.personId },
      select: { PERSON_ID: true },
    });
    if (!person) throw new NotFoundException('Patient not found');

    const template = await this.prisma.certificateTemplates.findUnique({
      where: { TEMPLATE_ID: dto.templateId },
    });
    if (!template || template.STATUS !== 'Active') {
      throw new BadRequestException('Template not found or inactive');
    }

    const label = actorLabelOf(user);
    const now = new Date();
    const validity = dto.validityUntil ? new Date(dto.validityUntil) : null;

    const row = await this.prisma.$transaction(async (tx) => {
      const docNo = await this.nextDocNo(tx);
      const created = await tx.clinicalCertificates.create({
        data: {
          DOC_NO: docNo,
          PERSON_ID: dto.personId,
          TEMPLATE_ID: dto.templateId,
          STATUS: 'Draft',
          FIELDS: (dto.fields ?? {}) as Prisma.InputJsonValue,
          LAYOUT: dto.layout ?? template.LAYOUT,
          VALIDITY_UNTIL: validity,
          AUTHOR_USER_ID: user.id,
          CREATED_BY_ID: user.id,
          CREATED_BY: label,
          CREATED_DATE: now,
          UPDATED_BY_ID: user.id,
          UPDATED_BY: label,
          UPDATED_DATE: now,
        },
        include: INCLUDE,
      });
      await this.addEvent(tx, {
        certificateId: created.CERTIFICATE_ID,
        eventType: 'Created',
        actor: user,
        newStatus: 'Draft',
        note: `Draft created from ${template.NAME}`,
      });
      return created;
    });

    await this.audit.log({
      type: 'certificate:create',
      item: `Certificate ${row.DOC_NO}`,
      entity: 'ClinicalCertificates',
      entityId: row.CERTIFICATE_ID,
      personId: row.PERSON_ID,
      userId: user.id,
      createdBy: label,
      newValue: { docNo: row.DOC_NO, templateId: dto.templateId },
    });

    return this.toResponse(row);
  }

  async update(id: number, dto: UpdateCertificateDto, user: AuthUser) {
    const existing = await this.prisma.clinicalCertificates.findUnique({
      where: { CERTIFICATE_ID: id },
      include: INCLUDE,
    });
    if (!existing) throw new NotFoundException('Certificate not found');
    if (!EDITABLE.has(existing.STATUS) || existing.LOCKED) {
      throw new ConflictException(
        `Cannot update certificate in status ${existing.STATUS}`,
      );
    }

    const label = actorLabelOf(user);
    const now = new Date();
    const row = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.clinicalCertificates.update({
        where: { CERTIFICATE_ID: id },
        data: {
          ...(dto.fields != null
            ? { FIELDS: dto.fields as Prisma.InputJsonValue }
            : {}),
          ...(dto.layout != null ? { LAYOUT: dto.layout } : {}),
          ...(dto.validityUntil !== undefined
            ? {
                VALIDITY_UNTIL: dto.validityUntil
                  ? new Date(dto.validityUntil)
                  : null,
              }
            : {}),
          UPDATED_BY_ID: user.id,
          UPDATED_BY: label,
          UPDATED_DATE: now,
        },
        include: INCLUDE,
      });
      await this.addEvent(tx, {
        certificateId: id,
        eventType: 'Updated',
        actor: user,
        oldStatus: existing.STATUS,
        newStatus: existing.STATUS,
        note: 'Fields updated',
      });
      return updated;
    });

    await this.audit.log({
      type: 'certificate:update',
      item: `Certificate ${existing.DOC_NO}`,
      entity: 'ClinicalCertificates',
      entityId: id,
      personId: existing.PERSON_ID,
      userId: user.id,
      createdBy: label,
    });

    return this.toResponse(row);
  }

  /**
   * Draft → PendingSignature (always). Sign endpoint issues or routes to approval.
   */
  async submitSign(id: number, dto: NoteDto, user: AuthUser) {
    const existing = await this.prisma.clinicalCertificates.findUnique({
      where: { CERTIFICATE_ID: id },
      include: INCLUDE,
    });
    if (!existing) throw new NotFoundException('Certificate not found');
    if (existing.STATUS !== 'Draft') {
      throw new ConflictException(
        `Submit for signature only from Draft (current: ${existing.STATUS})`,
      );
    }

    const label = actorLabelOf(user);
    const now = new Date();
    const newStatus = 'PendingSignature';

    const row = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.clinicalCertificates.update({
        where: { CERTIFICATE_ID: id },
        data: {
          STATUS: newStatus,
          UPDATED_BY_ID: user.id,
          UPDATED_BY: label,
          UPDATED_DATE: now,
        },
        include: INCLUDE,
      });
      await this.addEvent(tx, {
        certificateId: id,
        eventType: 'SubmitSign',
        actor: user,
        note: dto.note,
        oldStatus: 'Draft',
        newStatus,
      });
      return updated;
    });

    await this.audit.log({
      type: 'certificate:submit-sign',
      item: `Certificate ${existing.DOC_NO}`,
      entity: 'ClinicalCertificates',
      entityId: id,
      personId: existing.PERSON_ID,
      userId: user.id,
      createdBy: label,
      newValue: { status: newStatus },
    });

    return this.toResponse(row);
  }

  async sign(id: number, dto: NoteDto, user: AuthUser) {
    const existing = await this.prisma.clinicalCertificates.findUnique({
      where: { CERTIFICATE_ID: id },
      include: INCLUDE,
    });
    if (!existing) throw new NotFoundException('Certificate not found');
    if (existing.STATUS !== 'PendingSignature' && existing.STATUS !== 'Draft') {
      throw new ConflictException(
        `Sign only from Draft or PendingSignature (current: ${existing.STATUS})`,
      );
    }

    const approvalRequired = existing.template.APPROVAL_REQUIRED;
    const label = actorLabelOf(user);
    const now = new Date();
    const newStatus = approvalRequired ? 'PendingApproval' : 'Issued';
    const qrCode = `FNPH-VERIFY-${existing.DOC_NO}`;

    const row = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.clinicalCertificates.update({
        where: { CERTIFICATE_ID: id },
        data: {
          STATUS: newStatus,
          SIGNED_AT: now,
          SIGNED_BY: label,
          SIGNED_BY_USER_ID: user.id,
          LOCKED: !approvalRequired,
          QR_CODE: qrCode,
          ...(approvalRequired
            ? {}
            : {
                ISSUED_AT: now,
                ISSUED_BY: label,
                ISSUED_BY_USER_ID: user.id,
                LOCKED: true,
              }),
          UPDATED_BY_ID: user.id,
          UPDATED_BY: label,
          UPDATED_DATE: now,
        },
        include: INCLUDE,
      });
      await this.addEvent(tx, {
        certificateId: id,
        eventType: 'Signed',
        actor: user,
        note: dto.note,
        oldStatus: existing.STATUS,
        newStatus,
      });
      if (!approvalRequired) {
        await this.addEvent(tx, {
          certificateId: id,
          eventType: 'Issued',
          actor: user,
          note: 'Issued on sign (no approval required)',
          oldStatus: newStatus,
          newStatus: 'Issued',
        });
      }
      return updated;
    });

    await this.audit.log({
      type: 'certificate:sign',
      item: `Certificate ${existing.DOC_NO}`,
      entity: 'ClinicalCertificates',
      entityId: id,
      personId: existing.PERSON_ID,
      userId: user.id,
      createdBy: label,
      newValue: { status: newStatus },
    });

    return this.toResponse(row);
  }

  async approve(id: number, dto: NoteDto, user: AuthUser) {
    const existing = await this.prisma.clinicalCertificates.findUnique({
      where: { CERTIFICATE_ID: id },
      include: INCLUDE,
    });
    if (!existing) throw new NotFoundException('Certificate not found');
    if (existing.STATUS !== 'PendingApproval') {
      throw new ConflictException(
        `Approve only from PendingApproval (current: ${existing.STATUS})`,
      );
    }

    const label = actorLabelOf(user);
    const now = new Date();
    const qrCode = existing.QR_CODE ?? `FNPH-VERIFY-${existing.DOC_NO}`;

    const row = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.clinicalCertificates.update({
        where: { CERTIFICATE_ID: id },
        data: {
          STATUS: 'Issued',
          APPROVED_AT: now,
          APPROVED_BY: label,
          APPROVED_BY_USER_ID: user.id,
          ISSUED_AT: now,
          ISSUED_BY: label,
          ISSUED_BY_USER_ID: user.id,
          LOCKED: true,
          QR_CODE: qrCode,
          UPDATED_BY_ID: user.id,
          UPDATED_BY: label,
          UPDATED_DATE: now,
        },
        include: INCLUDE,
      });
      await this.addEvent(tx, {
        certificateId: id,
        eventType: 'Approved',
        actor: user,
        note: dto.note,
        oldStatus: 'PendingApproval',
        newStatus: 'Issued',
      });
      return updated;
    });

    await this.audit.log({
      type: 'certificate:approve',
      item: `Certificate ${existing.DOC_NO}`,
      entity: 'ClinicalCertificates',
      entityId: id,
      personId: existing.PERSON_ID,
      userId: user.id,
      createdBy: label,
      newValue: { status: 'Issued' },
    });

    return this.toResponse(row);
  }

  async cancel(id: number, dto: CancelCertificateDto, user: AuthUser) {
    const existing = await this.prisma.clinicalCertificates.findUnique({
      where: { CERTIFICATE_ID: id },
      include: INCLUDE,
    });
    if (!existing) throw new NotFoundException('Certificate not found');
    if (TERMINAL.has(existing.STATUS) && existing.STATUS !== 'Cancelled') {
      throw new ConflictException(
        `Cannot cancel certificate in status ${existing.STATUS}`,
      );
    }
    if (existing.STATUS === 'Cancelled') {
      throw new ConflictException('Certificate already cancelled');
    }
    if (existing.STATUS === 'Issued') {
      throw new ConflictException('Cannot cancel an issued certificate');
    }

    const label = actorLabelOf(user);
    const now = new Date();

    const row = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.clinicalCertificates.update({
        where: { CERTIFICATE_ID: id },
        data: {
          STATUS: 'Cancelled',
          LOCKED: true,
          UPDATED_BY_ID: user.id,
          UPDATED_BY: label,
          UPDATED_DATE: now,
        },
        include: INCLUDE,
      });
      await this.addEvent(tx, {
        certificateId: id,
        eventType: 'Cancelled',
        actor: user,
        note: dto.reason,
        oldStatus: existing.STATUS,
        newStatus: 'Cancelled',
      });
      return updated;
    });

    await this.audit.log({
      type: 'certificate:cancel',
      item: `Certificate ${existing.DOC_NO}`,
      entity: 'ClinicalCertificates',
      entityId: id,
      personId: existing.PERSON_ID,
      userId: user.id,
      createdBy: label,
      newValue: { status: 'Cancelled', reason: dto.reason },
    });

    return this.toResponse(row);
  }
}
