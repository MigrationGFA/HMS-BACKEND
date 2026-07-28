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
import {
  CreateClinicalNoteDto,
  ReturnClinicalNoteDto,
  SignClinicalNoteDto,
  UpdateClinicalNoteDto,
} from './dto/clinical-note.dto';

const EDITABLE_STATUSES = new Set([
  'Draft',
  'In Progress',
  'Returned for Correction',
]);

const REVIEW_STATUSES = new Set(['Awaiting Review', 'Under Review']);

const NOTE_TEMPLATES: Array<{
  noteType: string;
  desc: string;
  bestFor: string;
  fields: string[];
}> = [
  {
    noteType: 'SOAP Note',
    desc: 'Standard structured visit note',
    bestFor: 'Outpatient consultation',
    fields: ['Subjective', 'Objective', 'Assessment', 'Plan'],
  },
  {
    noteType: 'Psychiatric Assessment',
    desc: 'Comprehensive psychiatric intake',
    bestFor: 'New OPC patients',
    fields: [
      'Presenting Complaint',
      'History of Presenting Complaint',
      'Past Psychiatric History',
      'Medical History',
      'Drug and Alcohol History',
      'Family History',
      'Personal History',
      'Mental State Examination',
      'Risk Assessment',
      'Diagnosis',
      'Management Plan',
    ],
  },
  {
    noteType: 'Follow-Up Note',
    desc: 'Continuity of care follow-up',
    bestFor: 'Repeat visits',
    fields: [
      'Previous Diagnosis',
      'Current Symptoms',
      'Medication Adherence',
      'Side Effects',
      'Clinical Progress',
      'Current Assessment',
      'Plan',
      'Next Follow-Up Date',
    ],
  },
  {
    noteType: 'Ward Round Note',
    desc: 'Daily inpatient round entry',
    bestFor: 'Admitted patients',
    fields: [
      'Ward',
      'Bed Number',
      'Consultant / Team',
      'Overnight Events',
      'Current Vitals',
      'Clinical Review',
      'Medication Review',
      'Investigation Review',
      'Plan',
      'Discharge Readiness',
    ],
  },
  {
    noteType: 'Emergency Note',
    desc: 'Rapid emergency documentation',
    bestFor: 'ER / triage',
    fields: [
      'Time Seen',
      'Presenting Emergency',
      'Initial Assessment',
      'Vitals',
      'Immediate Intervention',
      'Diagnosis / Impression',
      'Treatment Given',
      'Disposition',
    ],
  },
  {
    noteType: 'Progress Note',
    desc: 'Interval progress entry',
    bestFor: 'Inpatient progress',
    fields: [
      'Date / Time',
      'Current Condition',
      'Clinical Changes',
      'Treatment Response',
      'New Findings',
      'Plan',
    ],
  },
  {
    noteType: 'Consultation Note',
    desc: 'Specialist consult note',
    bestFor: 'Referrals received',
    fields: [
      'Chief Complaint',
      'History',
      'Examination',
      'Diagnosis',
      'Treatment Plan',
      'Follow-Up Plan',
    ],
  },
  {
    noteType: 'Discharge Draft',
    desc: 'Pre-discharge summary draft',
    bestFor: 'Discharge prep',
    fields: [
      'Admission Date',
      'Discharge Date',
      'Diagnosis',
      'Summary of Admission',
      'Investigations',
      'Treatment Given',
      'Condition at Discharge',
      'Discharge Medications',
      'Follow-Up Instructions',
      'Doctor Signature',
    ],
  },
  {
    noteType: 'Admission Note',
    desc: 'Admission documentation',
    bestFor: 'New admissions',
    fields: [
      'Reason for Admission',
      'History',
      'Examination',
      'Working Diagnosis',
      'Initial Plan',
    ],
  },
  {
    noteType: 'Procedure Note',
    desc: 'Procedure documentation',
    bestFor: 'Bedside procedures',
    fields: [
      'Procedure',
      'Indication',
      'Consent',
      'Findings',
      'Complications',
      'Post-procedure Plan',
    ],
  },
  {
    noteType: 'Referral Note',
    desc: 'Outbound referral letter',
    bestFor: 'External referrals',
    fields: [
      'Referring To',
      'Reason for Referral',
      'Clinical Summary',
      'Investigations',
      'Urgency',
    ],
  },
  {
    noteType: 'Medication Review Note',
    desc: 'Medication reconciliation',
    bestFor: 'Polypharmacy review',
    fields: [
      'Current Medications',
      'Adherence',
      'Adverse Effects',
      'Changes Made',
      'Rationale',
    ],
  },
  {
    noteType: 'Multidisciplinary Team Note',
    desc: 'MDT meeting summary',
    bestFor: 'Team case reviews',
    fields: [
      'Team Members',
      'Case Summary',
      'Discussion',
      'Decisions',
      'Action Items',
    ],
  },
  {
    noteType: 'Nursing Collaboration Note',
    desc: 'Doctor–nurse collaboration entry',
    bestFor: 'Ward collaboration',
    fields: [
      'Patient Condition',
      'Nursing Concerns',
      'Doctor Response',
      'Joint Plan',
    ],
  },
];

