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
  CreateExternalMedDto,
  CreateHandoverDto,
  CreateIcuInfusionDto,
  CreateIcuNoteDto,
  CreateMarEntryDto,
  CreateMessageDto,
  CreateNursingOrderDto,
  CreateNursingTaskDto,
  CreateShiftDto,
  EndShiftDto,
  GenerateReportDto,
  MarActionDto,
  UpdateNursingTaskDto,
} from './dto/nursing-ops.dto';
import { PAYMENT_CLEARED } from './dto/nursing-ops.dto';

function actorLabelOf(actor?: AuthUser): string {
  return (
    actor?.email ||
    [actor?.firstName, actor?.lastName].filter(Boolean).join(' ') ||
    'SYSTEM'
  );
}

function dec(n?: number | null): Prisma.Decimal | null {
  if (n == null || Number.isNaN(n)) return null;
  return new Prisma.Decimal(n);
}

function parseItems(json: string): Array<{
  code: string;
  name: string;
  price?: number;
  covered?: boolean;
}> {
  try {
    const v = JSON.parse(json) as unknown;
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

@Injectable()
export class NursingOpsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ── Orders ─────────────────────────────────────────────────────────

  async listOrders(params?: {
    personId?: number;
    admissionId?: number;
    kind?: string;
    status?: string;
  }) {
    const where: Prisma.NursingOrdersWhereInput = {
      ...(params?.personId ? { PERSON_ID: params.personId } : {}),
      ...(params?.admissionId ? { ADMISSION_ID: params.admissionId } : {}),
      ...(params?.kind ? { KIND: params.kind } : {}),
      ...(params?.status ? { STATUS: params.status } : {}),
    };
    const rows = await this.prisma.nursingOrders.findMany({
      where,
      include: {
        person: {
          select: {
            PERSON_ID: true,
            HOSPITAL_NO: true,
            FIRST_NAME: true,
            LAST_NAME: true,
            MIDDLE_NAME: true,
          },
        },
      },
      orderBy: { CREATED_DATE: 'desc' },
      take: 200,
    });
    return { items: rows.map((r) => this.mapOrder(r)) };
  }

  async createOrder(dto: CreateNursingOrderDto, actor?: AuthUser) {
    await this.assertPerson(dto.personId);
    if (dto.admissionId != null) await this.assertAdmission(dto.admissionId);
    const actorLabel = actorLabelOf(actor);
    const row = await this.prisma.nursingOrders.create({
      data: {
        PERSON_ID: dto.personId,
        ADMISSION_ID: dto.admissionId ?? null,
        KIND: dto.kind,
        ITEMS_JSON: JSON.stringify(dto.items ?? []),
        STATUS: 'ORDERED',
        ORDERED_BY: dto.orderedBy ?? actorLabel,
        PAYMENT_STATUS: dto.paymentStatus ?? 'UNPAID',
        LAB_STATUS: dto.kind === 'lab' ? 'ORDERED' : null,
        CREATED_BY_ID: actor?.id ?? null,
      },
      include: {
        person: {
          select: {
            PERSON_ID: true,
            HOSPITAL_NO: true,
            FIRST_NAME: true,
            LAST_NAME: true,
            MIDDLE_NAME: true,
          },
        },
      },
    });

    if (dto.kind === 'drug') {
      for (const item of dto.items ?? []) {
        await this.prisma.nursingMarEntries.create({
          data: {
            PERSON_ID: dto.personId,
            ADMISSION_ID: dto.admissionId ?? null,
            ORDER_ID: row.ORDER_ID,
            DRUG: item.name,
            DOSE: '—',
            ROUTE: 'PO',
            FREQUENCY: 'as ordered',
            SCHEDULED_TIME: new Date(),
            KIND: 'Scheduled',
            STATUS: 'PENDING',
            PHARMACY_DISPENSED: false,
            CREATED_BY_ID: actor?.id ?? null,
          },
        });
      }
    }

    await this.audit.log({
      type: 'nursing-order:create',
      entity: 'nursing-order',
      entityId: String(row.ORDER_ID),
      personId: dto.personId,
      userId: actor?.id,
      createdBy: actorLabel,
      newValue: { kind: dto.kind, personId: dto.personId },
    });
    return this.mapOrder(row);
  }

  async acknowledgeOrder(orderId: number, actor?: AuthUser) {
    const existing = await this.prisma.nursingOrders.findUnique({
      where: { ORDER_ID: orderId },
    });
    if (!existing) throw new NotFoundException('Order not found');
    const actorLabel = actorLabelOf(actor);
    const now = new Date();
    const row = await this.prisma.nursingOrders.update({
      where: { ORDER_ID: orderId },
      data: {
        STATUS: 'ACKNOWLEDGED',
        ACKNOWLEDGED_BY: actorLabel,
        ACKNOWLEDGED_AT: now,
        UPDATED_DATE: now,
      },
      include: {
        person: {
          select: {
            PERSON_ID: true,
            HOSPITAL_NO: true,
            FIRST_NAME: true,
            LAST_NAME: true,
            MIDDLE_NAME: true,
          },
        },
      },
    });

    const items = parseItems(existing.ITEMS_JSON);
    const title = `Acknowledge ${existing.KIND} order: ${items.map((i) => i.name).join(', ') || `#${orderId}`}`;
    const patientName = row.person
      ? [row.person.FIRST_NAME, row.person.MIDDLE_NAME, row.person.LAST_NAME]
          .filter(Boolean)
          .join(' ')
      : null;

    await this.prisma.nursingTasks.create({
      data: {
        PERSON_ID: existing.PERSON_ID,
        ADMISSION_ID: existing.ADMISSION_ID,
        PATIENT_NAME: patientName,
        TITLE: title,
        CATEGORY:
          existing.KIND === 'lab'
            ? 'Sample'
            : existing.KIND === 'drug'
              ? 'Medication'
              : 'Procedure',
        STATUS: 'PENDING',
        SOURCE_ORDER_ID: orderId,
        CREATED_BY: actorLabel,
        CREATED_BY_ID: actor?.id ?? null,
      },
    });

    await this.audit.log({
      type: 'nursing-order:acknowledge',
      entity: 'nursing-order',
      entityId: String(orderId),
      userId: actor?.id,
      createdBy: actorLabelOf(actor),
      item: 'nursing-order:acknowledge',
    });
    return this.mapOrder(row);
  }

  // ── Tasks ──────────────────────────────────────────────────────────

  async listTasks(params?: {
    personId?: number;
    admissionId?: number;
    status?: string;
    category?: string;
  }) {
    const where: Prisma.NursingTasksWhereInput = {
      ...(params?.personId ? { PERSON_ID: params.personId } : {}),
      ...(params?.admissionId ? { ADMISSION_ID: params.admissionId } : {}),
      ...(params?.status ? { STATUS: params.status } : {}),
      ...(params?.category ? { CATEGORY: params.category } : {}),
    };
    const rows = await this.prisma.nursingTasks.findMany({
      where,
      orderBy: [{ DUE_AT: 'asc' }, { CREATED_DATE: 'desc' }],
      take: 200,
    });
    return { items: rows.map((r) => this.mapTask(r)) };
  }

  async createTask(dto: CreateNursingTaskDto, actor?: AuthUser) {
    if (dto.personId != null) await this.assertPerson(dto.personId);
    if (dto.admissionId != null) await this.assertAdmission(dto.admissionId);
    const actorLabel = actorLabelOf(actor);
    const row = await this.prisma.nursingTasks.create({
      data: {
        PERSON_ID: dto.personId ?? null,
        ADMISSION_ID: dto.admissionId ?? null,
        PATIENT_NAME: dto.patientName ?? null,
        TITLE: dto.title,
        CATEGORY: dto.category ?? 'Other',
        STATUS: 'PENDING',
        DUE_AT: dto.dueAt ? new Date(dto.dueAt) : null,
        SOURCE_ORDER_ID: dto.sourceOrderId ?? null,
        ASSIGNED_TO: dto.assignedTo ?? null,
        CREATED_BY: actorLabel,
        CREATED_BY_ID: actor?.id ?? null,
      },
    });
    await this.audit.log({
      type: 'nursing-task:create',
      entity: 'nursing-task',
      entityId: String(row.TASK_ID),
      userId: actor?.id,
      createdBy: actorLabelOf(actor),
      item: 'nursing-task:create',
    });
    return this.mapTask(row);
  }

  async updateTask(
    taskId: number,
    dto: UpdateNursingTaskDto,
    actor?: AuthUser,
  ) {
    const existing = await this.prisma.nursingTasks.findUnique({
      where: { TASK_ID: taskId },
    });
    if (!existing) throw new NotFoundException('Task not found');
    const row = await this.prisma.nursingTasks.update({
      where: { TASK_ID: taskId },
      data: {
        ...(dto.status != null ? { STATUS: dto.status } : {}),
        ...(dto.assignedTo !== undefined
          ? { ASSIGNED_TO: dto.assignedTo }
          : {}),
        UPDATED_DATE: new Date(),
      },
    });
    await this.audit.log({
      type: 'nursing-task:update',
      entity: 'nursing-task',
      entityId: String(taskId),
      userId: actor?.id,
      createdBy: actorLabelOf(actor),
      item: 'nursing-task:update',
      newValue: { status: dto.status },
    });
    return this.mapTask(row);
  }

  // ── MAR ────────────────────────────────────────────────────────────

  async listMar(params?: {
    personId?: number;
    admissionId?: number;
    status?: string;
    kind?: string;
  }) {
    const where: Prisma.NursingMarEntriesWhereInput = {
      ...(params?.personId ? { PERSON_ID: params.personId } : {}),
      ...(params?.admissionId ? { ADMISSION_ID: params.admissionId } : {}),
      ...(params?.status ? { STATUS: params.status } : {}),
      ...(params?.kind ? { KIND: params.kind } : {}),
    };
    const rows = await this.prisma.nursingMarEntries.findMany({
      where,
      include: {
        person: {
          select: {
            PERSON_ID: true,
            HOSPITAL_NO: true,
            FIRST_NAME: true,
            LAST_NAME: true,
            MIDDLE_NAME: true,
          },
        },
      },
      orderBy: { SCHEDULED_TIME: 'asc' },
      take: 300,
    });
    return { items: rows.map((r) => this.mapMar(r)) };
  }

  async createMar(dto: CreateMarEntryDto, actor?: AuthUser) {
    await this.assertPerson(dto.personId);
    if (dto.admissionId != null) await this.assertAdmission(dto.admissionId);
    const row = await this.prisma.nursingMarEntries.create({
      data: {
        PERSON_ID: dto.personId,
        ADMISSION_ID: dto.admissionId ?? null,
        ORDER_ID: dto.orderId ?? null,
        DRUG: dto.drug,
        DOSE: dto.dose,
        ROUTE: dto.route,
        FREQUENCY: dto.frequency,
        SCHEDULED_TIME: new Date(dto.scheduledTime),
        KIND: dto.kind ?? 'Scheduled',
        STATUS: dto.pharmacyDispensed ? 'DUE' : 'PENDING',
        PHARMACY_DISPENSED: dto.pharmacyDispensed ?? false,
        SOURCE: dto.source ?? null,
        PRESCRIBER: dto.prescriber ?? null,
        NOTES: dto.notes ?? null,
        SIDE_EFFECTS: dto.sideEffects ?? null,
        CREATED_BY_ID: actor?.id ?? null,
      },
      include: {
        person: {
          select: {
            PERSON_ID: true,
            HOSPITAL_NO: true,
            FIRST_NAME: true,
            LAST_NAME: true,
            MIDDLE_NAME: true,
          },
        },
      },
    });
    await this.audit.log({
      type: 'nursing-mar:create',
      entity: 'nursing-mar',
      entityId: String(row.MAR_ID),
      userId: actor?.id,
      createdBy: actorLabelOf(actor),
      item: 'nursing-mar:create',
    });
    return this.mapMar(row);
  }

  async createExternalMed(dto: CreateExternalMedDto, actor?: AuthUser) {
    await this.assertPerson(dto.personId);
    if (dto.admissionId != null) await this.assertAdmission(dto.admissionId);
    const actorLabel = actorLabelOf(actor);
    const now = new Date();
    const row = await this.prisma.nursingMarEntries.create({
      data: {
        PERSON_ID: dto.personId,
        ADMISSION_ID: dto.admissionId ?? null,
        DRUG: dto.drug,
        DOSE: dto.dose ?? '—',
        ROUTE: dto.route ?? 'PO',
        FREQUENCY: dto.frequency ?? '—',
        SCHEDULED_TIME: dto.scheduledTime
          ? new Date(dto.scheduledTime)
          : now,
        KIND: 'External',
        STATUS: 'GIVEN',
        SOURCE: dto.source ?? null,
        PRESCRIBER: dto.prescriber ?? null,
        NOTES: dto.notes ?? null,
        PHARMACY_DISPENSED: true,
        ADMINISTERED_BY: actorLabel,
        ADMINISTERED_AT: now,
        CREATED_BY_ID: actor?.id ?? null,
      },
      include: {
        person: {
          select: {
            PERSON_ID: true,
            HOSPITAL_NO: true,
            FIRST_NAME: true,
            LAST_NAME: true,
            MIDDLE_NAME: true,
          },
        },
      },
    });
    await this.audit.log({
      type: 'nursing-mar:external',
      entity: 'nursing-mar',
      entityId: String(row.MAR_ID),
      userId: actor?.id,
      createdBy: actorLabelOf(actor),
      item: 'nursing-mar:external',
    });
    return this.mapMar(row);
  }

  async marAction(
    marId: number,
    action: 'administer' | 'refuse' | 'miss' | 'hold',
    dto: MarActionDto,
    actor?: AuthUser,
  ) {
    const existing = await this.prisma.nursingMarEntries.findUnique({
      where: { MAR_ID: marId },
    });
    if (!existing) throw new NotFoundException('MAR entry not found');
    if (existing.STATUS === 'GIVEN') {
      throw new BadRequestException('Medication already given');
    }
    const actorLabel = actorLabelOf(actor);
    const now = new Date();
    const statusMap = {
      administer: 'GIVEN',
      refuse: 'REFUSED',
      miss: 'MISSED',
      hold: 'HELD',
    } as const;
    if (action !== 'administer' && !dto.reason?.trim()) {
      throw new BadRequestException('Reason is required');
    }
    const row = await this.prisma.nursingMarEntries.update({
      where: { MAR_ID: marId },
      data: {
        STATUS: statusMap[action],
        REASON: dto.reason ?? null,
        ADMINISTERED_BY: actorLabel,
        ADMINISTERED_AT: now,
        UPDATED_DATE: now,
      },
      include: {
        person: {
          select: {
            PERSON_ID: true,
            HOSPITAL_NO: true,
            FIRST_NAME: true,
            LAST_NAME: true,
            MIDDLE_NAME: true,
          },
        },
      },
    });
    await this.audit.log({
      type: `nursing-mar:${action}`,
      entity: 'nursing-mar',
      entityId: String(marId),
      userId: actor?.id,
      createdBy: actorLabelOf(actor),
      item: `nursing-mar:${action}`,
    });
    return this.mapMar(row);
  }

  /** Pharmacy dispense bridge — marks MAR ready (PENDING → DUE). */
  async markMarDispensed(marId: number, actor?: AuthUser) {
    const existing = await this.prisma.nursingMarEntries.findUnique({
      where: { MAR_ID: marId },
    });
    if (!existing) throw new NotFoundException('MAR entry not found');
    const now = new Date();
    const row = await this.prisma.nursingMarEntries.update({
      where: { MAR_ID: marId },
      data: {
        PHARMACY_DISPENSED: true,
        STATUS: existing.STATUS === 'PENDING' ? 'DUE' : existing.STATUS,
        UPDATED_DATE: now,
      },
      include: {
        person: {
          select: {
            PERSON_ID: true,
            HOSPITAL_NO: true,
            FIRST_NAME: true,
            LAST_NAME: true,
            MIDDLE_NAME: true,
          },
        },
      },
    });
    await this.audit.log({
      type: 'nursing-mar:dispense',
      entity: 'nursing-mar',
      entityId: String(marId),
      userId: actor?.id,
      createdBy: actorLabelOf(actor),
      item: 'nursing-mar:dispense',
    });
    return this.mapMar(row);
  }

  // ── Samples ────────────────────────────────────────────────────────

  async listSamples(params?: { admissionId?: number; personId?: number }) {
    const where: Prisma.NursingOrdersWhereInput = {
      KIND: 'lab',
      ...(params?.personId ? { PERSON_ID: params.personId } : {}),
      ...(params?.admissionId ? { ADMISSION_ID: params.admissionId } : {}),
    };
    const rows = await this.prisma.nursingOrders.findMany({
      where,
      include: {
        person: {
          select: {
            PERSON_ID: true,
            HOSPITAL_NO: true,
            FIRST_NAME: true,
            LAST_NAME: true,
            MIDDLE_NAME: true,
          },
        },
      },
      orderBy: { CREATED_DATE: 'desc' },
      take: 200,
    });
    return { items: rows.map((r) => this.mapOrder(r)) };
  }

  async collectSample(orderId: number, actor?: AuthUser) {
    const existing = await this.prisma.nursingOrders.findUnique({
      where: { ORDER_ID: orderId },
    });
    if (!existing) throw new NotFoundException('Lab order not found');
    if (existing.KIND !== 'lab') {
      throw new BadRequestException('Order is not a lab order');
    }
    if (
      !(PAYMENT_CLEARED as readonly string[]).includes(existing.PAYMENT_STATUS)
    ) {
      throw new BadRequestException(
        'Payment not cleared for sample collection',
      );
    }
    if (existing.LAB_STATUS === 'SAMPLE_COLLECTED') {
      throw new BadRequestException('Sample already collected');
    }
    const actorLabel = actorLabelOf(actor);
    const now = new Date();
    const sampleId = `SPL-${orderId}-${now.getTime().toString(36).toUpperCase()}`;
    const row = await this.prisma.nursingOrders.update({
      where: { ORDER_ID: orderId },
      data: {
        LAB_STATUS: 'SAMPLE_COLLECTED',
        SAMPLE_ID: sampleId,
        SAMPLE_COLLECTED_AT: now,
        SAMPLE_COLLECTED_BY: actorLabel,
        STATUS: 'IN_PROGRESS',
        UPDATED_DATE: now,
      },
      include: {
        person: {
          select: {
            PERSON_ID: true,
            HOSPITAL_NO: true,
            FIRST_NAME: true,
            LAST_NAME: true,
            MIDDLE_NAME: true,
          },
        },
      },
    });
    await this.audit.log({
      type: 'nursing-sample:collect',
      entity: 'nursing-order',
      entityId: String(orderId),
      userId: actor?.id,
      createdBy: actorLabelOf(actor),
      item: 'nursing-sample:collect',
      newValue: { sampleId },
    });
    return this.mapOrder(row);
  }

  // ── Shifts ─────────────────────────────────────────────────────────

  async listShifts(params?: { wardId?: number; status?: string }) {
    const where: Prisma.NursingShiftsWhereInput = {
      ...(params?.wardId ? { WARD_ID: params.wardId } : {}),
      ...(params?.status ? { STATUS: params.status } : {}),
    };
    const rows = await this.prisma.nursingShifts.findMany({
      where,
      include: { ward: { select: { WARD_ID: true, CODE: true, NAME: true } } },
      orderBy: { CREATED_DATE: 'desc' },
      take: 100,
    });
    return { items: rows.map((r) => this.mapShift(r)) };
  }

  async getCurrentShift(wardId?: number) {
    const where: Prisma.NursingShiftsWhereInput = {
      STATUS: 'Active',
      ...(wardId ? { WARD_ID: wardId } : {}),
    };
    const row = await this.prisma.nursingShifts.findFirst({
      where,
      include: { ward: { select: { WARD_ID: true, CODE: true, NAME: true } } },
      orderBy: { START_AT: 'desc' },
    });
    return row ? this.mapShift(row) : null;
  }

  async startShift(dto: CreateShiftDto, actor?: AuthUser) {
    const actorLabel = actorLabelOf(actor);
    const active = await this.prisma.nursingShifts.findFirst({
      where: {
        STATUS: 'Active',
        ...(dto.wardId ? { WARD_ID: dto.wardId } : {}),
      },
    });
    if (active) {
      throw new BadRequestException('A shift is already active for this ward');
    }
    let patientsCovered = 0;
    if (dto.wardId) {
      patientsCovered = await this.prisma.admissions.count({
        where: {
          WARD_ID: dto.wardId,
          STATUS: { in: ['ADMITTED', 'ON_LEAVE', 'DISCHARGE_ORDERED'] },
        },
      });
    }
    const row = await this.prisma.nursingShifts.create({
      data: {
        WARD_ID: dto.wardId ?? null,
        SHIFT: dto.shift,
        STATUS: 'Active',
        LEAD_NURSE: dto.leadNurse ?? actorLabel,
        STAFF_COUNT: dto.staffCount ?? 1,
        PATIENTS_COVERED: patientsCovered,
        START_AT: new Date(),
        CREATED_BY_ID: actor?.id ?? null,
      },
      include: { ward: { select: { WARD_ID: true, CODE: true, NAME: true } } },
    });
    await this.audit.log({
      type: 'nursing-shift:start',
      entity: 'nursing-shift',
      entityId: String(row.SHIFT_ID),
      userId: actor?.id,
      createdBy: actorLabelOf(actor),
      item: 'nursing-shift:start',
    });
    return this.mapShift(row);
  }

  async endShift(shiftId: number, dto: EndShiftDto, actor?: AuthUser) {
    const existing = await this.prisma.nursingShifts.findUnique({
      where: { SHIFT_ID: shiftId },
    });
    if (!existing) throw new NotFoundException('Shift not found');
    if (existing.STATUS !== 'Active') {
      throw new BadRequestException('Shift is not active');
    }
    const row = await this.prisma.nursingShifts.update({
      where: { SHIFT_ID: shiftId },
      data: {
        STATUS: 'Ended',
        END_AT: new Date(),
        SUMMARY: dto.summary ?? existing.SUMMARY,
        UPDATED_DATE: new Date(),
      },
      include: { ward: { select: { WARD_ID: true, CODE: true, NAME: true } } },
    });
    await this.audit.log({
      type: 'nursing-shift:end',
      entity: 'nursing-shift',
      entityId: String(shiftId),
      userId: actor?.id,
      createdBy: actorLabelOf(actor),
      item: 'nursing-shift:end',
    });
    return this.mapShift(row);
  }

  // ── Handovers ──────────────────────────────────────────────────────

  async listHandovers(params?: { wardId?: number }) {
    const rows = await this.prisma.nursingHandovers.findMany({
      where: params?.wardId ? { WARD_ID: params.wardId } : undefined,
      orderBy: { CREATED_DATE: 'desc' },
      take: 100,
    });
    return { items: rows.map((r) => this.mapHandover(r)) };
  }

  async createHandover(dto: CreateHandoverDto, actor?: AuthUser) {
    const actorLabel = actorLabelOf(actor);
    let wardName = dto.wardName ?? null;
    if (dto.wardId && !wardName) {
      const ward = await this.prisma.wards.findUnique({
        where: { WARD_ID: dto.wardId },
      });
      wardName = ward?.NAME ?? null;
    }
    const row = await this.prisma.nursingHandovers.create({
      data: {
        WARD_ID: dto.wardId ?? null,
        WARD_NAME: wardName,
        SHIFT: dto.shift,
        SUMMARY: dto.summary,
        CRITICAL_PATIENTS_JSON: JSON.stringify(dto.criticalPatients ?? []),
        PENDING_MEDS: dto.pendingMeds ?? null,
        PENDING_LABS: dto.pendingLabs ?? null,
        INCIDENTS: dto.incidents ?? null,
        SPECIAL_INSTRUCTIONS: dto.specialInstructions ?? null,
        HANDED_OVER_BY: actorLabel,
        CREATED_BY_ID: actor?.id ?? null,
      },
    });
    await this.audit.log({
      type: 'nursing-handover:create',
      entity: 'nursing-handover',
      entityId: String(row.HANDOVER_ID),
      userId: actor?.id,
      createdBy: actorLabelOf(actor),
      item: 'nursing-handover:create',
    });
    return this.mapHandover(row);
  }

  async acknowledgeHandover(handoverId: number, actor?: AuthUser) {
    const existing = await this.prisma.nursingHandovers.findUnique({
      where: { HANDOVER_ID: handoverId },
    });
    if (!existing) throw new NotFoundException('Handover not found');
    if (existing.ACKNOWLEDGED) {
      throw new BadRequestException('Handover already acknowledged');
    }
    const row = await this.prisma.nursingHandovers.update({
      where: { HANDOVER_ID: handoverId },
      data: {
        ACKNOWLEDGED: true,
        RECEIVED_BY: actorLabelOf(actor),
        ACKNOWLEDGED_AT: new Date(),
      },
    });
    await this.audit.log({
      type: 'nursing-handover:acknowledge',
      entity: 'nursing-handover',
      entityId: String(handoverId),
      userId: actor?.id,
      createdBy: actorLabelOf(actor),
      item: 'nursing-handover:acknowledge',
    });
    return this.mapHandover(row);
  }

  // ── ICU ────────────────────────────────────────────────────────────

  async listIcuNotes(params?: { personId?: number; admissionId?: number }) {
    const where: Prisma.NursingIcuNotesWhereInput = {
      ...(params?.personId ? { PERSON_ID: params.personId } : {}),
      ...(params?.admissionId ? { ADMISSION_ID: params.admissionId } : {}),
    };
    const rows = await this.prisma.nursingIcuNotes.findMany({
      where,
      orderBy: { RECORDED_AT: 'desc' },
      take: 200,
    });
    return { items: rows.map((r) => this.mapIcuNote(r)) };
  }

  async createIcuNote(dto: CreateIcuNoteDto, actor?: AuthUser) {
    await this.assertPerson(dto.personId);
    if (dto.admissionId != null) await this.assertAdmission(dto.admissionId);
    const row = await this.prisma.nursingIcuNotes.create({
      data: {
        PERSON_ID: dto.personId,
        ADMISSION_ID: dto.admissionId ?? null,
        BLOOD_PRESSURE: dto.bloodPressure ?? null,
        SPO2_PCT: dec(dto.spo2Pct),
        HEART_RATE: dto.heartRate ?? null,
        VENT_SETTINGS: dto.ventSettings ?? null,
        NOTE: dto.note ?? null,
        RECORDED_BY: actorLabelOf(actor),
        CREATED_BY_ID: actor?.id ?? null,
      },
    });
    await this.audit.log({
      type: 'nursing-icu:note',
      entity: 'nursing-icu-note',
      entityId: String(row.ICU_NOTE_ID),
      userId: actor?.id,
      createdBy: actorLabelOf(actor),
      item: 'nursing-icu:note',
    });
    return this.mapIcuNote(row);
  }

  async listIcuInfusions(params?: {
    personId?: number;
    admissionId?: number;
  }) {
    const where: Prisma.NursingIcuInfusionsWhereInput = {
      ...(params?.personId ? { PERSON_ID: params.personId } : {}),
      ...(params?.admissionId ? { ADMISSION_ID: params.admissionId } : {}),
    };
    const rows = await this.prisma.nursingIcuInfusions.findMany({
      where,
      orderBy: { RECORDED_AT: 'desc' },
      take: 200,
    });
    return { items: rows.map((r) => this.mapIcuInfusion(r)) };
  }

  async createIcuInfusion(dto: CreateIcuInfusionDto, actor?: AuthUser) {
    await this.assertPerson(dto.personId);
    if (dto.admissionId != null) await this.assertAdmission(dto.admissionId);
    const row = await this.prisma.nursingIcuInfusions.create({
      data: {
        PERSON_ID: dto.personId,
        ADMISSION_ID: dto.admissionId ?? null,
        MEDICATION: dto.medication,
        CURRENT_RATE: dto.currentRate ?? null,
        NEW_RATE: dto.newRate ?? null,
        REASON: dto.reason ?? null,
        NOTE: dto.note ?? null,
        STATUS: dto.newRate ? 'Titrated' : 'Running',
        RECORDED_BY: actorLabelOf(actor),
        CREATED_BY_ID: actor?.id ?? null,
      },
    });
    await this.audit.log({
      type: 'nursing-icu:infusion',
      entity: 'nursing-icu-infusion',
      entityId: String(row.INFUSION_ID),
      userId: actor?.id,
      createdBy: actorLabelOf(actor),
      item: 'nursing-icu:infusion',
    });
    return this.mapIcuInfusion(row);
  }

  async icuBoard() {
    const admissions = await this.prisma.admissions.findMany({
      where: {
        STATUS: { in: ['ADMITTED', 'ON_LEAVE', 'DISCHARGE_ORDERED'] },
        OR: [
          { ADMISSION_TYPE: 'ICU' },
          { ward: { WARD_TYPE: 'ICU' } },
          { ward: { CODE: 'ICU' } },
        ],
      },
      include: {
        person: {
          select: {
            PERSON_ID: true,
            HOSPITAL_NO: true,
            FIRST_NAME: true,
            LAST_NAME: true,
            MIDDLE_NAME: true,
          },
        },
        bed: { select: { LABEL: true } },
        ward: { select: { NAME: true, CODE: true } },
      },
      take: 50,
    });
    const items = await Promise.all(
      admissions.map(async (a) => {
        const [note, infusion] = await Promise.all([
          this.prisma.nursingIcuNotes.findFirst({
            where: { ADMISSION_ID: a.ADMISSION_ID },
            orderBy: { RECORDED_AT: 'desc' },
          }),
          this.prisma.nursingIcuInfusions.findFirst({
            where: { ADMISSION_ID: a.ADMISSION_ID, STATUS: { not: 'Stopped' } },
            orderBy: { RECORDED_AT: 'desc' },
          }),
        ]);
        return {
          admissionId: a.ADMISSION_ID,
          personId: a.PERSON_ID,
          person: a.person
            ? {
                personId: a.person.PERSON_ID,
                hospitalNo: a.person.HOSPITAL_NO,
                firstName: a.person.FIRST_NAME,
                lastName: a.person.LAST_NAME,
                middleName: a.person.MIDDLE_NAME,
              }
            : null,
          wardName: a.ward?.NAME ?? null,
          bedLabel: a.bed?.LABEL ?? null,
          diagnosis: a.DIAGNOSIS,
          latestNote: note ? this.mapIcuNote(note) : null,
          latestInfusion: infusion ? this.mapIcuInfusion(infusion) : null,
        };
      }),
    );
    return { items };
  }

  // ── Comms ──────────────────────────────────────────────────────────

  async listMessages(params?: { channel?: string }) {
    const rows = await this.prisma.nursingMessages.findMany({
      where: params?.channel ? { CHANNEL: params.channel } : undefined,
      orderBy: { CREATED_DATE: 'asc' },
      take: 300,
    });
    return { items: rows.map((r) => this.mapMessage(r)) };
  }

  async createMessage(dto: CreateMessageDto, actor?: AuthUser) {
    const row = await this.prisma.nursingMessages.create({
      data: {
        CHANNEL: dto.channel,
        BODY: dto.body,
        FROM_LABEL: actorLabelOf(actor),
        FROM_USER_ID: actor?.id ?? null,
        PERSON_ID: dto.personId ?? null,
        IS_MINE: true,
      },
    });
    await this.audit.log({
      type: 'nursing-comms:create',
      entity: 'nursing-message',
      entityId: String(row.MESSAGE_ID),
      userId: actor?.id,
      createdBy: actorLabelOf(actor),
      item: 'nursing-comms:create',
    });
    return this.mapMessage(row);
  }

  async markMessageRead(messageId: number, actor?: AuthUser) {
    const existing = await this.prisma.nursingMessages.findUnique({
      where: { MESSAGE_ID: messageId },
    });
    if (!existing) throw new NotFoundException('Message not found');
    const row = await this.prisma.nursingMessages.update({
      where: { MESSAGE_ID: messageId },
      data: { READ_AT: new Date() },
    });
    await this.audit.log({
      type: 'nursing-comms:read',
      entity: 'nursing-message',
      entityId: String(messageId),
      userId: actor?.id,
      createdBy: actorLabelOf(actor),
      item: 'nursing-comms:read',
    });
    return this.mapMessage(row);
  }

  // ── Reports & analytics ────────────────────────────────────────────

  async listReports() {
    const rows = await this.prisma.nursingReportSnapshots.findMany({
      orderBy: { CREATED_DATE: 'desc' },
      take: 50,
    });
    return { items: rows.map((r) => this.mapReport(r)) };
  }

  async generateReport(dto: GenerateReportDto, actor?: AuthUser) {
    let wardName: string | null = null;
    if (dto.wardId) {
      const ward = await this.prisma.wards.findUnique({
        where: { WARD_ID: dto.wardId },
      });
      wardName = ward?.NAME ?? null;
    }
    const [
      admissionsActive,
      discharges,
      incidentsOpen,
      marDue,
      marGiven,
      tasksPending,
      observations,
    ] = await Promise.all([
      this.prisma.admissions.count({
        where: {
          STATUS: { in: ['ADMITTED', 'ON_LEAVE', 'DISCHARGE_ORDERED'] },
          ...(dto.wardId ? { WARD_ID: dto.wardId } : {}),
        },
      }),
      this.prisma.admissions.count({
        where: {
          STATUS: 'DISCHARGED',
          ...(dto.wardId ? { WARD_ID: dto.wardId } : {}),
        },
      }),
      this.prisma.nursingIncidents.count({
        where: { STATUS: { in: ['REPORTED', 'ESCALATED'] } },
      }),
      this.prisma.nursingMarEntries.count({ where: { STATUS: 'DUE' } }),
      this.prisma.nursingMarEntries.count({ where: { STATUS: 'GIVEN' } }),
      this.prisma.nursingTasks.count({
        where: { STATUS: { in: ['PENDING', 'IN_PROGRESS'] } },
      }),
      this.prisma.nursingObservations.count(),
    ]);

    const payload = {
      reportType: dto.reportType,
      rangeLabel: dto.rangeLabel ?? null,
      notes: dto.notes ?? null,
      generatedAt: new Date().toISOString(),
      metrics: {
        admissionsActive,
        discharges,
        incidentsOpen,
        marDue,
        marGiven,
        tasksPending,
        observations,
      },
    };

    const row = await this.prisma.nursingReportSnapshots.create({
      data: {
        REPORT_TYPE: dto.reportType,
        RANGE_LABEL: dto.rangeLabel ?? null,
        WARD_ID: dto.wardId ?? null,
        WARD_NAME: wardName,
        NOTES: dto.notes ?? null,
        PAYLOAD_JSON: JSON.stringify(payload),
        GENERATED_BY: actorLabelOf(actor),
      },
    });
    await this.audit.log({
      type: 'nursing-report:generate',
      entity: 'nursing-report',
      entityId: String(row.REPORT_ID),
      userId: actor?.id,
      createdBy: actorLabelOf(actor),
      item: 'nursing-report:generate',
    });
    return this.mapReport(row);
  }

  async analyticsSummary() {
    const [
      admissions,
      discharges,
      dama,
      openIncidents,
      marDue,
      marGiven,
      marMissed,
      tasksPending,
      tasksCompleted,
      obsCount,
      wards,
    ] = await Promise.all([
      this.prisma.admissions.count({
        where: {
          STATUS: { in: ['ADMITTED', 'ON_LEAVE', 'DISCHARGE_ORDERED'] },
        },
      }),
      this.prisma.admissions.count({ where: { STATUS: 'DISCHARGED' } }),
      this.prisma.admissions.count({
        where: {
          STATUS: 'DISCHARGED',
          DISCHARGE_REASON: { contains: 'DAMA', mode: 'insensitive' },
        },
      }),
      this.prisma.nursingIncidents.count({
        where: { STATUS: { in: ['REPORTED', 'ESCALATED'] } },
      }),
      this.prisma.nursingMarEntries.count({ where: { STATUS: 'DUE' } }),
      this.prisma.nursingMarEntries.count({ where: { STATUS: 'GIVEN' } }),
      this.prisma.nursingMarEntries.count({ where: { STATUS: 'MISSED' } }),
      this.prisma.nursingTasks.count({
        where: { STATUS: { in: ['PENDING', 'IN_PROGRESS'] } },
      }),
      this.prisma.nursingTasks.count({ where: { STATUS: 'COMPLETED' } }),
      this.prisma.nursingObservations.count(),
      this.prisma.wards.findMany({
        include: {
          beds: true,
          admissions: {
            where: {
              STATUS: { in: ['ADMITTED', 'ON_LEAVE', 'DISCHARGE_ORDERED'] },
            },
          },
        },
      }),
    ]);

    const medTotal = marGiven + marMissed + marDue;
    const medCompliance =
      medTotal === 0 ? 100 : Math.round((marGiven / medTotal) * 100);
    const obsCompliance =
      admissions === 0
        ? 100
        : Math.min(100, Math.round((obsCount / Math.max(admissions, 1)) * 20));

    return {
      admissions,
      discharges,
      dama,
      trialLeave: await this.prisma.admissions.count({
        where: { STATUS: 'ON_LEAVE' },
      }),
      referrals: 0,
      deaths: await this.prisma.nursingIncidents.count({
        where: { INCIDENT_TYPE: 'Death' },
      }),
      openIncidents,
      marDue,
      marGiven,
      marMissed,
      tasksPending,
      tasksCompleted,
      medCompliance,
      obsCompliance,
      wardOccupancy: wards.map((w) => ({
        wardId: w.WARD_ID,
        code: w.CODE,
        name: w.NAME,
        capacity: w.beds.length,
        occupied: w.admissions.length,
        pct:
          w.beds.length === 0
            ? 0
            : Math.round((w.admissions.length / w.beds.length) * 100),
      })),
    };
  }

  // ── Helpers ────────────────────────────────────────────────────────

  private async assertPerson(personId: number): Promise<void> {
    const p = await this.prisma.persons.findUnique({
      where: { PERSON_ID: personId },
      select: { PERSON_ID: true },
    });
    if (!p) throw new NotFoundException('Person not found');
  }

  private async assertAdmission(admissionId: number): Promise<void> {
    const a = await this.prisma.admissions.findUnique({
      where: { ADMISSION_ID: admissionId },
      select: { ADMISSION_ID: true },
    });
    if (!a) throw new NotFoundException('Admission not found');
  }

  private mapPerson(person?: {
    PERSON_ID: number;
    HOSPITAL_NO: string | null;
    FIRST_NAME: string | null;
    LAST_NAME: string | null;
    MIDDLE_NAME: string | null;
  } | null) {
    if (!person) return null;
    return {
      personId: person.PERSON_ID,
      hospitalNo: person.HOSPITAL_NO,
      firstName: person.FIRST_NAME,
      lastName: person.LAST_NAME,
      middleName: person.MIDDLE_NAME,
    };
  }

  private mapOrder(row: {
    ORDER_ID: number;
    PERSON_ID: number;
    ADMISSION_ID: number | null;
    KIND: string;
    ITEMS_JSON: string;
    STATUS: string;
    ORDERED_BY: string | null;
    ACKNOWLEDGED_BY: string | null;
    ACKNOWLEDGED_AT: Date | null;
    PAYMENT_STATUS: string;
    LAB_STATUS: string | null;
    SAMPLE_ID: string | null;
    SAMPLE_COLLECTED_AT: Date | null;
    SAMPLE_COLLECTED_BY: string | null;
    CREATED_DATE: Date;
    UPDATED_DATE: Date | null;
    person?: {
      PERSON_ID: number;
      HOSPITAL_NO: string | null;
      FIRST_NAME: string | null;
      LAST_NAME: string | null;
      MIDDLE_NAME: string | null;
    } | null;
  }) {
    return {
      orderId: row.ORDER_ID,
      personId: row.PERSON_ID,
      admissionId: row.ADMISSION_ID,
      kind: row.KIND,
      items: parseItems(row.ITEMS_JSON),
      status: row.STATUS,
      orderedBy: row.ORDERED_BY,
      acknowledgedBy: row.ACKNOWLEDGED_BY,
      acknowledgedAt: row.ACKNOWLEDGED_AT?.toISOString() ?? null,
      paymentStatus: row.PAYMENT_STATUS,
      labStatus: row.LAB_STATUS,
      sampleId: row.SAMPLE_ID,
      sampleCollectedAt: row.SAMPLE_COLLECTED_AT?.toISOString() ?? null,
      sampleCollectedBy: row.SAMPLE_COLLECTED_BY,
      createdAt: row.CREATED_DATE.toISOString(),
      updatedAt: row.UPDATED_DATE?.toISOString() ?? null,
      person: this.mapPerson(row.person),
      paymentCleared: (PAYMENT_CLEARED as readonly string[]).includes(
        row.PAYMENT_STATUS,
      ),
    };
  }

  private mapTask(row: {
    TASK_ID: number;
    PERSON_ID: number | null;
    ADMISSION_ID: number | null;
    PATIENT_NAME: string | null;
    TITLE: string;
    CATEGORY: string;
    STATUS: string;
    DUE_AT: Date | null;
    SOURCE_ORDER_ID: number | null;
    ASSIGNED_TO: string | null;
    CREATED_BY: string | null;
    CREATED_DATE: Date;
    UPDATED_DATE: Date | null;
  }) {
    return {
      taskId: row.TASK_ID,
      personId: row.PERSON_ID,
      admissionId: row.ADMISSION_ID,
      patientName: row.PATIENT_NAME,
      title: row.TITLE,
      category: row.CATEGORY,
      status: row.STATUS,
      dueAt: row.DUE_AT?.toISOString() ?? null,
      sourceOrderId: row.SOURCE_ORDER_ID,
      assignedTo: row.ASSIGNED_TO,
      createdBy: row.CREATED_BY,
      createdAt: row.CREATED_DATE.toISOString(),
      updatedAt: row.UPDATED_DATE?.toISOString() ?? null,
    };
  }

  private mapMar(row: {
    MAR_ID: number;
    PERSON_ID: number;
    ADMISSION_ID: number | null;
    ORDER_ID: number | null;
    DRUG: string;
    DOSE: string;
    ROUTE: string;
    FREQUENCY: string;
    SCHEDULED_TIME: Date;
    KIND: string;
    STATUS: string;
    REASON: string | null;
    SIDE_EFFECTS: string | null;
    SOURCE: string | null;
    PRESCRIBER: string | null;
    NOTES: string | null;
    PHARMACY_DISPENSED: boolean;
    ADMINISTERED_BY: string | null;
    ADMINISTERED_AT: Date | null;
    CREATED_DATE: Date;
    UPDATED_DATE: Date | null;
    person?: {
      PERSON_ID: number;
      HOSPITAL_NO: string | null;
      FIRST_NAME: string | null;
      LAST_NAME: string | null;
      MIDDLE_NAME: string | null;
    } | null;
  }) {
    return {
      marId: row.MAR_ID,
      personId: row.PERSON_ID,
      admissionId: row.ADMISSION_ID,
      orderId: row.ORDER_ID,
      drug: row.DRUG,
      dose: row.DOSE,
      route: row.ROUTE,
      frequency: row.FREQUENCY,
      scheduledTime: row.SCHEDULED_TIME.toISOString(),
      kind: row.KIND,
      status: row.STATUS,
      reason: row.REASON,
      sideEffects: row.SIDE_EFFECTS,
      source: row.SOURCE,
      prescriber: row.PRESCRIBER,
      notes: row.NOTES,
      pharmacyDispensed: row.PHARMACY_DISPENSED,
      administeredBy: row.ADMINISTERED_BY,
      administeredAt: row.ADMINISTERED_AT?.toISOString() ?? null,
      createdAt: row.CREATED_DATE.toISOString(),
      updatedAt: row.UPDATED_DATE?.toISOString() ?? null,
      person: this.mapPerson(row.person),
    };
  }

  private mapShift(row: {
    SHIFT_ID: number;
    WARD_ID: number | null;
    SHIFT: string;
    STATUS: string;
    LEAD_NURSE: string | null;
    STAFF_COUNT: number;
    PATIENTS_COVERED: number;
    START_AT: Date | null;
    END_AT: Date | null;
    SUMMARY: string | null;
    CREATED_DATE: Date;
    ward?: { WARD_ID: number; CODE: string; NAME: string } | null;
  }) {
    return {
      shiftId: row.SHIFT_ID,
      wardId: row.WARD_ID,
      wardName: row.ward?.NAME ?? null,
      wardCode: row.ward?.CODE ?? null,
      shift: row.SHIFT,
      status: row.STATUS,
      leadNurse: row.LEAD_NURSE,
      staffCount: row.STAFF_COUNT,
      patientsCovered: row.PATIENTS_COVERED,
      startAt: row.START_AT?.toISOString() ?? null,
      endAt: row.END_AT?.toISOString() ?? null,
      summary: row.SUMMARY,
      createdAt: row.CREATED_DATE.toISOString(),
    };
  }

  private mapHandover(row: {
    HANDOVER_ID: number;
    WARD_ID: number | null;
    WARD_NAME: string | null;
    SHIFT: string;
    SUMMARY: string;
    CRITICAL_PATIENTS_JSON: string;
    PENDING_MEDS: string | null;
    PENDING_LABS: string | null;
    INCIDENTS: string | null;
    SPECIAL_INSTRUCTIONS: string | null;
    HANDED_OVER_BY: string | null;
    RECEIVED_BY: string | null;
    ACKNOWLEDGED: boolean;
    ACKNOWLEDGED_AT: Date | null;
    CREATED_DATE: Date;
  }) {
    let criticalPatients: string[] = [];
    try {
      const v = JSON.parse(row.CRITICAL_PATIENTS_JSON) as unknown;
      criticalPatients = Array.isArray(v) ? (v as string[]) : [];
    } catch {
      criticalPatients = [];
    }
    return {
      handoverId: row.HANDOVER_ID,
      wardId: row.WARD_ID,
      wardName: row.WARD_NAME,
      shift: row.SHIFT,
      summary: row.SUMMARY,
      criticalPatients,
      pendingMeds: row.PENDING_MEDS,
      pendingLabs: row.PENDING_LABS,
      incidents: row.INCIDENTS,
      specialInstructions: row.SPECIAL_INSTRUCTIONS,
      handedOverBy: row.HANDED_OVER_BY,
      receivedBy: row.RECEIVED_BY,
      acknowledged: row.ACKNOWLEDGED,
      acknowledgedAt: row.ACKNOWLEDGED_AT?.toISOString() ?? null,
      createdAt: row.CREATED_DATE.toISOString(),
    };
  }

  private mapIcuNote(row: {
    ICU_NOTE_ID: number;
    PERSON_ID: number;
    ADMISSION_ID: number | null;
    BLOOD_PRESSURE: string | null;
    SPO2_PCT: Prisma.Decimal | null;
    HEART_RATE: number | null;
    VENT_SETTINGS: string | null;
    NOTE: string | null;
    RECORDED_BY: string | null;
    RECORDED_AT: Date;
  }) {
    return {
      icuNoteId: row.ICU_NOTE_ID,
      personId: row.PERSON_ID,
      admissionId: row.ADMISSION_ID,
      bloodPressure: row.BLOOD_PRESSURE,
      spo2Pct: row.SPO2_PCT?.toNumber() ?? null,
      heartRate: row.HEART_RATE,
      ventSettings: row.VENT_SETTINGS,
      note: row.NOTE,
      recordedBy: row.RECORDED_BY,
      recordedAt: row.RECORDED_AT.toISOString(),
    };
  }

  private mapIcuInfusion(row: {
    INFUSION_ID: number;
    PERSON_ID: number;
    ADMISSION_ID: number | null;
    MEDICATION: string;
    CURRENT_RATE: string | null;
    NEW_RATE: string | null;
    REASON: string | null;
    NOTE: string | null;
    STATUS: string;
    RECORDED_BY: string | null;
    RECORDED_AT: Date;
  }) {
    return {
      infusionId: row.INFUSION_ID,
      personId: row.PERSON_ID,
      admissionId: row.ADMISSION_ID,
      medication: row.MEDICATION,
      currentRate: row.CURRENT_RATE,
      newRate: row.NEW_RATE,
      reason: row.REASON,
      note: row.NOTE,
      status: row.STATUS,
      recordedBy: row.RECORDED_BY,
      recordedAt: row.RECORDED_AT.toISOString(),
    };
  }

  private mapMessage(row: {
    MESSAGE_ID: number;
    CHANNEL: string;
    BODY: string;
    FROM_LABEL: string | null;
    FROM_USER_ID: number | null;
    PERSON_ID: number | null;
    IS_MINE: boolean;
    READ_AT: Date | null;
    CREATED_DATE: Date;
  }) {
    return {
      messageId: row.MESSAGE_ID,
      channel: row.CHANNEL,
      body: row.BODY,
      fromLabel: row.FROM_LABEL,
      fromUserId: row.FROM_USER_ID,
      personId: row.PERSON_ID,
      isMine: row.IS_MINE,
      readAt: row.READ_AT?.toISOString() ?? null,
      createdAt: row.CREATED_DATE.toISOString(),
    };
  }

  private mapReport(row: {
    REPORT_ID: number;
    REPORT_TYPE: string;
    RANGE_LABEL: string | null;
    WARD_ID: number | null;
    WARD_NAME: string | null;
    NOTES: string | null;
    PAYLOAD_JSON: string;
    GENERATED_BY: string | null;
    CREATED_DATE: Date;
  }) {
    let payload: unknown = {};
    try {
      payload = JSON.parse(row.PAYLOAD_JSON);
    } catch {
      payload = {};
    }
    return {
      reportId: row.REPORT_ID,
      reportType: row.REPORT_TYPE,
      rangeLabel: row.RANGE_LABEL,
      wardId: row.WARD_ID,
      wardName: row.WARD_NAME,
      notes: row.NOTES,
      payload,
      generatedBy: row.GENERATED_BY,
      createdAt: row.CREATED_DATE.toISOString(),
    };
  }
}
