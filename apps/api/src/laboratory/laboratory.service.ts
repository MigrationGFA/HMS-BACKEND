import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NursingOpsService } from '../nursing/nursing-ops.service';
import type { AuthUser } from '../auth/types/auth-user.type';
import {
  ConfirmLabRequestPaymentDto,
  CreateLabRequestDto,
  CreateLabTestDto,
  UpdateLabTestDto,
} from './dto/lab.dto';

function actorLabel(actor?: AuthUser): string {
  if (!actor) return 'SYSTEM';
  const name = [actor.firstName, actor.lastName].filter(Boolean).join(' ');
  return name || actor.email || 'SYSTEM';
}

function pad(id: number): string {
  return String(id).padStart(4, '0');
}

const REQUEST_INCLUDE = {
  items: true,
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
  doctor: {
    select: {
      USER_ID: true,
      FIRST_NAME: true,
      LAST_NAME: true,
      USER_NAME: true,
    },
  },
} as const;

type RequestRow = Prisma.LabRequestsGetPayload<{ include: typeof REQUEST_INCLUDE }>;
type TestRow = Prisma.LabTestsGetPayload<object>;

export type LabTestResponse = {
  labTestId: number;
  testCode: string;
  name: string;
  category: string;
  specimenType: string;
  container: string | null;
  turnaround: string;
  unitPrice: number;
  loincCode: string | null;
  isPanel: boolean;
  status: string;
  createdAt: string | null;
  updatedAt: string | null;
};

export type LabRequestItemResponse = {
  itemId: number;
  labTestId: number;
  testCode: string;
  testName: string;
  category: string | null;
  specimenType: string | null;
  unitPrice: number;
  lineNotes: string | null;
};

export type LabRequestResponse = {
  labRequestId: number;
  requestNo: string;
  personId: number;
  encounterId: number | null;
  doctorId: number;
  priority: string;
  clinicalIndication: string | null;
  clinicalNotes: string | null;
  status: string;
  paymentStatus: string;
  paymentChannel: string | null;
  paymentRef: string | null;
  paidAt: string | null;
  paidBy: string | null;
  totalAmount: number;
  createdAt: string | null;
  updatedAt: string | null;
  doctorName: string | null;
  items: LabRequestItemResponse[];
  person: {
    personId: number;
    hospitalNo: string | null;
    firstName: string | null;
    lastName: string | null;
    middleName: string | null;
    sex: string | null;
    dateOfBirth: string | null;
    phone: string | null;
  } | null;
};

function toTestResponse(row: TestRow): LabTestResponse {
  return {
    labTestId: row.LAB_TEST_ID,
    testCode: row.TEST_CODE,
    name: row.NAME,
    category: row.CATEGORY,
    specimenType: row.SPECIMEN_TYPE,
    container: row.CONTAINER,
    turnaround: row.TURNAROUND,
    unitPrice: Number(row.UNIT_PRICE),
    loincCode: row.LOINC_CODE,
    isPanel: row.IS_PANEL,
    status: row.STATUS,
    createdAt: row.CREATED_DATE?.toISOString() ?? null,
    updatedAt: row.UPDATED_DATE?.toISOString() ?? null,
  };
}

function toRequestResponse(row: RequestRow): LabRequestResponse {
  const doctorName = row.doctor
    ? [row.doctor.FIRST_NAME, row.doctor.LAST_NAME].filter(Boolean).join(' ') ||
      row.doctor.USER_NAME
    : null;
  return {
    labRequestId: row.LAB_REQUEST_ID,
    requestNo: row.REQUEST_NO,
    personId: row.PERSON_ID,
    encounterId: row.ENCOUNTER_ID,
    doctorId: row.DOCTOR_ID,
    priority: row.PRIORITY,
    clinicalIndication: row.CLINICAL_INDICATION,
    clinicalNotes: row.CLINICAL_NOTES,
    status: row.STATUS,
    paymentStatus: row.PAYMENT_STATUS,
    paymentChannel: row.PAYMENT_CHANNEL,
    paymentRef: row.PAYMENT_REF,
    paidAt: row.PAID_AT?.toISOString() ?? null,
    paidBy: row.PAID_BY,
    totalAmount: Number(row.TOTAL_AMOUNT),
    createdAt: row.CREATED_DATE?.toISOString() ?? null,
    updatedAt: row.UPDATED_DATE?.toISOString() ?? null,
    doctorName,
    items: row.items.map((i) => ({
      itemId: i.ITEM_ID,
      labTestId: i.LAB_TEST_ID,
      testCode: i.TEST_CODE,
      testName: i.TEST_NAME,
      category: i.CATEGORY,
      specimenType: i.SPECIMEN_TYPE,
      unitPrice: Number(i.UNIT_PRICE),
      lineNotes: i.LINE_NOTES,
    })),
    person: row.person
      ? {
          personId: row.person.PERSON_ID,
          hospitalNo: row.person.HOSPITAL_NO,
          firstName: row.person.FIRST_NAME,
          lastName: row.person.LAST_NAME,
          middleName: row.person.MIDDLE_NAME,
          sex: row.person.SEX,
          dateOfBirth: row.person.DATE_OF_BIRTH?.toISOString() ?? null,
          phone: row.person.PATIENT_PHONE_NO,
        }
      : null,
  };
}

