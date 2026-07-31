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
  PERMISSIONS,
  ROLES,
  permissionsForRoles,
} from '../common/constants';
import type {
  CheckInOpcVisitDto,
  PayOpcConsultationDto,
  SaveOpcAssessmentDto,
  SaveOpcNoteDto,
  SaveOpcRiskDto,
} from './dto/psychiatric-opc.dto';
import { OPC_STATUSES } from './dto/psychiatric-opc.dto';

const PERSON_SELECT = {
  PERSON_ID: true,
  HOSPITAL_NO: true,
  FIRST_NAME: true,
  LAST_NAME: true,
  MIDDLE_NAME: true,
  PATIENT_PHONE_NO: true,
} as const;

const VISIT_INCLUDE = {
  person: { select: PERSON_SELECT },
} as const;

type VisitWithPerson = Prisma.OpcVisitsGetPayload<{
  include: typeof VISIT_INCLUDE;
}>;

interface AuditEntry {
  at: string;
  by: string;
  action: string;
  detail?: string;
}

function actorLabelOf(actor?: AuthUser): string {
  return (
    actor?.email ||
    [actor?.firstName, actor?.lastName].filter(Boolean).join(' ') ||
    'SYSTEM'
  );
}

function money(v: Prisma.Decimal | number | null | undefined): number {
  if (v == null) return 0;
  return typeof v === 'number' ? v : Number(v);
}

function parseAudit(raw?: string | null): AuditEntry[] {
  if (!raw?.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as AuditEntry[]) : [];
  } catch {
    return [];
  }
}

function appendAudit(
  raw: string | null | undefined,
  entry: AuditEntry,
): string {
  const list = parseAudit(raw);
  list.push(entry);
  return JSON.stringify(list);
}

function todayBounds(offsetMin = 60): { start: Date; end: Date } {
  const now = new Date();
  const localMs = now.getTime() + offsetMin * 60_000;
  const local = new Date(localMs);
  const startLocal = new Date(
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()),
  );
  const start = new Date(startLocal.getTime() - offsetMin * 60_000);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

function mapPerson(
  p:
    | {
        PERSON_ID: number;
        HOSPITAL_NO: string | null;
        FIRST_NAME: string | null;
        LAST_NAME: string | null;
        MIDDLE_NAME: string | null;
        PATIENT_PHONE_NO: string | null;
      }
    | null
    | undefined,
) {
  if (!p) return null;
  return {
    personId: p.PERSON_ID,
    hospitalNo: p.HOSPITAL_NO,
    firstName: p.FIRST_NAME,
    lastName: p.LAST_NAME,
    middleName: p.MIDDLE_NAME,
    phone: p.PATIENT_PHONE_NO,
  };
}