function actorLabelOf(actor?: AuthUser): string {
  return (
    actor?.email ||
    [actor?.firstName, actor?.lastName].filter(Boolean).join(' ') ||
    'SYSTEM'
  );
}

function personName(p: {
  FIRST_NAME?: string | null;
  MIDDLE_NAME?: string | null;
  LAST_NAME?: string | null;
}) {
  return (
    [p.FIRST_NAME, p.MIDDLE_NAME, p.LAST_NAME].filter(Boolean).join(' ') ||
    'Unknown'
  );
}

function ageYears(dob: Date | null | undefined): number | null {
  if (!dob) return null;
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age -= 1;
  return age;
}

function asFieldMap(value: Prisma.JsonValue | null | undefined): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = v == null ? '' : String(v);
  }
  return out;
}

function normalizeFields(
  input?: Record<string, string>,
): Prisma.InputJsonValue {
  const out: Record<string, string> = {};
  if (!input) return out;
  for (const [k, v] of Object.entries(input)) {
    out[k] = v ?? '';
  }
  return out;
}

type NoteRow = Prisma.ClinicalNotesGetPayload<{
  include: {
    person: true;
    author: true;
  };
}>;

@Injectable()
export class ClinicalNotesService {
  private readonly idempotency = new Map<
    string,
    { noteId: number; version: number; at: number }
  >();

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  listTemplates() {
    return {
      items: NOTE_TEMPLATES.map((t) => ({
        ...t,
        fieldCount: t.fields.length,
      })),
    };
  }

  async summary(actor: AuthUser) {
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const [drafts, awaitingReview, signedThisMonth, templates] =
      await Promise.all([
        this.prisma.clinicalNotes.count({
          where: {
            STATUS: { in: ['Draft', 'In Progress', 'Returned for Correction'] },
            VOIDED_AT: null,
            AUTHOR_ID: actor.id,
          },
        }),
        this.prisma.clinicalNotes.count({
          where: {
            STATUS: { in: ['Awaiting Review', 'Under Review'] },
            VOIDED_AT: null,
          },
        }),
        this.prisma.clinicalNotes.count({
          where: {
            STATUS: 'Signed',
            SIGNED_AT: { gte: monthStart },
            VOIDED_AT: null,
          },
        }),
        Promise.resolve(NOTE_TEMPLATES.length),
      ]);

    return {
      drafts,
      awaitingReview,
      signedThisMonth,
      templates,
    };
  }

