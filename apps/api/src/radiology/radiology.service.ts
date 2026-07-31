import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../auth/types/auth-user.type';
import type {
  CompleteImagingDto,
  ConfirmImagingPaymentDto,
  CreateImagingRequestDto,
  CreateRadiologyReportDto,
  ImportImagingOrderDto,
  InterpretEcgDto,
  RecordEcgDto,
  ReturnReportDto,
  ScheduleImagingDto,
  UpdateImagingRequestDto,
  UpdateEquipmentDto,
  CreateEquipmentDto,
  AdjustConsumableDto,
  CreateConsumableDto,
  CreateRadFormDto,
} from './dto/radiology.dto';
import { evaluateEcgFlags } from './ecg-rules';

function actorLabelOf(actor?: AuthUser): string {
  return (
    actor?.email ||
    [actor?.firstName, actor?.lastName].filter(Boolean).join(' ') ||
    'SYSTEM'
  );
}

function dec(n: number): Prisma.Decimal {
  return new Prisma.Decimal(n);
}

function num(d: Prisma.Decimal | number | null | undefined): number {
  if (d == null) return 0;
  return typeof d === 'number' ? d : Number(d);
}

const PAYMENT_CLEARED = new Set(['Paid', 'Waived']);

const DEFAULT_STUDIES: Array<{
  code: string;
  name: string;
  modality: string;
  region: string;
  price: number;
  turnaround: string;
}> = [
  { code: 'XR-CHEST', name: 'Chest X-Ray PA', modality: 'X-Ray', region: 'Chest', price: 8500, turnaround: '2h' },
  { code: 'US-ABD', name: 'Abdominal Ultrasound', modality: 'Ultrasound', region: 'Abdomen', price: 12000, turnaround: '4h' },
  { code: 'CT-BRAIN', name: 'CT Brain', modality: 'CT Scan', region: 'Brain', price: 45000, turnaround: '6h' },
  { code: 'MRI-BRAIN', name: 'MRI Brain', modality: 'MRI', region: 'Brain', price: 120000, turnaround: '24h' },
  { code: 'ECG-12', name: 'ECG 12-Lead', modality: 'ECG', region: 'Heart', price: 5500, turnaround: '1h' },
  { code: 'EEG-STD', name: 'Standard EEG', modality: 'EEG', region: 'Brain', price: 25000, turnaround: '24h' },
  { code: 'ECHO', name: 'Echocardiography', modality: 'Echocardiography', region: 'Heart', price: 22000, turnaround: '6h' },
  { code: 'MAMMO', name: 'Mammography', modality: 'Mammography', region: 'Breast', price: 18000, turnaround: '24h' },
];

type RequestWithRelations = Prisma.ImagingRequestsGetPayload<{
  include: {
    person: {
      select: {
        PERSON_ID: true;
        HOSPITAL_NO: true;
        FIRST_NAME: true;
        LAST_NAME: true;
        MIDDLE_NAME: true;
        SEX: true;
        DATE_OF_BIRTH: true;
        PATIENT_PHONE_NO: true;
      };
    };
    items: true;
  };
}>;