@Injectable()
export class PsychiatryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  opcHealth() {
    return {
      module: 'psychiatric-opc',
      status: 'ready',
      dualMode: true,
      message: 'Psychiatric OPC API online',
    };
  }

  toVisitResponse(row: VisitWithPerson) {
    return {
      visitId: row.OPC_VISIT_ID,
      visitNo: row.VISIT_NO,
      personId: row.PERSON_ID,
      visitType: row.VISIT_TYPE,
      payer: row.PAYER,
      priority: row.PRIORITY,
      status: row.STATUS,
      assignedDoctor: row.ASSIGNED_DOCTOR,
      clinic: row.CLINIC,
      reason: row.REASON,
      billingStatus: row.BILLING_STATUS,
      consultAmount: money(row.CONSULT_AMOUNT),
      paidAt: row.PAID_AT?.toISOString() ?? null,
      paidBy: row.PAID_BY,
      paymentChannel: row.PAYMENT_CHANNEL,
      paymentRef: row.PAYMENT_REF,
      checkInAt: row.CHECK_IN_AT.toISOString(),
      createdAt: row.CREATED_DATE.toISOString(),
      updatedAt: row.UPDATED_DATE?.toISOString() ?? null,
      createdBy: row.CREATED_BY,
      audit: parseAudit(row.AUDIT_JSON),
      person: mapPerson(row.person),
    };
  }

  private async nextVisitNo(): Promise<string> {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    const prefix = `OPC-${y}${m}${d}-`;
    const count = await this.prisma.opcVisits.count({
      where: { VISIT_NO: { startsWith: prefix } },
    });
    const seq = count + 1;
    return `${prefix}${String(seq).padStart(4, '0')}`;
  }

  async listVisits(params: {
    status?: string;
    q?: string;
    today?: boolean;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(params.page ?? 1, 1);
    const limit = Math.min(Math.max(params.limit ?? 50, 1), 200);
    const where: Prisma.OpcVisitsWhereInput = {};

    if (params.status?.trim()) {
      const statuses = params.status
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      where.STATUS = statuses.length === 1 ? statuses[0] : { in: statuses };
    }

    if (params.today) {
      const { start, end } = todayBounds();
      where.CHECK_IN_AT = { gte: start, lt: end };
    }

    if (params.q?.trim()) {
      const q = params.q.trim();
      const asId = Number.parseInt(q, 10);
      where.OR = [
        { VISIT_NO: { contains: q, mode: 'insensitive' } },
        { ASSIGNED_DOCTOR: { contains: q, mode: 'insensitive' } },
        { CLINIC: { contains: q, mode: 'insensitive' } },
        { REASON: { contains: q, mode: 'insensitive' } },
        {
          person: {
            OR: [
              { HOSPITAL_NO: { contains: q, mode: 'insensitive' } },
              { FIRST_NAME: { contains: q, mode: 'insensitive' } },
              { LAST_NAME: { contains: q, mode: 'insensitive' } },
              { MIDDLE_NAME: { contains: q, mode: 'insensitive' } },
              { PATIENT_PHONE_NO: { contains: q, mode: 'insensitive' } },
              ...(Number.isFinite(asId) ? [{ PERSON_ID: asId }] : []),
            ],
          },
        },
      ];
    }

    const [rows, total] = await Promise.all([
      this.prisma.opcVisits.findMany({
        where,
        include: VISIT_INCLUDE,
        orderBy: { CHECK_IN_AT: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.opcVisits.count({ where }),
    ]);

    return {
      items: rows.map((r) => this.toVisitResponse(r)),
      meta: { page, limit, total },
    };
  }

  async getVisit(id: number) {
    const row = await this.prisma.opcVisits.findUnique({
      where: { OPC_VISIT_ID: id },
      include: VISIT_INCLUDE,
    });
    if (!row) throw new NotFoundException('OPC visit not found');
    return this.toVisitResponse(row);
  }

  async checkIn(dto: CheckInOpcVisitDto, actor?: AuthUser) {
    const person = await this.prisma.persons.findUnique({
      where: { PERSON_ID: dto.personId },
      select: { PERSON_ID: true },
    });
    if (!person) throw new NotFoundException('Patient not found');

    const label = actorLabelOf(actor);
    const now = new Date();
    const visitNo = await this.nextVisitNo();
    const auditJson = appendAudit(null, {
      at: now.toISOString(),
      by: label,
      action: 'check-in',
      detail: dto.visitType,
    });

    const row = await this.prisma.opcVisits.create({
      data: {
        VISIT_NO: visitNo,
        PERSON_ID: dto.personId,
        VISIT_TYPE: dto.visitType,
        PAYER: dto.payer?.trim() || 'Cash',
        PRIORITY: dto.priority?.trim() || 'Normal',
        STATUS: 'WAITING',
        ASSIGNED_DOCTOR: dto.assignedDoctor?.trim() || null,
        CLINIC: dto.clinic?.trim() || null,
        REASON: dto.reason?.trim() || null,
        BILLING_STATUS: 'NotBilled',
        CHECK_IN_AT: now,
        CREATED_BY_ID: actor?.id ?? null,
        CREATED_BY: label,
        CREATED_DATE: now,
        AUDIT_JSON: auditJson,
      },
      include: VISIT_INCLUDE,
    });

    const response = this.toVisitResponse(row);
    await this.audit.log({
      type: 'opc:check-in',
      entity: 'opc-visit',
      entityId: row.OPC_VISIT_ID,
      personId: dto.personId,
      userId: actor?.id,
      createdBy: label,
      item: `OPC check-in: ${visitNo}`,
      newValue: response,
    });
    return response;
  }

  async updateVisitStatus(
    id: number,
    status: string,
    actor?: AuthUser,
    note?: string,
  ) {
    if (!(OPC_STATUSES as readonly string[]).includes(status)) {
      throw new BadRequestException(`Invalid status: ${status}`);
    }
    const existing = await this.prisma.opcVisits.findUnique({
      where: { OPC_VISIT_ID: id },
    });
    if (!existing) throw new NotFoundException('OPC visit not found');

    const label = actorLabelOf(actor);
    const now = new Date();
    const row = await this.prisma.opcVisits.update({
      where: { OPC_VISIT_ID: id },
      data: {
        STATUS: status,
        UPDATED_DATE: now,
        AUDIT_JSON: appendAudit(existing.AUDIT_JSON, {
          at: now.toISOString(),
          by: label,
          action: 'status',
          detail: note?.trim()
            ? `${existing.STATUS} → ${status}: ${note.trim()}`
            : `${existing.STATUS} → ${status}`,
        }),
      },
      include: VISIT_INCLUDE,
    });

    const response = this.toVisitResponse(row);
    await this.audit.log({
      type: 'opc:status',
      entity: 'opc-visit',
      entityId: id,
      personId: existing.PERSON_ID,
      userId: actor?.id,
      createdBy: label,
      item: `OPC status: ${row.VISIT_NO}`,
      oldValue: { status: existing.STATUS },
      newValue: { status, note },
    });
    return response;
  }

  async assignDoctor(id: number, doctor: string, actor?: AuthUser) {
    const existing = await this.prisma.opcVisits.findUnique({
      where: { OPC_VISIT_ID: id },
    });
    if (!existing) throw new NotFoundException('OPC visit not found');

    const label = actorLabelOf(actor);
    const now = new Date();
    const doctorName = doctor.trim();
    if (!doctorName) throw new BadRequestException('Doctor is required');

    const row = await this.prisma.opcVisits.update({
      where: { OPC_VISIT_ID: id },
      data: {
        ASSIGNED_DOCTOR: doctorName,
        UPDATED_DATE: now,
        AUDIT_JSON: appendAudit(existing.AUDIT_JSON, {
          at: now.toISOString(),
          by: label,
          action: 'assign-doctor',
          detail: doctorName,
        }),
      },
      include: VISIT_INCLUDE,
    });

    const response = this.toVisitResponse(row);
    await this.audit.log({
      type: 'opc:assign-doctor',
      entity: 'opc-visit',
      entityId: id,
      personId: existing.PERSON_ID,
      userId: actor?.id,
      createdBy: label,
      item: `OPC assign: ${row.VISIT_NO}`,
      newValue: { doctor: doctorName },
    });
    return response;
  }

  async completeVisit(id: number, actor?: AuthUser) {
    return this.updateVisitStatus(id, 'COMPLETED', actor, 'Visit completed');
  }

  async billConsultation(id: number, actor?: AuthUser) {
    const existing = await this.prisma.opcVisits.findUnique({
      where: { OPC_VISIT_ID: id },
    });
    if (!existing) throw new NotFoundException('OPC visit not found');
    if (existing.BILLING_STATUS === 'Paid') {
      throw new BadRequestException('Consultation already paid');
    }
    if (existing.BILLING_STATUS === 'Waived') {
      throw new BadRequestException('Consultation was waived');
    }

    const label = actorLabelOf(actor);
    const now = new Date();
    const row = await this.prisma.opcVisits.update({
      where: { OPC_VISIT_ID: id },
      data: {
        BILLING_STATUS: 'Unpaid',
        UPDATED_DATE: now,
        AUDIT_JSON: appendAudit(existing.AUDIT_JSON, {
          at: now.toISOString(),
          by: label,
          action: 'bill',
          detail: `Consult amount ${money(existing.CONSULT_AMOUNT)}`,
        }),
      },
      include: VISIT_INCLUDE,
    });

    const response = this.toVisitResponse(row);
    await this.audit.log({
      type: 'opc:bill',
      entity: 'opc-visit',
      entityId: id,
      personId: existing.PERSON_ID,
      userId: actor?.id,
      createdBy: label,
      item: `OPC billed: ${row.VISIT_NO}`,
      newValue: response,
    });
    return response;
  }

  async payConsultation(
    id: number,
    dto: PayOpcConsultationDto,
    actor?: AuthUser,
  ) {
    const existing = await this.prisma.opcVisits.findUnique({
      where: { OPC_VISIT_ID: id },
      include: VISIT_INCLUDE,
    });
    if (!existing) throw new NotFoundException('OPC visit not found');
    if (existing.BILLING_STATUS === 'Paid') {
      throw new BadRequestException('Consultation already paid');
    }
    if (existing.BILLING_STATUS === 'Waived') {
      throw new BadRequestException('Consultation payment was waived');
    }
    if (existing.BILLING_STATUS === 'NotBilled') {
      throw new BadRequestException('Consultation has not been billed yet');
    }

    const label = actorLabelOf(actor);
    const now = new Date();
    const row = await this.prisma.opcVisits.update({
      where: { OPC_VISIT_ID: id },
      data: {
        BILLING_STATUS: 'Paid',
        PAID_AT: now,
        PAID_BY: label,
        PAYMENT_CHANNEL: dto.channel,
        PAYMENT_REF: dto.paymentRef?.trim() || null,
        UPDATED_DATE: now,
        AUDIT_JSON: appendAudit(existing.AUDIT_JSON, {
          at: now.toISOString(),
          by: label,
          action: 'pay',
          detail: dto.channel,
        }),
      },
      include: VISIT_INCLUDE,
    });

    const response = this.toVisitResponse(row);
    await this.audit.log({
      type: 'opc:pay',
      entity: 'opc-visit',
      entityId: id,
      personId: existing.PERSON_ID,
      userId: actor?.id,
      createdBy: label,
      item: `OPC paid: ${row.VISIT_NO}`,
      oldValue: { billingStatus: existing.BILLING_STATUS },
      newValue: response,
    });
    return response;
  }

  async listUnpaidConsults(params: {
    q?: string;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(params.page ?? 1, 1);
    const limit = Math.min(Math.max(params.limit ?? 50, 1), 200);
    const where: Prisma.OpcVisitsWhereInput = {
      BILLING_STATUS: 'Unpaid',
    };

    if (params.q?.trim()) {
      const q = params.q.trim();
      where.OR = [
        { VISIT_NO: { contains: q, mode: 'insensitive' } },
        {
          person: {
            OR: [
              { HOSPITAL_NO: { contains: q, mode: 'insensitive' } },
              { FIRST_NAME: { contains: q, mode: 'insensitive' } },
              { LAST_NAME: { contains: q, mode: 'insensitive' } },
              { MIDDLE_NAME: { contains: q, mode: 'insensitive' } },
              { PATIENT_PHONE_NO: { contains: q, mode: 'insensitive' } },
            ],
          },
        },
      ];
    }

    const [rows, total] = await Promise.all([
      this.prisma.opcVisits.findMany({
        where,
        include: VISIT_INCLUDE,
        orderBy: { CHECK_IN_AT: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.opcVisits.count({ where }),
    ]);

    return {
      items: rows.map((r) => this.toVisitResponse(r)),
      meta: { page, limit, total },
    };
  }

  async saveAssessment(dto: SaveOpcAssessmentDto, actor?: AuthUser) {
    const person = await this.prisma.persons.findUnique({
      where: { PERSON_ID: dto.personId },
      select: { PERSON_ID: true },
    });
    if (!person) throw new NotFoundException('Patient not found');

    if (dto.opcVisitId) {
      const visit = await this.prisma.opcVisits.findUnique({
        where: { OPC_VISIT_ID: dto.opcVisitId },
        select: { OPC_VISIT_ID: true, PERSON_ID: true },
      });
      if (!visit) throw new NotFoundException('OPC visit not found');
      if (visit.PERSON_ID !== dto.personId) {
        throw new BadRequestException('Visit does not belong to this patient');
      }
    }

    const label = actorLabelOf(actor);
    const row = await this.prisma.opcAssessments.create({
      data: {
        PERSON_ID: dto.personId,
        OPC_VISIT_ID: dto.opcVisitId ?? null,
        TYPE: dto.type.trim(),
        VALUES_JSON: JSON.stringify(dto.values ?? {}),
        SUMMARY: dto.summary?.trim() || null,
        CREATED_BY: label,
      },
    });

    const response = {
      assessmentId: row.ASSESSMENT_ID,
      personId: row.PERSON_ID,
      opcVisitId: row.OPC_VISIT_ID,
      type: row.TYPE,
      values: dto.values ?? {},
      summary: row.SUMMARY,
      createdBy: row.CREATED_BY,
      createdAt: row.CREATED_DATE.toISOString(),
    };

    await this.audit.log({
      type: 'opc:assessment',
      entity: 'opc-assessment',
      entityId: row.ASSESSMENT_ID,
      personId: dto.personId,
      userId: actor?.id,
      createdBy: label,
      item: `OPC assessment: ${row.TYPE}`,
      newValue: response,
    });
    return response;
  }

  async listAssessments(personId: number) {
    const rows = await this.prisma.opcAssessments.findMany({
      where: { PERSON_ID: personId },
      orderBy: { CREATED_DATE: 'desc' },
    });
    return {
      items: rows.map((row) => {
        let values: Record<string, unknown> = {};
        try {
          values = JSON.parse(row.VALUES_JSON) as Record<string, unknown>;
        } catch {
          values = {};
        }
        return {
          assessmentId: row.ASSESSMENT_ID,
          personId: row.PERSON_ID,
          opcVisitId: row.OPC_VISIT_ID,
          type: row.TYPE,
          values,
          summary: row.SUMMARY,
          createdBy: row.CREATED_BY,
          createdAt: row.CREATED_DATE.toISOString(),
        };
      }),
    };
  }

  async saveRisk(dto: SaveOpcRiskDto, actor?: AuthUser) {
    const person = await this.prisma.persons.findUnique({
      where: { PERSON_ID: dto.personId },
      select: { PERSON_ID: true },
    });
    if (!person) throw new NotFoundException('Patient not found');

    if (dto.opcVisitId) {
      const visit = await this.prisma.opcVisits.findUnique({
        where: { OPC_VISIT_ID: dto.opcVisitId },
        select: { OPC_VISIT_ID: true, PERSON_ID: true },
      });
      if (!visit) throw new NotFoundException('OPC visit not found');
      if (visit.PERSON_ID !== dto.personId) {
        throw new BadRequestException('Visit does not belong to this patient');
      }
    }

    const label = actorLabelOf(actor);
    const row = await this.prisma.opcRiskAssessments.create({
      data: {
        PERSON_ID: dto.personId,
        OPC_VISIT_ID: dto.opcVisitId ?? null,
        SELF_HARM: dto.selfHarm,
        HARM_TO_OTHERS: dto.harmToOthers,
        ABSCONDING: dto.absconding,
        NEGLECT: dto.neglect,
        SUBSTANCE: dto.substance,
        VULNERABLE_FLAG: dto.vulnerableFlag ?? false,
        CRISIS_ALERT: dto.crisisAlert ?? false,
        SAFETY_PLAN: dto.safetyPlan?.trim() || null,
        CREATED_BY: label,
      },
    });

    const response = {
      riskId: row.RISK_ID,
      personId: row.PERSON_ID,
      opcVisitId: row.OPC_VISIT_ID,
      selfHarm: row.SELF_HARM,
      harmToOthers: row.HARM_TO_OTHERS,
      absconding: row.ABSCONDING,
      neglect: row.NEGLECT,
      substance: row.SUBSTANCE,
      vulnerableFlag: row.VULNERABLE_FLAG,
      crisisAlert: row.CRISIS_ALERT,
      safetyPlan: row.SAFETY_PLAN,
      createdBy: row.CREATED_BY,
      createdAt: row.CREATED_DATE.toISOString(),
    };

    await this.audit.log({
      type: 'opc:risk',
      entity: 'opc-risk',
      entityId: row.RISK_ID,
      personId: dto.personId,
      userId: actor?.id,
      createdBy: label,
      item: `OPC risk assessment`,
      newValue: response,
    });
    return response;
  }

  async latestRisk(personId: number) {
    const row = await this.prisma.opcRiskAssessments.findFirst({
      where: { PERSON_ID: personId },
      orderBy: { CREATED_DATE: 'desc' },
    });
    if (!row) return null;
    return {
      riskId: row.RISK_ID,
      personId: row.PERSON_ID,
      opcVisitId: row.OPC_VISIT_ID,
      selfHarm: row.SELF_HARM,
      harmToOthers: row.HARM_TO_OTHERS,
      absconding: row.ABSCONDING,
      neglect: row.NEGLECT,
      substance: row.SUBSTANCE,
      vulnerableFlag: row.VULNERABLE_FLAG,
      crisisAlert: row.CRISIS_ALERT,
      safetyPlan: row.SAFETY_PLAN,
      createdBy: row.CREATED_BY,
      createdAt: row.CREATED_DATE.toISOString(),
    };
  }

  private canWriteConfidential(actor?: AuthUser): boolean {
    if (!actor) return false;
    const roles = actor.roles ?? [];
    if (
      roles.some(
        (r) =>
          r === ROLES.SUPER_ADMIN ||
          r === ROLES.ADMIN ||
          r === ROLES.CMD ||
          r === ROLES.IT,
      )
    ) {
      return true;
    }
    const granted = permissionsForRoles(roles);
    return granted.has(PERMISSIONS.OPC_NOTES_CONFIDENTIAL);
  }

  async saveNote(dto: SaveOpcNoteDto, actor?: AuthUser) {
    const confidential = dto.confidential === true;
    if (confidential && !this.canWriteConfidential(actor)) {
      throw new ForbiddenException(
        'Missing permission: opc:notes-confidential',
      );
    }

    const person = await this.prisma.persons.findUnique({
      where: { PERSON_ID: dto.personId },
      select: { PERSON_ID: true },
    });
    if (!person) throw new NotFoundException('Patient not found');

    if (dto.opcVisitId) {
      const visit = await this.prisma.opcVisits.findUnique({
        where: { OPC_VISIT_ID: dto.opcVisitId },
        select: { OPC_VISIT_ID: true, PERSON_ID: true },
      });
      if (!visit) throw new NotFoundException('OPC visit not found');
      if (visit.PERSON_ID !== dto.personId) {
        throw new BadRequestException('Visit does not belong to this patient');
      }
    }

    const label = actorLabelOf(actor);
    const row = await this.prisma.opcNotes.create({
      data: {
        PERSON_ID: dto.personId,
        OPC_VISIT_ID: dto.opcVisitId ?? null,
        TYPE: dto.type.trim(),
        CONTENT: dto.content,
        STATUS: dto.status?.trim() || 'DRAFT',
        CONFIDENTIAL: confidential,
        CREATED_BY: label,
        CREATED_BY_ID: actor?.id ?? null,
      },
    });

    const response = {
      noteId: row.NOTE_ID,
      personId: row.PERSON_ID,
      opcVisitId: row.OPC_VISIT_ID,
      type: row.TYPE,
      content: row.CONTENT,
      status: row.STATUS,
      confidential: row.CONFIDENTIAL,
      createdBy: row.CREATED_BY,
      createdById: row.CREATED_BY_ID,
      createdAt: row.CREATED_DATE.toISOString(),
      updatedAt: row.UPDATED_DATE?.toISOString() ?? null,
    };

    await this.audit.log({
      type: 'opc:note',
      entity: 'opc-note',
      entityId: row.NOTE_ID,
      personId: dto.personId,
      userId: actor?.id,
      createdBy: label,
      item: `OPC note: ${row.TYPE}`,
      newValue: {
        noteId: row.NOTE_ID,
        type: row.TYPE,
        confidential: row.CONFIDENTIAL,
        status: row.STATUS,
      },
    });
    return response;
  }

  async listNotes(
    personId: number,
    opts: { includeConfidential?: boolean } = {},
  ) {
    const where: Prisma.OpcNotesWhereInput = { PERSON_ID: personId };
    if (!opts.includeConfidential) {
      where.CONFIDENTIAL = false;
    }

    const rows = await this.prisma.opcNotes.findMany({
      where,
      orderBy: { CREATED_DATE: 'desc' },
    });

    return {
      items: rows.map((row) => ({
        noteId: row.NOTE_ID,
        personId: row.PERSON_ID,
        opcVisitId: row.OPC_VISIT_ID,
        type: row.TYPE,
        content: row.CONTENT,
        status: row.STATUS,
        confidential: row.CONFIDENTIAL,
        createdBy: row.CREATED_BY,
        createdById: row.CREATED_BY_ID,
        createdAt: row.CREATED_DATE.toISOString(),
        updatedAt: row.UPDATED_DATE?.toISOString() ?? null,
      })),
    };
  }

  async dashboardMetrics() {
    const { start, end } = todayBounds();
    const todayFilter: Prisma.OpcVisitsWhereInput = {
      CHECK_IN_AT: { gte: start, lt: end },
    };

    const [
      seenToday,
      waiting,
      withDoctor,
      withNurse,
      followUp,
      newCases,
      emergency,
      awaitingLab,
      awaitingPharmacy,
      forAdmission,
      highRisk,
    ] = await Promise.all([
      this.prisma.opcVisits.count({ where: todayFilter }),
      this.prisma.opcVisits.count({
        where: { ...todayFilter, STATUS: 'WAITING' },
      }),
      this.prisma.opcVisits.count({
        where: { ...todayFilter, STATUS: 'WITH_DOCTOR' },
      }),
      this.prisma.opcVisits.count({
        where: { ...todayFilter, STATUS: 'WITH_NURSE' },
      }),
      this.prisma.opcVisits.count({
        where: { ...todayFilter, VISIT_TYPE: 'Follow-up' },
      }),
      this.prisma.opcVisits.count({
        where: { ...todayFilter, VISIT_TYPE: 'New' },
      }),
      this.prisma.opcVisits.count({
        where: {
          ...todayFilter,
          PRIORITY: { in: ['Emergency', 'Crisis'] },
        },
      }),
      this.prisma.opcVisits.count({
        where: { ...todayFilter, STATUS: 'AWAITING_LAB' },
      }),
      this.prisma.opcVisits.count({
        where: { ...todayFilter, STATUS: 'AWAITING_PHARMACY' },
      }),
      this.prisma.opcVisits.count({
        where: { ...todayFilter, STATUS: 'FOR_ADMISSION' },
      }),
      this.prisma.opcRiskAssessments.count({
        where: { CRISIS_ALERT: true },
      }),
    ]);

    return {
      seenToday,
      waiting,
      withDoctor,
      withNurse,
      followUp,
      newCases,
      emergency,
      awaitingLab,
      awaitingPharmacy,
      forAdmission,
      pendingReferrals: 0,
      upcomingFollowUps: 0,
      highRisk,
    };
  }
}