  async list(params: {
    q?: string;
    status?: string;
    noteType?: string;
    personId?: number;
    mine?: boolean;
    page?: number;
    limit?: number;
    actor: AuthUser;
  }) {
    const page = Math.max(params.page ?? 1, 1);
    const limit = Math.min(Math.max(params.limit ?? 50, 1), 200);
    const q = params.q?.trim();

    const statusFilter = params.status?.trim();
    let statusWhere: Prisma.ClinicalNotesWhereInput = { VOIDED_AT: null };
    if (statusFilter && statusFilter !== 'all') {
      if (statusFilter === 'drafts') {
        statusWhere = {
          VOIDED_AT: null,
          STATUS: { in: ['Draft', 'In Progress', 'Returned for Correction'] },
        };
      } else if (statusFilter === 'reviews') {
        statusWhere = {
          VOIDED_AT: null,
          STATUS: { in: ['Awaiting Review', 'Under Review'] },
        };
      } else if (statusFilter === 'completed' || statusFilter === 'signed') {
        statusWhere = { VOIDED_AT: null, STATUS: 'Signed' };
      } else {
        statusWhere = { VOIDED_AT: null, STATUS: statusFilter };
      }
    }

    const where: Prisma.ClinicalNotesWhereInput = {
      ...statusWhere,
      ...(params.personId != null ? { PERSON_ID: params.personId } : {}),
      ...(params.noteType && params.noteType !== 'all'
        ? { NOTE_TYPE: params.noteType }
        : {}),
      ...(params.mine ? { AUTHOR_ID: params.actor.id } : {}),
      ...(q
        ? {
            OR: [
              { NOTE_NO: { contains: q, mode: 'insensitive' } },
              { NOTE_TYPE: { contains: q, mode: 'insensitive' } },
              { CLINIC: { contains: q, mode: 'insensitive' } },
              {
                person: {
                  OR: [
                    { HOSPITAL_NO: { contains: q, mode: 'insensitive' } },
                    { FIRST_NAME: { contains: q, mode: 'insensitive' } },
                    { LAST_NAME: { contains: q, mode: 'insensitive' } },
                    { PATIENT_PHONE_NO: { contains: q, mode: 'insensitive' } },
                    { IDENTITY_NO: { contains: q, mode: 'insensitive' } },
                    { NHIS_NO: { contains: q, mode: 'insensitive' } },
                  ],
                },
              },
            ],
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.clinicalNotes.findMany({
        where,
        include: { person: true, author: true },
        orderBy: { UPDATED_DATE: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.clinicalNotes.count({ where }),
    ]);

    return {
      items: rows.map((r) => this.toListItem(r)),
      meta: { page, limit, total },
    };
  }

  async findById(id: number) {
    const row = await this.prisma.clinicalNotes.findUnique({
      where: { CLINICAL_NOTE_ID: id },
      include: { person: true, author: true },
    });
    if (!row || row.VOIDED_AT) throw new NotFoundException('Clinical note not found');
    return this.toDetail(row);
  }

  async create(dto: CreateClinicalNoteDto, actor: AuthUser) {
    const person = await this.prisma.persons.findUnique({
      where: { PERSON_ID: dto.personId },
    });
    if (!person) throw new NotFoundException('Patient not found');

    if (dto.encounterId != null) {
      const enc = await this.prisma.encounters.findUnique({
        where: { ENCOUNTER_ID: dto.encounterId },
      });
      if (!enc) throw new NotFoundException('Encounter not found');
      if (enc.PERSON_ID !== dto.personId) {
        throw new BadRequestException('Encounter does not belong to this patient');
      }
    }

    const noteType = dto.noteType.trim();
    if (!noteType) throw new BadRequestException('noteType is required');

    const actorLabel = actorLabelOf(actor);
    const year = new Date().getFullYear();
    const now = new Date();

    const created = await this.prisma.$transaction(async (tx) => {
      const row = await tx.clinicalNotes.create({
        data: {
          NOTE_NO: `CN-${year}-PENDING`,
          PERSON_ID: dto.personId,
          ENCOUNTER_ID: dto.encounterId ?? null,
          AUTHOR_ID: actor.id,
          NOTE_TYPE: noteType,
          CLINIC: dto.clinic?.trim() || null,
          STATUS: 'Draft',
          PRIORITY: dto.priority?.trim() || 'Routine',
          FIELDS: normalizeFields(dto.fields),
          VERSION: 1,
          CREATED_BY_ID: actor.id,
          CREATED_BY: actorLabel,
          CREATED_DATE: now,
          UPDATED_BY_ID: actor.id,
          UPDATED_BY: actorLabel,
          UPDATED_DATE: now,
        },
      });

      const noteNo = `CN-${year}-${String(row.CLINICAL_NOTE_ID).padStart(4, '0')}`;
      const withNo = await tx.clinicalNotes.update({
        where: { CLINICAL_NOTE_ID: row.CLINICAL_NOTE_ID },
        data: { NOTE_NO: noteNo },
        include: { person: true, author: true },
      });

      await tx.clinicalNoteVersions.create({
        data: {
          CLINICAL_NOTE_ID: withNo.CLINICAL_NOTE_ID,
          VERSION: 1,
          FIELDS: withNo.FIELDS ?? {},
          STATUS: withNo.STATUS,
          CHANGE_SUMMARY: 'Initial draft',
          CREATED_BY_ID: actor.id,
          CREATED_BY: actorLabel,
          CREATED_DATE: now,
        },
      });

      return withNo;
    });

    await this.audit.log({
      type: 'clinical-note:create',
      entity: 'clinical-note',
      entityId: created.CLINICAL_NOTE_ID,
      personId: created.PERSON_ID,
      userId: actor.id,
      createdBy: actorLabel,
      item: `Clinical note ${created.NOTE_NO} created (${created.NOTE_TYPE})`,
      newValue: { noteNo: created.NOTE_NO, noteType: created.NOTE_TYPE },
    });

    return this.toDetail(created);
  }

  async updateDraft(id: number, dto: UpdateClinicalNoteDto, actor: AuthUser) {
    const existing = await this.prisma.clinicalNotes.findUnique({
      where: { CLINICAL_NOTE_ID: id },
    });
    if (!existing || existing.VOIDED_AT) {
      throw new NotFoundException('Clinical note not found');
    }
    if (!EDITABLE_STATUSES.has(existing.STATUS)) {
      throw new BadRequestException(
        `Note in status "${existing.STATUS}" cannot be edited`,
      );
    }

    if (dto.idempotencyKey) {
      const cached = this.idempotency.get(dto.idempotencyKey);
      if (cached && cached.noteId === id) {
        return this.findById(id);
      }
    }

    if (dto.version != null && dto.version !== existing.VERSION) {
      throw new ConflictException({
        message: 'Clinical note was updated elsewhere — refresh and retry',
        currentVersion: existing.VERSION,
        providedVersion: dto.version,
      });
    }

    const actorLabel = actorLabelOf(actor);
    const nextVersion = existing.VERSION + 1;
    const nextStatus =
      existing.STATUS === 'Draft' ? 'In Progress' : existing.STATUS;
    const mergedFields =
      dto.fields !== undefined
        ? normalizeFields(dto.fields)
        : (existing.FIELDS as Prisma.InputJsonValue);

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.clinicalNotes.update({
        where: { CLINICAL_NOTE_ID: id },
        data: {
          ...(dto.fields !== undefined ? { FIELDS: mergedFields } : {}),
          ...(dto.noteType !== undefined
            ? { NOTE_TYPE: dto.noteType.trim() }
            : {}),
          ...(dto.clinic !== undefined
            ? { CLINIC: dto.clinic.trim() || null }
            : {}),
          ...(dto.priority !== undefined
            ? { PRIORITY: dto.priority.trim() || 'Routine' }
            : {}),
          STATUS: nextStatus,
          VERSION: nextVersion,
          UPDATED_BY_ID: actor.id,
          UPDATED_BY: actorLabel,
          UPDATED_DATE: new Date(),
        },
        include: { person: true, author: true },
      });

      await tx.clinicalNoteVersions.create({
        data: {
          CLINICAL_NOTE_ID: id,
          VERSION: nextVersion,
          FIELDS: row.FIELDS ?? {},
          STATUS: row.STATUS,
          CHANGE_SUMMARY: dto.changeSummary?.trim() || 'Draft autosaved',
          CREATED_BY_ID: actor.id,
          CREATED_BY: actorLabel,
          CREATED_DATE: new Date(),
        },
      });

      return row;
    });

    if (dto.idempotencyKey) {
      this.idempotency.set(dto.idempotencyKey, {
        noteId: id,
        version: updated.VERSION,
        at: Date.now(),
      });
    }

    await this.audit.log({
      type: 'clinical-note:update',
      entity: 'clinical-note',
      entityId: id,
      personId: existing.PERSON_ID,
      userId: actor.id,
      createdBy: actorLabel,
      item: `Clinical note draft autosaved (v${updated.VERSION})`,
      newValue: { version: updated.VERSION, status: updated.STATUS },
    });

    return this.toDetail(updated);
  }

  async submit(id: number, actor: AuthUser) {
    const existing = await this.prisma.clinicalNotes.findUnique({
      where: { CLINICAL_NOTE_ID: id },
      include: { person: true, author: true },
    });
    if (!existing || existing.VOIDED_AT) {
      throw new NotFoundException('Clinical note not found');
    }
    if (!EDITABLE_STATUSES.has(existing.STATUS)) {
      throw new BadRequestException(
        `Only draft/in-progress notes can be submitted (current: ${existing.STATUS})`,
      );
    }

    const actorLabel = actorLabelOf(actor);
    const nextVersion = existing.VERSION + 1;
    const now = new Date();

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.clinicalNotes.update({
        where: { CLINICAL_NOTE_ID: id },
        data: {
          STATUS: 'Awaiting Review',
          SUBMITTED_AT: now,
          VERSION: nextVersion,
          UPDATED_BY_ID: actor.id,
          UPDATED_BY: actorLabel,
          UPDATED_DATE: now,
        },
        include: { person: true, author: true },
      });
      await tx.clinicalNoteVersions.create({
        data: {
          CLINICAL_NOTE_ID: id,
          VERSION: nextVersion,
          FIELDS: row.FIELDS ?? {},
          STATUS: row.STATUS,
          CHANGE_SUMMARY: 'Submitted for review',
          CREATED_BY_ID: actor.id,
          CREATED_BY: actorLabel,
          CREATED_DATE: now,
        },
      });
      return row;
    });

    await this.audit.log({
      type: 'clinical-note:submit',
      entity: 'clinical-note',
      entityId: id,
      personId: existing.PERSON_ID,
      userId: actor.id,
      createdBy: actorLabel,
      item: `Clinical note ${existing.NOTE_NO} submitted for review`,
      newValue: { status: 'Awaiting Review' },
    });

    return this.toDetail(updated);
  }