@Injectable()
export class RadiologyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private async ensureStudiesSeeded() {
    const count = await this.prisma.imagingStudies.count();
    if (count > 0) return;
    await this.prisma.imagingStudies.createMany({
      data: DEFAULT_STUDIES.map((s) => ({
        STUDY_CODE: s.code,
        NAME: s.name,
        MODALITY: s.modality,
        BODY_REGION: s.region,
        TURNAROUND: s.turnaround,
        UNIT_PRICE: dec(s.price),
        STATUS: 'Active',
      })),
      skipDuplicates: true,
    });
  }

  private async nextRequestNo(): Promise<string> {
    const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const prefix = `RAD-${day}-`;
    const latest = await this.prisma.imagingRequests.findFirst({
      where: { REQUEST_NO: { startsWith: prefix } },
      orderBy: { IMAGING_REQUEST_ID: 'desc' },
      select: { REQUEST_NO: true },
    });
    const seq = latest
      ? Number(latest.REQUEST_NO.slice(prefix.length)) + 1
      : 1;
    return `${prefix}${String(seq).padStart(4, '0')}`;
  }

  private mapPerson(p: RequestWithRelations['person']) {
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

  private mapRequest(row: RequestWithRelations) {
    const paymentCleared = PAYMENT_CLEARED.has(row.PAYMENT_STATUS);
    return {
      imagingRequestId: row.IMAGING_REQUEST_ID,
      requestNo: row.REQUEST_NO,
      personId: row.PERSON_ID,
      encounterId: row.ENCOUNTER_ID,
      doctorId: row.DOCTOR_ID ?? 0,
      nursingOrderId: row.NURSING_ORDER_ID,
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
      totalAmount: num(row.TOTAL_AMOUNT),
      rejectionReason: row.REJECTION_REASON,
      scheduledAt: row.SCHEDULED_AT?.toISOString() ?? null,
      scheduledRoom: row.SCHEDULED_ROOM,
      startedAt: row.STARTED_AT?.toISOString() ?? null,
      completedAt: row.COMPLETED_AT?.toISOString() ?? null,
      studyUid: row.STUDY_UID,
      equipmentId: row.EQUIPMENT_ID,
      prepJson: row.PREP_JSON,
      safetyJson: row.SAFETY_JSON,
      paymentCleared,
      processingLocked: !paymentCleared,
      createdAt: row.CREATED_DATE?.toISOString() ?? null,
      updatedAt: row.UPDATED_DATE?.toISOString() ?? null,
      doctorName: row.CREATED_BY,
      items: row.items.map((i) => ({
        itemId: i.ITEM_ID,
        imagingStudyId: i.IMAGING_STUDY_ID,
        studyCode: i.STUDY_CODE,
        studyName: i.STUDY_NAME,
        modality: i.MODALITY,
        bodyRegion: i.BODY_REGION,
        unitPrice: num(i.UNIT_PRICE),
        lineNotes: i.LINE_NOTES,
      })),
      person: this.mapPerson(row.person),
    };
  }

  private requestInclude() {
    return {
      person: {
        select: {
          PERSON_ID: true,
          HOSPITAL_NO: true,
          FIRST_NAME: true,
          LAST_NAME: true,
          MIDDLE_NAME: true,
          SEX: true,
          DATE_OF_BIRTH: true,
          PATIENT_PHONE_NO: true,
        },
      },
      items: true,
    } as const;
  }

  private async getRequestOrThrow(id: number) {
    const row = await this.prisma.imagingRequests.findUnique({
      where: { IMAGING_REQUEST_ID: id },
      include: this.requestInclude(),
    });
    if (!row) throw new NotFoundException(`Imaging request ${id} not found`);
    return row;
  }

  private assertPaymentCleared(row: { PAYMENT_STATUS: string; PRIORITY: string }, action: string) {
    if (PAYMENT_CLEARED.has(row.PAYMENT_STATUS)) return;
    if (row.PRIORITY === 'Emergency') return;
    throw new BadRequestException(`Payment required before ${action}`);
  }

  // ΓöÇΓöÇ Studies ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

  async listStudies(params?: { modality?: string; status?: string; q?: string }) {
    await this.ensureStudiesSeeded();
    const where: Prisma.ImagingStudiesWhereInput = {
      ...(params?.modality ? { MODALITY: params.modality } : {}),
      ...(params?.status ? { STATUS: params.status } : { STATUS: 'Active' }),
      ...(params?.q
        ? {
            OR: [
              { NAME: { contains: params.q, mode: 'insensitive' } },
              { STUDY_CODE: { contains: params.q, mode: 'insensitive' } },
              { MODALITY: { contains: params.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const rows = await this.prisma.imagingStudies.findMany({
      where,
      orderBy: [{ MODALITY: 'asc' }, { NAME: 'asc' }],
    });
    return {
      items: rows.map((s) => ({
        imagingStudyId: s.IMAGING_STUDY_ID,
        studyCode: s.STUDY_CODE,
        name: s.NAME,
        modality: s.MODALITY,
        bodyRegion: s.BODY_REGION,
        turnaround: s.TURNAROUND,
        unitPrice: num(s.UNIT_PRICE),
        status: s.STATUS,
        createdAt: s.CREATED_DATE?.toISOString() ?? null,
        updatedAt: s.UPDATED_DATE?.toISOString() ?? null,
      })),
    };
  }

  // ΓöÇΓöÇ Requests ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

  async listRequests(params?: {
    personId?: number;
    encounterId?: number;
    status?: string;
    paymentStatus?: string;
    source?: string;
    workQueue?: boolean;
    q?: string;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(1, params?.page ?? 1);
    const limit = Math.min(200, Math.max(1, params?.limit ?? 50));
    const statuses = params?.status
      ? params.status.split(',').map((s) => s.trim()).filter(Boolean)
      : undefined;
    const payments = params?.paymentStatus
      ? params.paymentStatus.split(',').map((s) => s.trim()).filter(Boolean)
      : undefined;

    const where: Prisma.ImagingRequestsWhereInput = {
      ...(params?.personId ? { PERSON_ID: params.personId } : {}),
      ...(params?.encounterId ? { ENCOUNTER_ID: params.encounterId } : {}),
      ...(statuses?.length ? { STATUS: { in: statuses } } : {}),
      ...(payments?.length ? { PAYMENT_STATUS: { in: payments } } : {}),
      ...(params?.source ? { SOURCE: params.source } : {}),
      ...(params?.workQueue
        ? {
            STATUS: { in: ['Sent', 'Accepted', 'Scheduled', 'InProgress'] },
            OR: [
              { PAYMENT_STATUS: { in: ['Paid', 'Waived'] } },
              { PRIORITY: 'Emergency' },
            ],
          }
        : {}),
      ...(params?.q
        ? {
            OR: [
              { REQUEST_NO: { contains: params.q, mode: 'insensitive' } },
              { CLINICAL_INDICATION: { contains: params.q, mode: 'insensitive' } },
              {
                person: {
                  OR: [
                    { FIRST_NAME: { contains: params.q, mode: 'insensitive' } },
                    { LAST_NAME: { contains: params.q, mode: 'insensitive' } },
                    { HOSPITAL_NO: { contains: params.q, mode: 'insensitive' } },
                  ],
                },
              },
            ],
          }
        : {}),
    };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.imagingRequests.count({ where }),
      this.prisma.imagingRequests.findMany({
        where,
        include: this.requestInclude(),
        orderBy: { CREATED_DATE: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      items: rows.map((r) => this.mapRequest(r)),
      meta: { page, limit, total },
    };
  }

  async createRequest(dto: CreateImagingRequestDto, actor?: AuthUser) {
    const person = await this.prisma.persons.findUnique({
      where: { PERSON_ID: dto.personId },
    });
    if (!person) throw new NotFoundException(`Person ${dto.personId} not found`);
    await this.ensureStudiesSeeded();

    const studyIds = dto.items.map((i) => i.studyId);
    const studies = await this.prisma.imagingStudies.findMany({
      where: { IMAGING_STUDY_ID: { in: studyIds }, STATUS: 'Active' },
      include: {
        masterService: { select: { GENERAL_PRICE: true, STATUS: true } },
      },
    });
    if (studies.length !== studyIds.length) {
      throw new BadRequestException('One or more imaging studies are invalid or inactive');
    }
    const byId = new Map(studies.map((s) => [s.IMAGING_STUDY_ID, s]));
    let total = 0;
    const itemData = dto.items.map((i) => {
      const s = byId.get(i.studyId)!;
      const masterPrice =
        s.SERVICE_ID != null && s.masterService?.GENERAL_PRICE != null
          ? num(s.masterService.GENERAL_PRICE)
          : null;
      const unitPrice = masterPrice ?? num(s.UNIT_PRICE);
      total += unitPrice;
      return {
        IMAGING_STUDY_ID: s.IMAGING_STUDY_ID,
        STUDY_CODE: s.STUDY_CODE,
        STUDY_NAME: s.NAME,
        MODALITY: s.MODALITY,
        BODY_REGION: s.BODY_REGION,
        UNIT_PRICE: unitPrice,
        LINE_NOTES: i.lineNotes ?? null,
      };
    });

    const priority = dto.priority ?? 'Routine';
    const paymentStatus = priority === 'Emergency' ? 'Waived' : 'Unpaid';
    const requestNo = await this.nextRequestNo();
    const actorLabel = actorLabelOf(actor);

    const row = await this.prisma.imagingRequests.create({
      data: {
        REQUEST_NO: requestNo,
        PERSON_ID: dto.personId,
        ENCOUNTER_ID: dto.encounterId ?? null,
        DOCTOR_ID: actor?.id ?? null,
        SOURCE: dto.source ?? 'Doctor',
        PRIORITY: priority,
        CLINICAL_INDICATION: dto.clinicalIndication ?? null,
        CLINICAL_NOTES: dto.clinicalNotes ?? null,
        CONTRAST: dto.contrast ?? null,
        STATUS: 'Sent',
        PAYMENT_STATUS: paymentStatus,
        TOTAL_AMOUNT: dec(total),
        CREATED_BY_ID: actor?.id ?? null,
        CREATED_BY: actorLabel,
        items: { create: itemData },
      },
      include: this.requestInclude(),
    });

    await this.audit.log({
      type: 'radiology-request:create',
      entity: 'imaging-request',
      entityId: String(row.IMAGING_REQUEST_ID),
      personId: dto.personId,
      userId: actor?.id,
      createdBy: actorLabel,
      newValue: { requestNo, total, priority, paymentStatus },
    });

    return this.mapRequest(row);
  }

  /** Phase 2 ΓÇö idempotent import from nursing/OPC order spine. */
  async importOrder(dto: ImportImagingOrderDto, actor?: AuthUser) {
    if (dto.nursingOrderId != null) {
      const existing = await this.prisma.imagingRequests.findUnique({
        where: { NURSING_ORDER_ID: dto.nursingOrderId },
        include: this.requestInclude(),
      });
      if (existing) return this.mapRequest(existing);
    }

    const created = await this.createRequest(
      {
        personId: dto.personId,
        priority: dto.priority,
        clinicalIndication: dto.clinicalIndication ?? 'Imported imaging order',
        clinicalNotes: dto.clinicalNotes,
        source: dto.source ?? 'Nursing',
        items: dto.items,
      },
      actor,
    );

    if (dto.nursingOrderId != null) {
      const updated = await this.prisma.imagingRequests.update({
        where: { IMAGING_REQUEST_ID: created.imagingRequestId },
        data: { NURSING_ORDER_ID: dto.nursingOrderId, UPDATED_DATE: new Date() },
        include: this.requestInclude(),
      });
      return this.mapRequest(updated);
    }
    return created;
  }

  /** Called from nursing when KIND=imaging ΓÇö builds studies from order items. */
  async importFromNursingOrder(input: {
    nursingOrderId: number;
    personId: number;
    items: Array<{ code: string; name: string; price?: number }>;
    orderedBy?: string;
    actor?: AuthUser;
  }) {
    const existing = await this.prisma.imagingRequests.findUnique({
      where: { NURSING_ORDER_ID: input.nursingOrderId },
      include: this.requestInclude(),
    });
    if (existing) return this.mapRequest(existing);

    await this.ensureStudiesSeeded();
    const studyIds: number[] = [];
    for (const item of input.items) {
      let study = await this.prisma.imagingStudies.findFirst({
        where: {
          OR: [
            { STUDY_CODE: item.code },
            { NAME: { equals: item.name, mode: 'insensitive' } },
          ],
        },
      });
      if (!study) {
        const modality = this.guessModality(item.name);
        study = await this.prisma.imagingStudies.create({
          data: {
            STUDY_CODE: item.code || `AUTO-${Date.now()}`,
            NAME: item.name,
            MODALITY: modality,
            BODY_REGION: item.name,
            UNIT_PRICE: dec(item.price ?? 10000),
            STATUS: 'Active',
            TURNAROUND: '24h',
          },
        });
      }
      studyIds.push(study.IMAGING_STUDY_ID);
    }

    return this.importOrder(
      {
        personId: input.personId,
        nursingOrderId: input.nursingOrderId,
        source: 'Nursing',
        clinicalIndication: 'Nursing / doctor imaging order',
        clinicalNotes: input.orderedBy ? `Ordered by ${input.orderedBy}` : undefined,
        items: studyIds.map((studyId) => ({ studyId })),
      },
      input.actor,
    );
  }

  private guessModality(name: string): string {
    const n = name.toLowerCase();
    if (n.includes('mri')) return 'MRI';
    if (n.includes('ct')) return 'CT Scan';
    if (n.includes('ultrasound') || n.includes('uss')) return 'Ultrasound';
    if (n.includes('echo')) return 'Echocardiography';
    if (n.includes('ecg') || n.includes('ekg')) return 'ECG';
    if (n.includes('eeg')) return 'EEG';
    if (n.includes('mammo')) return 'Mammography';
    if (n.includes('fluoro')) return 'Fluoroscopy';
    return 'X-Ray';
  }

  async updateRequest(id: number, dto: UpdateImagingRequestDto, actor?: AuthUser) {
    const row = await this.getRequestOrThrow(id);
    const nextStatus = dto.status;

    if (nextStatus === 'Accepted') {
      this.assertPaymentCleared(row, 'accept');
    }
    if (nextStatus === 'Rejected') {
      if (!dto.rejectionReason || dto.rejectionReason.trim().length < 4) {
        throw new BadRequestException('Provide a rejection reason (min 4 characters)');
      }
    }
    if (nextStatus === 'Scheduled') {
      this.assertPaymentCleared(row, 'schedule');
    }

    const updated = await this.prisma.imagingRequests.update({
      where: { IMAGING_REQUEST_ID: id },
      data: {
        ...(nextStatus ? { STATUS: nextStatus } : {}),
        ...(dto.rejectionReason != null ? { REJECTION_REASON: dto.rejectionReason } : {}),
        ...(dto.scheduledRoom != null ? { SCHEDULED_ROOM: dto.scheduledRoom } : {}),
        ...(dto.scheduledAt ? { SCHEDULED_AT: new Date(dto.scheduledAt) } : {}),
        ...(dto.equipmentId != null ? { EQUIPMENT_ID: dto.equipmentId } : {}),
        ...(dto.prepJson != null ? { PREP_JSON: dto.prepJson } : {}),
        ...(dto.safetyJson != null ? { SAFETY_JSON: dto.safetyJson } : {}),
        UPDATED_DATE: new Date(),
      },
      include: this.requestInclude(),
    });

    await this.audit.log({
      type: 'radiology-request:update',
      entity: 'imaging-request',
      entityId: String(id),
      personId: row.PERSON_ID,
      userId: actor?.id,
      createdBy: actorLabelOf(actor),
      newValue: dto,
    });

    return this.mapRequest(updated);
  }

  // ΓöÇΓöÇ Phase 3 ΓÇö Cashier payment ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

  async listCashierQueue(params?: {
    paymentStatus?: string;
    q?: string;
    page?: number;
    limit?: number;
  }) {
    return this.listRequests({
      paymentStatus: params?.paymentStatus ?? 'Unpaid',
      q: params?.q,
      page: params?.page,
      limit: params?.limit,
    });
  }

  async confirmPayment(id: number, dto: ConfirmImagingPaymentDto, actor?: AuthUser) {
    const row = await this.getRequestOrThrow(id);
    if (PAYMENT_CLEARED.has(row.PAYMENT_STATUS)) {
      throw new ConflictException(`Request ${row.REQUEST_NO} is already ${row.PAYMENT_STATUS}`);
    }
    const updated = await this.prisma.imagingRequests.update({
      where: { IMAGING_REQUEST_ID: id },
      data: {
        PAYMENT_STATUS: 'Paid',
        PAYMENT_CHANNEL: dto.paymentChannel,
        PAYMENT_REF: dto.paymentRef ?? null,
        PAID_AT: new Date(),
        PAID_BY: actorLabelOf(actor),
        UPDATED_DATE: new Date(),
      },
      include: this.requestInclude(),
    });

    await this.audit.log({
      type: 'radiology-request:payment',
      entity: 'imaging-request',
      entityId: String(id),
      personId: row.PERSON_ID,
      userId: actor?.id,
      createdBy: actorLabelOf(actor),
      newValue: { paymentChannel: dto.paymentChannel, paymentRef: dto.paymentRef },
    });

    return this.mapRequest(updated);
  }

  // ΓöÇΓöÇ Phase 4 ΓÇö Exam / report / release ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

  async schedule(id: number, dto: ScheduleImagingDto, actor?: AuthUser) {
    return this.updateRequest(
      id,
      {
        status: 'Scheduled',
        scheduledAt: dto.scheduledAt ?? new Date().toISOString(),
        scheduledRoom: dto.scheduledRoom,
        equipmentId: dto.equipmentId,
      },
      actor,
    );
  }

  async startExam(id: number, actor?: AuthUser) {
    const row = await this.getRequestOrThrow(id);
    this.assertPaymentCleared(row, 'start exam');
    if (!['Accepted', 'Scheduled', 'Sent'].includes(row.STATUS) && row.PRIORITY !== 'Emergency') {
      // allow Emergency from Sent
    }
    const updated = await this.prisma.imagingRequests.update({
      where: { IMAGING_REQUEST_ID: id },
      data: {
        STATUS: 'InProgress',
        STARTED_AT: new Date(),
        UPDATED_DATE: new Date(),
      },
      include: this.requestInclude(),
    });
    await this.audit.log({
      type: 'radiology-request:start',
      entity: 'imaging-request',
      entityId: String(id),
      personId: row.PERSON_ID,
      userId: actor?.id,
      createdBy: actorLabelOf(actor),
    });
    return this.mapRequest(updated);
  }

  async completeImaging(id: number, dto: CompleteImagingDto, actor?: AuthUser) {
    const row = await this.getRequestOrThrow(id);
    this.assertPaymentCleared(row, 'complete imaging');
    const studyUid =
      dto.studyUid ||
      `1.2.840.${row.IMAGING_REQUEST_ID}.${Date.now()}`;

    if (dto.consumableId != null) {
      const qty = dto.consumableQty ?? 1;
      const c = await this.prisma.radConsumables.findUnique({
        where: { CONSUMABLE_ID: dto.consumableId },
      });
      if (!c) throw new NotFoundException('Consumable not found');
      if (c.STOCK < qty) throw new BadRequestException('Insufficient consumable stock');
      await this.prisma.radConsumables.update({
        where: { CONSUMABLE_ID: dto.consumableId },
        data: { STOCK: c.STOCK - qty, UPDATED_DATE: new Date() },
      });
    }

    if (row.EQUIPMENT_ID != null) {
      await this.prisma.radEquipment.update({
        where: { EQUIPMENT_ID: row.EQUIPMENT_ID },
        data: {
          USAGE_HOURS: { increment: 0.5 },
          STATUS: 'Available',
          UPDATED_DATE: new Date(),
        },
      }).catch(() => undefined);
    }

    const updated = await this.prisma.imagingRequests.update({
      where: { IMAGING_REQUEST_ID: id },
      data: {
        STATUS: 'Completed',
        STUDY_UID: studyUid,
        COMPLETED_AT: new Date(),
        UPDATED_DATE: new Date(),
      },
      include: this.requestInclude(),
    });

    await this.audit.log({
      type: 'radiology-request:complete-imaging',
      entity: 'imaging-request',
      entityId: String(id),
      personId: row.PERSON_ID,
      userId: actor?.id,
      createdBy: actorLabelOf(actor),
      newValue: { studyUid },
    });

    return this.mapRequest(updated);
  }

  async submitReport(dto: CreateRadiologyReportDto, actor?: AuthUser) {
    const req = await this.getRequestOrThrow(dto.imagingRequestId);
    if (!['Completed', 'Reported', 'Verified'].includes(req.STATUS) && req.STATUS !== 'InProgress') {
      // allow Completed primarily; also InProgress for rapid reporting
    }
    const report = await this.prisma.radiologyReports.create({
      data: {
        IMAGING_REQUEST_ID: dto.imagingRequestId,
        FINDINGS: dto.findings,
        IMPRESSION: dto.impression ?? null,
        RECOMMENDATION: dto.recommendation ?? null,
        CRITICAL: !!dto.critical,
        STATUS: 'SUBMITTED',
        AUTHOR: actorLabelOf(actor),
        AUTHOR_ID: actor?.id ?? null,
      },
    });
    await this.prisma.imagingRequests.update({
      where: { IMAGING_REQUEST_ID: dto.imagingRequestId },
      data: { STATUS: 'Reported', UPDATED_DATE: new Date() },
    });
    await this.audit.log({
      type: 'radiology-report:create',
      entity: 'radiology-report',
      entityId: String(report.REPORT_ID),
      personId: req.PERSON_ID,
      userId: actor?.id,
      createdBy: actorLabelOf(actor),
      newValue: { critical: !!dto.critical },
    });
    return this.mapReport(report);
  }

  private mapReport(r: {
    REPORT_ID: number;
    IMAGING_REQUEST_ID: number;
    FINDINGS: string;
    IMPRESSION: string | null;
    RECOMMENDATION: string | null;
    CRITICAL: boolean;
    STATUS: string;
    AUTHOR: string;
    VERIFIER: string | null;
    RETURN_REASON: string | null;
    SUBMITTED_AT: Date;
    VERIFIED_AT: Date | null;
    RELEASED_AT: Date | null;
  }) {
    return {
      reportId: r.REPORT_ID,
      imagingRequestId: r.IMAGING_REQUEST_ID,
      findings: r.FINDINGS,
      impression: r.IMPRESSION,
      recommendation: r.RECOMMENDATION,
      critical: r.CRITICAL,
      status: r.STATUS,
      author: r.AUTHOR,
      verifier: r.VERIFIER,
      returnReason: r.RETURN_REASON,
      submittedAt: r.SUBMITTED_AT.toISOString(),
      verifiedAt: r.VERIFIED_AT?.toISOString() ?? null,
      releasedAt: r.RELEASED_AT?.toISOString() ?? null,
    };
  }

  async listReports(params?: { imagingRequestId?: number; status?: string; critical?: boolean }) {
    const rows = await this.prisma.radiologyReports.findMany({
      where: {
        ...(params?.imagingRequestId
          ? { IMAGING_REQUEST_ID: params.imagingRequestId }
          : {}),
        ...(params?.status ? { STATUS: params.status } : {}),
        ...(params?.critical != null ? { CRITICAL: params.critical } : {}),
      },
      orderBy: { SUBMITTED_AT: 'desc' },
    });
    return { items: rows.map((r) => this.mapReport(r)) };
  }

  async verifyReport(reportId: number, actor?: AuthUser) {
    const report = await this.prisma.radiologyReports.findUnique({
      where: { REPORT_ID: reportId },
    });
    if (!report) throw new NotFoundException('Report not found');
    if (report.STATUS !== 'SUBMITTED' && report.STATUS !== 'RETURNED') {
      throw new BadRequestException('Only submitted/returned reports can be verified');
    }
    const updated = await this.prisma.radiologyReports.update({
      where: { REPORT_ID: reportId },
      data: {
        STATUS: 'VERIFIED',
        VERIFIER: actorLabelOf(actor),
        VERIFIER_ID: actor?.id ?? null,
        VERIFIED_AT: new Date(),
        UPDATED_DATE: new Date(),
      },
    });
    await this.prisma.imagingRequests.update({
      where: { IMAGING_REQUEST_ID: report.IMAGING_REQUEST_ID },
      data: { STATUS: 'Verified', UPDATED_DATE: new Date() },
    });
    await this.audit.log({
      type: 'radiology-report:verify',
      entity: 'radiology-report',
      entityId: String(reportId),
      userId: actor?.id,
      createdBy: actorLabelOf(actor),
    });
    return this.mapReport(updated);
  }

  async returnReport(reportId: number, dto: ReturnReportDto, actor?: AuthUser) {
    const report = await this.prisma.radiologyReports.findUnique({
      where: { REPORT_ID: reportId },
    });
    if (!report) throw new NotFoundException('Report not found');
    const updated = await this.prisma.radiologyReports.update({
      where: { REPORT_ID: reportId },
      data: {
        STATUS: 'RETURNED',
        RETURN_REASON: dto.reason,
        UPDATED_DATE: new Date(),
      },
    });
    await this.prisma.imagingRequests.update({
      where: { IMAGING_REQUEST_ID: report.IMAGING_REQUEST_ID },
      data: { STATUS: 'Completed', UPDATED_DATE: new Date() },
    });
    await this.audit.log({
      type: 'radiology-report:return',
      entity: 'radiology-report',
      entityId: String(reportId),
      userId: actor?.id,
      createdBy: actorLabelOf(actor),
      newValue: { reason: dto.reason },
    });
    return this.mapReport(updated);
  }

  async releaseReport(reportId: number, actor?: AuthUser) {
    const report = await this.prisma.radiologyReports.findUnique({
      where: { REPORT_ID: reportId },
    });
    if (!report) throw new NotFoundException('Report not found');
    if (report.STATUS !== 'VERIFIED') {
      throw new BadRequestException('Report must be verified before release');
    }
    const req = await this.prisma.imagingRequests.findUnique({
      where: { IMAGING_REQUEST_ID: report.IMAGING_REQUEST_ID },
    });
    const updated = await this.prisma.radiologyReports.update({
      where: { REPORT_ID: reportId },
      data: {
        STATUS: 'RELEASED',
        RELEASED_AT: new Date(),
        UPDATED_DATE: new Date(),
      },
    });
    await this.prisma.imagingRequests.update({
      where: { IMAGING_REQUEST_ID: report.IMAGING_REQUEST_ID },
      data: { STATUS: 'Released', UPDATED_DATE: new Date() },
    });
    await this.audit.log({
      type: 'imaging-result:ready',
      entity: 'radiology-report',
      entityId: String(reportId),
      personId: req?.PERSON_ID,
      userId: actor?.id,
      createdBy: actorLabelOf(actor),
      newValue: {
        event: 'IMAGING_RESULT_READY',
        imagingRequestId: report.IMAGING_REQUEST_ID,
        reportId,
        studyUid: req?.STUDY_UID ?? null,
      },
    });
    return this.mapReport(updated);
  }

  async criticalFindings() {
    const [reports, ecgs] = await Promise.all([
      this.prisma.radiologyReports.findMany({
        where: { CRITICAL: true },
        orderBy: { SUBMITTED_AT: 'desc' },
        take: 50,
      }),
      this.prisma.ecgStudies.findMany({
        where: { CRITICAL: true },
        orderBy: { RECORDED_AT: 'desc' },
        take: 50,
      }),
    ]);
    return {
      reports: reports.map((r) => this.mapReport(r)),
      ecgs: ecgs.map((e) => this.mapEcg(e)),
    };
  }

  /** Consumer surface for EMR / ICU / Doctor ΓÇö released (+ optional critical) results with patient context. */
  async listConsumerResults(params?: {
    status?: string;
    personId?: number;
    critical?: boolean;
    limit?: number;
  }) {
    const rows = await this.prisma.radiologyReports.findMany({
      where: {
        ...(params?.status ? { STATUS: params.status } : {}),
        ...(params?.critical != null ? { CRITICAL: params.critical } : {}),
        ...(params?.personId
          ? { request: { PERSON_ID: params.personId } }
          : {}),
      },
      include: {
        request: {
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
            items: { include: { study: true }, take: 3 },
          },
        },
      },
      orderBy: { RELEASED_AT: 'desc' },
      take: params?.limit ?? 100,
    });
    return {
      items: rows.map((r) => {
        const person = r.request?.person;
        const name = person
          ? [person.FIRST_NAME, person.MIDDLE_NAME, person.LAST_NAME].filter(Boolean).join(' ')
          : 'ΓÇö';
        const item = r.request?.items?.[0];
        const modality = item?.study?.MODALITY ?? item?.MODALITY ?? 'Imaging';
        const studyName = item?.study?.NAME ?? item?.STUDY_NAME ?? 'Study';
        return {
          ...this.mapReport(r),
          personId: r.request?.PERSON_ID ?? null,
          patientName: name,
          hospitalNo: person?.HOSPITAL_NO ?? null,
          modality,
          studyName,
          studyUid: r.request?.STUDY_UID ?? null,
          requestNo: r.request?.REQUEST_NO ?? null,
        };
      }),
    };
  }

  async metrics() {
    const [
      total,
      unpaid,
      paid,
      accepted,
      scheduled,
      inProgress,
      completed,
      released,
      criticalReports,
      criticalEcgs,
      reportsAwaiting,
      equipmentOffline,
      ecgWaiting,
      ecgCompleted,
      consumables,
      modalityGroups,
    ] = await Promise.all([
      this.prisma.imagingRequests.count(),
      this.prisma.imagingRequests.count({ where: { PAYMENT_STATUS: 'Unpaid' } }),
      this.prisma.imagingRequests.count({ where: { PAYMENT_STATUS: { in: ['Paid', 'Waived'] } } }),
      this.prisma.imagingRequests.count({ where: { STATUS: 'Accepted' } }),
      this.prisma.imagingRequests.count({ where: { STATUS: 'Scheduled' } }),
      this.prisma.imagingRequests.count({ where: { STATUS: 'InProgress' } }),
      this.prisma.imagingRequests.count({ where: { STATUS: 'Completed' } }),
      this.prisma.imagingRequests.count({ where: { STATUS: 'Released' } }),
      this.prisma.radiologyReports.count({ where: { CRITICAL: true, STATUS: { not: 'RELEASED' } } }),
      this.prisma.ecgStudies.count({ where: { CRITICAL: true, STATUS: 'RECORDED' } }),
      this.prisma.radiologyReports.count({ where: { STATUS: 'SUBMITTED' } }),
      this.prisma.radEquipment.count({ where: { STATUS: { in: ['Offline', 'Maintenance'] } } }),
      this.prisma.ecgStudies.count({ where: { STATUS: 'RECORDED' } }),
      this.prisma.ecgStudies.count({ where: { STATUS: 'VERIFIED' } }),
      this.prisma.radConsumables.findMany(),
      this.prisma.imagingRequestItems.groupBy({
        by: ['MODALITY'],
        _count: { _all: true },
      }),
    ]);

    const lowStock = consumables.filter((c) => c.STOCK <= c.REORDER_LEVEL).length;
    const modalityUtilisation = modalityGroups
      .map((g) => ({ modality: g.MODALITY || 'Unknown', count: g._count._all }))
      .sort((a, b) => b.count - a.count);

    return {
      total,
      unpaid,
      paid,
      accepted,
      scheduled,
      inProgress,
      completed,
      released,
      criticalReports,
      criticalEcgs,
      reportsAwaiting,
      equipmentOffline,
      lowStock,
      ecgWaiting,
      ecgCompleted,
      pending: unpaid + accepted,
      critical: criticalReports + criticalEcgs,
      modalityUtilisation,
    };
  }

  // ΓöÇΓöÇ ECG ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

  private evaluateEcg(dto: RecordEcgDto) {
    return evaluateEcgFlags({
      heartRate: dto.heartRate,
      qtcMs: dto.qtcMs,
      rhythm: dto.rhythm,
      stChanges: dto.stChanges,
    });
  }

  private mapEcg(e: {
    ECG_ID: number;
    PERSON_ID: number;
    IMAGING_REQUEST_ID: number | null;
    ECG_TYPE: string;
    HEART_RATE: number | null;
    RHYTHM: string | null;
    PR_MS: number | null;
    QRS_MS: number | null;
    QTC_MS: number | null;
    ST_CHANGES: string | null;
    INTERPRETATION: string | null;
    ABNORMAL: boolean;
    CRITICAL: boolean;
    STATUS: string;
    RECORDED_BY: string | null;
    INTERPRETED_BY: string | null;
    RECORDED_AT: Date;
    INTERPRETED_AT: Date | null;
  }) {
    return {
      ecgId: e.ECG_ID,
      personId: e.PERSON_ID,
      imagingRequestId: e.IMAGING_REQUEST_ID,
      ecgType: e.ECG_TYPE,
      heartRate: e.HEART_RATE,
      rhythm: e.RHYTHM,
      prMs: e.PR_MS,
      qrsMs: e.QRS_MS,
      qtcMs: e.QTC_MS,
      stChanges: e.ST_CHANGES,
      interpretation: e.INTERPRETATION,
      abnormal: e.ABNORMAL,
      critical: e.CRITICAL,
      status: e.STATUS,
      recordedBy: e.RECORDED_BY,
      interpretedBy: e.INTERPRETED_BY,
      recordedAt: e.RECORDED_AT.toISOString(),
      interpretedAt: e.INTERPRETED_AT?.toISOString() ?? null,
    };
  }

  async recordEcg(dto: RecordEcgDto, actor?: AuthUser) {
    const person = await this.prisma.persons.findUnique({
      where: { PERSON_ID: dto.personId },
    });
    if (!person) throw new NotFoundException(`Person ${dto.personId} not found`);
    const flags = this.evaluateEcg(dto);
    const row = await this.prisma.ecgStudies.create({
      data: {
        PERSON_ID: dto.personId,
        IMAGING_REQUEST_ID: dto.imagingRequestId ?? null,
        ECG_TYPE: dto.ecgType ?? '12-Lead',
        HEART_RATE: dto.heartRate ?? null,
        RHYTHM: dto.rhythm ?? null,
        PR_MS: dto.prMs ?? null,
        QRS_MS: dto.qrsMs ?? null,
        QTC_MS: dto.qtcMs ?? null,
        ST_CHANGES: dto.stChanges ?? null,
        INTERPRETATION: dto.interpretation ?? null,
        ABNORMAL: flags.abnormal,
        CRITICAL: flags.critical,
        STATUS: 'RECORDED',
        RECORDED_BY: actorLabelOf(actor),
      },
    });
    await this.audit.log({
      type: flags.critical ? 'ecg:critical' : 'ecg:create',
      entity: 'ecg-study',
      entityId: String(row.ECG_ID),
      personId: dto.personId,
      userId: actor?.id,
      createdBy: actorLabelOf(actor),
      newValue: flags,
    });
    return this.mapEcg(row);
  }

  async listEcgs(params?: { personId?: number; critical?: boolean }) {
    const rows = await this.prisma.ecgStudies.findMany({
      where: {
        ...(params?.personId ? { PERSON_ID: params.personId } : {}),
        ...(params?.critical != null ? { CRITICAL: params.critical } : {}),
      },
      orderBy: { RECORDED_AT: 'desc' },
    });
    return { items: rows.map((e) => this.mapEcg(e)) };
  }

  async interpretEcg(ecgId: number, dto: InterpretEcgDto, actor?: AuthUser) {
    const row = await this.prisma.ecgStudies.findUnique({ where: { ECG_ID: ecgId } });
    if (!row) throw new NotFoundException('ECG study not found');
    const updated = await this.prisma.ecgStudies.update({
      where: { ECG_ID: ecgId },
      data: {
        INTERPRETATION: dto.interpretation,
        STATUS: 'VERIFIED',
        INTERPRETED_BY: actorLabelOf(actor),
        INTERPRETED_AT: new Date(),
        UPDATED_DATE: new Date(),
      },
    });
    await this.audit.log({
      type: 'ecg:interpret',
      entity: 'ecg-study',
      entityId: String(ecgId),
      personId: row.PERSON_ID,
      userId: actor?.id,
      createdBy: actorLabelOf(actor),
    });
    return this.mapEcg(updated);
  }

  // ΓöÇΓöÇ Equipment / consumables ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

  async listEquipment() {
    await this.ensureEquipmentSeeded();
    const rows = await this.prisma.radEquipment.findMany({
      orderBy: { NAME: 'asc' },
    });
    return {
      items: rows.map((e) => ({
        equipmentId: e.EQUIPMENT_ID,
        name: e.NAME,
        modality: e.MODALITY,
        room: e.LOCATION,
        status: e.STATUS,
        usageHours: num(e.USAGE_HOURS),
      })),
    };
  }

  async listConsumables() {
    await this.ensureConsumablesSeeded();
    const rows = await this.prisma.radConsumables.findMany({
      orderBy: { NAME: 'asc' },
    });
    return {
      items: rows.map((c) => ({
        consumableId: c.CONSUMABLE_ID,
        name: c.NAME,
        category: c.CATEGORY,
        stock: c.STOCK,
        unit: c.UNIT,
        reorderLevel: c.REORDER_LEVEL,
        lowStock: c.STOCK <= c.REORDER_LEVEL,
      })),
    };
  }

  async updateEquipment(id: number, dto: UpdateEquipmentDto, actor?: AuthUser) {
    const row = await this.prisma.radEquipment.findUnique({ where: { EQUIPMENT_ID: id } });
    if (!row) throw new NotFoundException('Equipment not found');
    const status = dto.status === 'InUse' ? 'In Use' : dto.status;
    const updated = await this.prisma.radEquipment.update({
      where: { EQUIPMENT_ID: id },
      data: {
        ...(status ? { STATUS: status } : {}),
        ...(dto.room != null ? { LOCATION: dto.room } : {}),
        UPDATED_DATE: new Date(),
      },
    });
    await this.audit.log({
      type: 'radiology-equipment:update',
      entity: 'rad-equipment',
      entityId: String(id),
      userId: actor?.id,
      createdBy: actorLabelOf(actor),
      newValue: { status: updated.STATUS, note: dto.note },
    });
    return {
      equipmentId: updated.EQUIPMENT_ID,
      name: updated.NAME,
      modality: updated.MODALITY,
      room: updated.LOCATION,
      status: updated.STATUS,
      usageHours: num(updated.USAGE_HOURS),
    };
  }

  async createEquipment(dto: CreateEquipmentDto, actor?: AuthUser) {
    const status = dto.status === 'InUse' ? 'In Use' : (dto.status ?? 'Available');
    const created = await this.prisma.radEquipment.create({
      data: {
        NAME: dto.name,
        MODALITY: dto.modality,
        LOCATION: dto.room ?? null,
        STATUS: status,
        USAGE_HOURS: dec(0),
      },
    });
    await this.audit.log({
      type: 'radiology-equipment:create',
      entity: 'rad-equipment',
      entityId: String(created.EQUIPMENT_ID),
      userId: actor?.id,
      createdBy: actorLabelOf(actor),
      newValue: { name: created.NAME, modality: created.MODALITY },
    });
    return {
      equipmentId: created.EQUIPMENT_ID,
      name: created.NAME,
      modality: created.MODALITY,
      room: created.LOCATION,
      status: created.STATUS,
      usageHours: num(created.USAGE_HOURS),
    };
  }

  async createConsumable(dto: CreateConsumableDto, actor?: AuthUser) {
    const created = await this.prisma.radConsumables.create({
      data: {
        NAME: dto.name,
        CATEGORY: dto.category,
        STOCK: dto.stock ?? 0,
        UNIT: dto.unit ?? 'unit',
        REORDER_LEVEL: dto.reorderLevel ?? 5,
      },
    });
    await this.audit.log({
      type: 'radiology-consumable:create',
      entity: 'rad-consumable',
      entityId: String(created.CONSUMABLE_ID),
      userId: actor?.id,
      createdBy: actorLabelOf(actor),
      newValue: { name: created.NAME, stock: created.STOCK },
    });
    return {
      consumableId: created.CONSUMABLE_ID,
      name: created.NAME,
      category: created.CATEGORY,
      stock: created.STOCK,
      unit: created.UNIT,
      reorderLevel: created.REORDER_LEVEL,
      lowStock: created.STOCK <= created.REORDER_LEVEL,
    };
  }

  async adjustConsumable(id: number, dto: AdjustConsumableDto, actor?: AuthUser) {
    const row = await this.prisma.radConsumables.findUnique({ where: { CONSUMABLE_ID: id } });
    if (!row) throw new NotFoundException('Consumable not found');
    const stock = Math.max(0, row.STOCK + dto.delta);
    const updated = await this.prisma.radConsumables.update({
      where: { CONSUMABLE_ID: id },
      data: { STOCK: stock, UPDATED_DATE: new Date() },
    });
    await this.audit.log({
      type: 'radiology-consumable:adjust',
      entity: 'rad-consumable',
      entityId: String(id),
      userId: actor?.id,
      createdBy: actorLabelOf(actor),
      newValue: { delta: dto.delta, stock, note: dto.note },
    });
    return {
      consumableId: updated.CONSUMABLE_ID,
      name: updated.NAME,
      category: updated.CATEGORY,
      stock: updated.STOCK,
      unit: updated.UNIT,
      reorderLevel: updated.REORDER_LEVEL,
      lowStock: updated.STOCK <= updated.REORDER_LEVEL,
    };
  }

  async listForms(params?: { personId?: number; formType?: string }) {
    const rows = await this.prisma.radFormInstances.findMany({
      where: {
        ...(params?.personId ? { PERSON_ID: params.personId } : {}),
        ...(params?.formType ? { FORM_TYPE: params.formType } : {}),
      },
      include: {
        person: {
          select: { PERSON_ID: true, HOSPITAL_NO: true, FIRST_NAME: true, LAST_NAME: true, MIDDLE_NAME: true },
        },
      },
      orderBy: { CREATED_DATE: 'desc' },
      take: 200,
    });
    return {
      items: rows.map((f) => ({
        formId: f.FORM_ID,
        formType: f.FORM_TYPE,
        personId: f.PERSON_ID,
        imagingRequestId: f.IMAGING_REQUEST_ID,
        valuesJson: f.VALUES_JSON,
        signedBy: f.SIGNED_BY,
        createdAt: f.CREATED_DATE.toISOString(),
        patientName: f.person
          ? [f.person.FIRST_NAME, f.person.MIDDLE_NAME, f.person.LAST_NAME].filter(Boolean).join(' ')
          : 'ΓÇö',
        hospitalNo: f.person?.HOSPITAL_NO ?? null,
      })),
    };
  }

  async createForm(dto: CreateRadFormDto, actor?: AuthUser) {
    const person = await this.prisma.persons.findUnique({ where: { PERSON_ID: dto.personId } });
    if (!person) throw new NotFoundException(`Person ${dto.personId} not found`);
    const row = await this.prisma.radFormInstances.create({
      data: {
        FORM_TYPE: dto.formType,
        PERSON_ID: dto.personId,
        IMAGING_REQUEST_ID: dto.imagingRequestId ?? null,
        VALUES_JSON: dto.valuesJson ?? '{}',
        SIGNED_BY: dto.signedBy ?? actorLabelOf(actor),
      },
    });
    await this.audit.log({
      type: 'radiology-form:create',
      entity: 'rad-form',
      entityId: String(row.FORM_ID),
      personId: dto.personId,
      userId: actor?.id,
      createdBy: actorLabelOf(actor),
      newValue: { formType: dto.formType },
    });
    return {
      formId: row.FORM_ID,
      formType: row.FORM_TYPE,
      personId: row.PERSON_ID,
      imagingRequestId: row.IMAGING_REQUEST_ID,
      valuesJson: row.VALUES_JSON,
      signedBy: row.SIGNED_BY,
      createdAt: row.CREATED_DATE.toISOString(),
    };
  }

  private async ensureEquipmentSeeded() {
    const n = await this.prisma.radEquipment.count();
    if (n > 0) return;
    await this.prisma.radEquipment.createMany({
      data: [
        { NAME: 'GE Revolution CT', MODALITY: 'CT Scan', LOCATION: 'CT-1', STATUS: 'Available' },
        { NAME: 'Siemens Magnetom MRI', MODALITY: 'MRI', LOCATION: 'MRI-1', STATUS: 'Available' },
        { NAME: 'Philips Digital X-Ray', MODALITY: 'X-Ray', LOCATION: 'XR-1', STATUS: 'Available' },
        { NAME: 'Mindray Ultrasound', MODALITY: 'Ultrasound', LOCATION: 'US-1', STATUS: 'Available' },
        { NAME: 'ECG Cart A', MODALITY: 'ECG', LOCATION: 'ECG-Bay', STATUS: 'Available' },
        { NAME: 'Nihon Kohden EEG', MODALITY: 'EEG', LOCATION: 'EEG-1', STATUS: 'Available' },
      ],
    });
  }

  private async ensureConsumablesSeeded() {
    const n = await this.prisma.radConsumables.count();
    if (n > 0) return;
    await this.prisma.radConsumables.createMany({
      data: [
        { NAME: 'IV Contrast (Iopamidol)', CATEGORY: 'Contrast', STOCK: 40, UNIT: 'vial', REORDER_LEVEL: 10 },
        { NAME: 'X-Ray Film 14x17', CATEGORY: 'Film', STOCK: 200, UNIT: 'sheet', REORDER_LEVEL: 50 },
        { NAME: 'ECG Electrodes', CATEGORY: 'ECG Electrode', STOCK: 500, UNIT: 'pack', REORDER_LEVEL: 100 },
        { NAME: 'Ultrasound Gel', CATEGORY: 'Ultrasound Gel', STOCK: 30, UNIT: 'bottle', REORDER_LEVEL: 8 },
      ],
    });
  }
}