@Injectable()
export class LaboratoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly nursingOps: NursingOpsService,
  ) {}

  async createTest(
    dto: CreateLabTestDto,
    actor?: AuthUser,
  ): Promise<LabTestResponse> {
    const code = dto.testCode.trim().toUpperCase();
    const existing = await this.prisma.labTests.findUnique({
      where: { TEST_CODE: code },
    });
    if (existing) {
      throw new BadRequestException(`Test code already exists: ${code}`);
    }
    const now = new Date();
    const label = actorLabel(actor);
    const row = await this.prisma.labTests.create({
      data: {
        TEST_CODE: code,
        NAME: dto.name.trim(),
        CATEGORY: dto.category.trim(),
        SPECIMEN_TYPE: dto.specimenType.trim(),
        CONTAINER: dto.container?.trim() ?? null,
        TURNAROUND: dto.turnaround.trim(),
        UNIT_PRICE: dto.unitPrice,
        LOINC_CODE: dto.loincCode?.trim() ?? null,
        IS_PANEL: dto.isPanel ?? false,
        STATUS: dto.status ?? 'Active',
        CREATED_BY_ID: actor?.id ?? null,
        CREATED_BY: label,
        CREATED_DATE: now,
      },
    });
    const response = toTestResponse(row);
    await this.audit.log({
      type: 'lab:test-create',
      entity: 'lab_tests',
      entityId: row.LAB_TEST_ID,
      userId: actor?.id,
      createdBy: label,
      item: `Lab test created: ${response.testCode}`,
      newValue: response,
    });
    return response;
  }

  async listTests(params: {
    q?: string;
    category?: string;
    status?: string;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(200, Math.max(1, params.limit ?? 100));
    const where: Prisma.LabTestsWhereInput = {};
    if (params.status) where.STATUS = params.status;
    else where.STATUS = 'Active';
    if (params.category && params.category !== 'All') {
      where.CATEGORY = params.category;
    }
    if (params.q?.trim()) {
      const q = params.q.trim();
      where.OR = [
        { NAME: { contains: q, mode: 'insensitive' } },
        { TEST_CODE: { contains: q, mode: 'insensitive' } },
        { CATEGORY: { contains: q, mode: 'insensitive' } },
      ];
    }
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.labTests.count({ where }),
      this.prisma.labTests.findMany({
        where,
        orderBy: [{ CATEGORY: 'asc' }, { NAME: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);
    return {
      items: rows.map(toTestResponse),
      meta: { page, limit, total },
    };
  }

  async findTestById(id: number): Promise<LabTestResponse> {
    const row = await this.prisma.labTests.findUnique({
      where: { LAB_TEST_ID: id },
    });
    if (!row) throw new NotFoundException('Lab test not found');
    return toTestResponse(row);
  }

  async updateTest(
    id: number,
    dto: UpdateLabTestDto,
    actor?: AuthUser,
  ): Promise<LabTestResponse> {
    const existing = await this.prisma.labTests.findUnique({
      where: { LAB_TEST_ID: id },
    });
    if (!existing) throw new NotFoundException('Lab test not found');
    const now = new Date();
    const label = actorLabel(actor);
    const row = await this.prisma.labTests.update({
      where: { LAB_TEST_ID: id },
      data: {
        ...(dto.name != null ? { NAME: dto.name.trim() } : {}),
        ...(dto.category != null ? { CATEGORY: dto.category.trim() } : {}),
        ...(dto.specimenType != null
          ? { SPECIMEN_TYPE: dto.specimenType.trim() }
          : {}),
        ...(dto.container !== undefined
          ? { CONTAINER: dto.container?.trim() ?? null }
          : {}),
        ...(dto.turnaround != null ? { TURNAROUND: dto.turnaround.trim() } : {}),
        ...(dto.unitPrice != null ? { UNIT_PRICE: dto.unitPrice } : {}),
        ...(dto.loincCode !== undefined
          ? { LOINC_CODE: dto.loincCode?.trim() ?? null }
          : {}),
        ...(dto.isPanel != null ? { IS_PANEL: dto.isPanel } : {}),
        ...(dto.status != null ? { STATUS: dto.status } : {}),
        UPDATED_BY_ID: actor?.id ?? null,
        UPDATED_BY: label,
        UPDATED_DATE: now,
      },
    });
    const response = toTestResponse(row);
    await this.audit.log({
      type: 'lab:test-update',
      entity: 'lab_tests',
      entityId: id,
      userId: actor?.id,
      createdBy: label,
      item: `Lab test updated: ${response.testCode}`,
      oldValue: toTestResponse(existing),
      newValue: response,
    });
    return response;
  }

  async createRequest(
    dto: CreateLabRequestDto,
    actor?: AuthUser,
  ): Promise<LabRequestResponse> {
    if (!actor?.id) {
      throw new BadRequestException('Authenticated doctor required');
    }
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
        throw new BadRequestException(
          'Encounter does not belong to this patient',
        );
      }
    }

    const testIds = [...new Set(dto.items.map((i) => i.testId))];
    const tests = await this.prisma.labTests.findMany({
      where: { LAB_TEST_ID: { in: testIds }, STATUS: 'Active' },
    });
    const testMap = new Map(tests.map((t) => [t.LAB_TEST_ID, t]));
    const missing = testIds.filter((id) => !testMap.has(id));
    if (missing.length > 0) {
      throw new BadRequestException(
        `Unknown or inactive lab test id(s): ${missing.join(', ')}`,
      );
    }

    const now = new Date();
    const year = now.getFullYear();
    const label = actorLabel(actor);
    let total = 0;
    const itemCreates = dto.items.map((item) => {
      const test = testMap.get(item.testId)!;
      const price = Number(test.UNIT_PRICE);
      total += price;
      return {
        LAB_TEST_ID: test.LAB_TEST_ID,
        TEST_CODE: test.TEST_CODE,
        TEST_NAME: test.NAME,
        CATEGORY: test.CATEGORY,
        SPECIMEN_TYPE: test.SPECIMEN_TYPE,
        UNIT_PRICE: test.UNIT_PRICE,
        LINE_NOTES: item.lineNotes?.trim() ?? null,
      };
    });

    const created = await this.prisma.$transaction(async (tx) => {
      const row = await tx.labRequests.create({
        data: {
          REQUEST_NO: `LR-${year}-PENDING`,
          PERSON_ID: dto.personId,
          ENCOUNTER_ID: dto.encounterId ?? null,
          DOCTOR_ID: actor.id,
          PRIORITY: dto.priority ?? 'Routine',
          CLINICAL_INDICATION: dto.clinicalIndication?.trim() ?? null,
          CLINICAL_NOTES: dto.clinicalNotes?.trim() ?? null,
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

      return tx.labRequests.update({
        where: { LAB_REQUEST_ID: row.LAB_REQUEST_ID },
        data: { REQUEST_NO: `LR-${year}-${pad(row.LAB_REQUEST_ID)}` },
        include: REQUEST_INCLUDE,
      });
    });

    const response = toRequestResponse(created);
    await this.audit.log({
      type: 'lab:request-create',
      entity: 'lab_requests',
      entityId: created.LAB_REQUEST_ID,
      personId: dto.personId,
      userId: actor.id,
      createdBy: label,
      item: `Lab request sent: ${response.requestNo}`,
      newValue: response,
    });
    return response;
  }

  async listRequests(params: {
    personId?: number;
    encounterId?: number;
    status?: string;
    paymentStatus?: string;
    q?: string;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(100, Math.max(1, params.limit ?? 50));
    const where: Prisma.LabRequestsWhereInput = {};
    if (params.personId) where.PERSON_ID = params.personId;
    if (params.encounterId) where.ENCOUNTER_ID = params.encounterId;
    if (params.status) where.STATUS = params.status;
    if (params.paymentStatus) {
      const parts = params.paymentStatus
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      where.PAYMENT_STATUS =
        parts.length > 1 ? { in: parts } : parts[0];
    }
    if (params.q?.trim()) {
      const q = params.q.trim();
      where.OR = [
        { REQUEST_NO: { contains: q, mode: 'insensitive' } },
        {
          person: {
            OR: [
              { FIRST_NAME: { contains: q, mode: 'insensitive' } },
              { LAST_NAME: { contains: q, mode: 'insensitive' } },
              { HOSPITAL_NO: { contains: q, mode: 'insensitive' } },
            ],
          },
        },
      ];
    }

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.labRequests.count({ where }),
      this.prisma.labRequests.findMany({
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

  async findRequestById(id: number): Promise<LabRequestResponse> {
    const row = await this.prisma.labRequests.findUnique({
      where: { LAB_REQUEST_ID: id },
      include: REQUEST_INCLUDE,
    });
    if (!row) throw new NotFoundException('Lab request not found');
    return toRequestResponse(row);
  }

  async cancelRequest(
    id: number,
    actor?: AuthUser,
  ): Promise<LabRequestResponse> {
    const existing = await this.prisma.labRequests.findUnique({
      where: { LAB_REQUEST_ID: id },
      include: REQUEST_INCLUDE,
    });
    if (!existing) throw new NotFoundException('Lab request not found');
    if (existing.STATUS === 'Cancelled') {
      throw new BadRequestException('Lab request already cancelled');
    }
    if (existing.PAYMENT_STATUS === 'Paid') {
      throw new BadRequestException('Cannot cancel a paid lab request');
    }
    const now = new Date();
    const label = actorLabel(actor);
    const row = await this.prisma.labRequests.update({
      where: { LAB_REQUEST_ID: id },
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
      type: 'lab:request-cancel',
      entity: 'lab_requests',
      entityId: id,
      personId: existing.PERSON_ID,
      userId: actor?.id,
      createdBy: label,
      item: `Lab request cancelled: ${response.requestNo}`,
      oldValue: toRequestResponse(existing),
      newValue: response,
    });
    return response;
  }

  async confirmPayment(
    id: number,
    dto: ConfirmLabRequestPaymentDto,
    actor?: AuthUser,
  ): Promise<LabRequestResponse> {
    const existing = await this.prisma.labRequests.findUnique({
      where: { LAB_REQUEST_ID: id },
      include: REQUEST_INCLUDE,
    });
    if (!existing) throw new NotFoundException('Lab request not found');
    if (existing.STATUS === 'Cancelled') {
      throw new BadRequestException('Cannot pay a cancelled lab request');
    }
    if (existing.PAYMENT_STATUS === 'Paid') {
      throw new BadRequestException('Lab request already paid');
    }
    if (existing.PAYMENT_STATUS === 'Waived') {
      throw new BadRequestException('Lab request payment was waived');
    }
    const now = new Date();
    const label = actorLabel(actor);
    const row = await this.prisma.labRequests.update({
      where: { LAB_REQUEST_ID: id },
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
      type: 'lab:pay',
      entity: 'lab_requests',
      entityId: id,
      personId: existing.PERSON_ID,
      userId: actor?.id,
      createdBy: label,
      item: `Lab request paid: ${response.requestNo}`,
      oldValue: { paymentStatus: existing.PAYMENT_STATUS },
      newValue: response,
    });
    return response;
  }

  /**
   * Nursing sample bridge — ward sample collection still lives on nursing orders
   * until dedicated lab sample tables exist.
   */
  listSamples(params?: { personId?: number; admissionId?: number }) {
    return this.nursingOps.listSamples(params);
  }

  collectSample(orderId: number, actor?: AuthUser) {
    return this.nursingOps.collectSample(orderId, actor);
  }
}