  async sign(id: number, dto: SignClinicalNoteDto, actor: AuthUser) {
    const existing = await this.prisma.clinicalNotes.findUnique({
      where: { CLINICAL_NOTE_ID: id },
      include: { person: true, author: true },
    });
    if (!existing || existing.VOIDED_AT) {
      throw new NotFoundException('Clinical note not found');
    }
    if (existing.STATUS === 'Signed') {
      throw new BadRequestException('Note is already signed');
    }
    if (existing.STATUS === 'Voided') {
      throw new BadRequestException('Voided notes cannot be signed');
    }

    const actorLabel = actorLabelOf(actor);
    const nextVersion = existing.VERSION + 1;
    const now = new Date();

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.clinicalNotes.update({
        where: { CLINICAL_NOTE_ID: id },
        data: {
          STATUS: 'Signed',
          SIGNED_AT: now,
          SIGNED_BY_ID: actor.id,
          SIGNED_BY: actorLabel,
          VERSION: nextVersion,
          UPDATED_BY_ID: actor.id,
          UPDATED_BY: actorLabel,
          UPDATED_DATE: now,
        },
        include: { person: true, author: true },
      });
      await tx.clinicalNoteVersions.create({
        data: {
          CLINICAL_NOTE_ID: id,
          VERSION: nextVersion,
          FIELDS: row.FIELDS ?? {},
          STATUS: row.STATUS,
          CHANGE_SUMMARY: dto.attestation?.trim() || 'Note digitally signed',
          CREATED_BY_ID: actor.id,
          CREATED_BY: actorLabel,
          CREATED_DATE: now,
        },
      });
      return row;
    });

    await this.audit.log({
      type: 'clinical-note:sign',
      entity: 'clinical-note',
      entityId: id,
      personId: existing.PERSON_ID,
      userId: actor.id,
      createdBy: actorLabel,
      item: `Clinical note ${existing.NOTE_NO} signed`,
      newValue: { status: 'Signed', signedBy: actorLabel },
    });

    return this.toDetail(updated);
  }

  async approve(id: number, actor: AuthUser) {
    const existing = await this.prisma.clinicalNotes.findUnique({
      where: { CLINICAL_NOTE_ID: id },
    });
    if (!existing || existing.VOIDED_AT) {
      throw new NotFoundException('Clinical note not found');
    }
    if (!REVIEW_STATUSES.has(existing.STATUS)) {
      throw new BadRequestException(
        `Only notes awaiting review can be approved (current: ${existing.STATUS})`,
      );
    }
    return this.sign(id, { attestation: 'Approved by consultant review' }, actor);
  }

  async returnForCorrection(
    id: number,
    dto: ReturnClinicalNoteDto,
    actor: AuthUser,
  ) {
    const reason = dto.reason?.trim();
    if (!reason) throw new BadRequestException('Return reason is required');

    const existing = await this.prisma.clinicalNotes.findUnique({
      where: { CLINICAL_NOTE_ID: id },
      include: { person: true, author: true },
    });
    if (!existing || existing.VOIDED_AT) {
      throw new NotFoundException('Clinical note not found');
    }
    if (!REVIEW_STATUSES.has(existing.STATUS)) {
      throw new BadRequestException(
        `Only notes awaiting review can be returned (current: ${existing.STATUS})`,
      );
    }

    const actorLabel = actorLabelOf(actor);
    const nextVersion = existing.VERSION + 1;
    const now = new Date();

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.clinicalNotes.update({
        where: { CLINICAL_NOTE_ID: id },
        data: {
          STATUS: 'Returned for Correction',
          RETURN_REASON: reason,
          VERSION: nextVersion,
          UPDATED_BY_ID: actor.id,
          UPDATED_BY: actorLabel,
          UPDATED_DATE: now,
        },
        include: { person: true, author: true },
      });
      await tx.clinicalNoteVersions.create({
        data: {
          CLINICAL_NOTE_ID: id,
          VERSION: nextVersion,
          FIELDS: row.FIELDS ?? {},
          STATUS: row.STATUS,
          CHANGE_SUMMARY: `Returned: ${reason.slice(0, 200)}`,
          CREATED_BY_ID: actor.id,
          CREATED_BY: actorLabel,
          CREATED_DATE: now,
        },
      });
      return row;
    });

    await this.audit.log({
      type: 'clinical-note:return',
      entity: 'clinical-note',
      entityId: id,
      personId: existing.PERSON_ID,
      userId: actor.id,
      createdBy: actorLabel,
      item: `Clinical note ${existing.NOTE_NO} returned for correction`,
      newValue: { status: 'Returned for Correction', reason },
    });

    return this.toDetail(updated);
  }

  async void(id: number, actor: AuthUser) {
    const existing = await this.prisma.clinicalNotes.findUnique({
      where: { CLINICAL_NOTE_ID: id },
      include: { person: true, author: true },
    });
    if (!existing || existing.VOIDED_AT) {
      throw new NotFoundException('Clinical note not found');
    }
    if (existing.STATUS === 'Signed') {
      throw new BadRequestException('Signed notes cannot be voided — use an addendum');
    }
    if (!EDITABLE_STATUSES.has(existing.STATUS)) {
      throw new BadRequestException(
        `Only draft notes can be voided (current: ${existing.STATUS})`,
      );
    }

    const actorLabel = actorLabelOf(actor);
    const now = new Date();
    const updated = await this.prisma.clinicalNotes.update({
      where: { CLINICAL_NOTE_ID: id },
      data: {
        STATUS: 'Voided',
        VOIDED_AT: now,
        UPDATED_BY_ID: actor.id,
        UPDATED_BY: actorLabel,
        UPDATED_DATE: now,
      },
      include: { person: true, author: true },
    });

    await this.audit.log({
      type: 'clinical-note:void',
      entity: 'clinical-note',
      entityId: id,
      personId: existing.PERSON_ID,
      userId: actor.id,
      createdBy: actorLabel,
      item: `Clinical note ${existing.NOTE_NO} voided`,
      oldValue: { status: existing.STATUS },
      newValue: { status: 'Voided' },
    });

    return this.toDetail(updated);
  }

  async listVersions(id: number) {
    const note = await this.prisma.clinicalNotes.findUnique({
      where: { CLINICAL_NOTE_ID: id },
      include: { person: true },
    });
    if (!note || note.VOIDED_AT) {
      throw new NotFoundException('Clinical note not found');
    }

    const rows = await this.prisma.clinicalNoteVersions.findMany({
      where: { CLINICAL_NOTE_ID: id },
      orderBy: { VERSION: 'desc' },
    });

    return {
      clinicalNoteId: id,
      noteNo: note.NOTE_NO,
      noteType: note.NOTE_TYPE,
      patientName: personName(note.person),
      hospitalNo: note.person.HOSPITAL_NO,
      items: rows.map((v) => ({
        versionId: v.VERSION_ID,
        version: v.VERSION,
        status: v.STATUS,
        changeSummary: v.CHANGE_SUMMARY,
        fields: asFieldMap(v.FIELDS),
        createdBy: v.CREATED_BY,
        createdAt: v.CREATED_DATE?.toISOString() ?? null,
        isCurrent: v.VERSION === note.VERSION,
      })),
    };
  }

  private authorDisplay(author: {
    FIRST_NAME?: string | null;
    LAST_NAME?: string | null;
    EMAIL_ADDRESS?: string | null;
  }) {
    const name = [author.FIRST_NAME, author.LAST_NAME].filter(Boolean).join(' ');
    return name || author.EMAIL_ADDRESS || 'Unknown';
  }

  private toListItem(row: NoteRow) {
    return {
      clinicalNoteId: row.CLINICAL_NOTE_ID,
      noteNo: row.NOTE_NO,
      personId: row.PERSON_ID,
      patientName: personName(row.person),
      hospitalNo: row.person.HOSPITAL_NO,
      clinic: row.CLINIC,
      noteType: row.NOTE_TYPE,
      status: row.STATUS,
      priority: row.PRIORITY,
      version: row.VERSION,
      authorName: this.authorDisplay(row.author),
      signedBy: row.SIGNED_BY,
      signedAt: row.SIGNED_AT?.toISOString() ?? null,
      submittedAt: row.SUBMITTED_AT?.toISOString() ?? null,
      returnReason: row.RETURN_REASON,
      updatedAt: row.UPDATED_DATE?.toISOString() ?? null,
      createdAt: row.CREATED_DATE?.toISOString() ?? null,
    };
  }

  private toDetail(row: NoteRow) {
    return {
      ...this.toListItem(row),
      encounterId: row.ENCOUNTER_ID,
      fields: asFieldMap(row.FIELDS),
      patient: {
        personId: row.PERSON_ID,
        name: personName(row.person),
        hospitalNo: row.person.HOSPITAL_NO,
        age: ageYears(row.person.DATE_OF_BIRTH),
        sex: row.person.SEX,
        phone: row.person.PATIENT_PHONE_NO,
        nhia: row.person.NHIS_NO,
        nin: row.person.IDENTITY_NO,
      },
    };
  }
}
