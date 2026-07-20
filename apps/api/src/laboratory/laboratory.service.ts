import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../auth/types/auth-user.type';
import { ROLES } from '../common/constants/roles.constants';
import {
  AmendLabResultDto,
  ConfirmLabRequestPaymentDto,
  CreateLabRequestDto,
  CreateLabTemplateDto,
  CreateLabTestDto,
  RejectLabSampleDto,
  ReturnLabResultDto,
  SaveLabResultsDto,
  UpdateLabTemplateDto,
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

/** Roles that may list unpaid lab requests (billing / clinical / admin). */
const UNRESTRICTED_LAB_LIST_ROLES = new Set<string>([
  ROLES.SUPER_ADMIN,
  ROLES.ADMIN,
  ROLES.CMD,
  ROLES.IT,
  ROLES.CASHIER,
  ROLES.FINANCE,
  ROLES.DOCTOR,
  ROLES.NURSE,
  ROLES.PSYCHIATRIC_OPC,
  ROLES.ICU,
]);

function isLabWorkQueueOnly(actor?: AuthUser): boolean {
  if (!actor?.roles?.length) return false;
  const hasUnrestricted = actor.roles.some((r) =>
    UNRESTRICTED_LAB_LIST_ROLES.has(r),
  );
  if (hasUnrestricted) return false;
  return actor.roles.includes(ROLES.LAB);
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
  source: string;
  priority: string;
  clinicalIndication: string | null;
  clinicalNotes: string | null;
  status: string;
  /** LIS workflow: AwaitingCollection | Collected | ResultDraft | AwaitingValidation | Validated | PendingRevalidation */
  labStatus: string;
  paymentStatus: string;
  paymentChannel: string | null;
  paymentRef: string | null;
  paidAt: string | null;
  paidBy: string | null;
  totalAmount: number;
  /** True when Paid or Waived — sample/result processing allowed. */
  paymentCleared: boolean;
  /** True for LAB (and clients) when unpaid — full clinical detail withheld. */
  processingLocked: boolean;
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

function isPaymentCleared(paymentStatus: string): boolean {
  return paymentStatus === 'Paid' || paymentStatus === 'Waived';
}

/** Strip clinical detail for unpaid requests shown to LAB role. */
function redactUnpaidForLab(res: LabRequestResponse): LabRequestResponse {
  return {
    ...res,
    clinicalIndication: null,
    clinicalNotes: null,
    paymentChannel: null,
    paymentRef: null,
    paidAt: null,
    paidBy: null,
    totalAmount: 0,
    processingLocked: true,
    paymentCleared: false,
    items: res.items.map((i) => ({
      ...i,
      unitPrice: 0,
      lineNotes: null,
    })),
    person: res.person
      ? {
          ...res.person,
          phone: null,
          dateOfBirth: null,
        }
      : null,
  };
}

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
  const paymentCleared = isPaymentCleared(row.PAYMENT_STATUS);
  return {
    labRequestId: row.LAB_REQUEST_ID,
    requestNo: row.REQUEST_NO,
    personId: row.PERSON_ID,
    encounterId: row.ENCOUNTER_ID,
    doctorId: row.DOCTOR_ID,
    source: row.SOURCE,
    priority: row.PRIORITY,
    clinicalIndication: row.CLINICAL_INDICATION,
    clinicalNotes: row.CLINICAL_NOTES,
    status: row.STATUS,
    labStatus: row.LAB_STATUS,
    paymentStatus: row.PAYMENT_STATUS,
    paymentChannel: row.PAYMENT_CHANNEL,
    paymentRef: row.PAYMENT_REF,
    paidAt: row.PAID_AT?.toISOString() ?? null,
    paidBy: row.PAID_BY,
    totalAmount: Number(row.TOTAL_AMOUNT),
    paymentCleared,
    processingLocked: !paymentCleared,
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

function toRequestResponseForActor(
  row: RequestRow,
  actor?: AuthUser,
): LabRequestResponse {
  const res = toRequestResponse(row);
  if (isLabWorkQueueOnly(actor) && !res.paymentCleared) {
    return redactUnpaidForLab(res);
  }
  return res;
}

// ---------------------------------------------------------------------------
// Result templates
// ---------------------------------------------------------------------------

type TemplateRow = Prisma.LabResultTemplatesGetPayload<object>;

export type LabTemplateResponse = {
  templateId: number;
  code: string;
  name: string;
  category: string;
  description: string | null;
  fields: unknown;
  status: string;
  createdBy: string | null;
  createdAt: string | null;
  updatedBy: string | null;
  updatedAt: string | null;
};

function toTemplateResponse(row: TemplateRow): LabTemplateResponse {
  return {
    templateId: row.TEMPLATE_ID,
    code: row.CODE,
    name: row.NAME,
    category: row.CATEGORY,
    description: row.DESCRIPTION,
    fields: row.FIELDS,
    status: row.STATUS,
    createdBy: row.CREATED_BY,
    createdAt: row.CREATED_DATE?.toISOString() ?? null,
    updatedBy: row.UPDATED_BY,
    updatedAt: row.UPDATED_DATE?.toISOString() ?? null,
  };
}

function slugTemplateCode(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 40);
  return `tpl-${slug || Date.now()}`;
}

function assertUniqueFieldKeys(fields: { key: string }[]): void {
  const seen = new Set<string>();
  for (const f of fields) {
    const key = f.key.trim();
    if (!key) throw new BadRequestException('Template field key is required');
    if (seen.has(key)) {
      throw new BadRequestException(`Duplicate template field key: ${key}`);
    }
    seen.add(key);
  }
}

// ---------------------------------------------------------------------------
// Samples + results
// ---------------------------------------------------------------------------

const SAMPLE_INCLUDE = {
  request: {
    select: {
      REQUEST_NO: true,
      PRIORITY: true,
      LAB_STATUS: true,
      PERSON_ID: true,
      person: {
        select: {
          PERSON_ID: true,
          HOSPITAL_NO: true,
          FIRST_NAME: true,
          LAST_NAME: true,
        },
      },
    },
  },
} as const;

type LabSampleRow = Prisma.LabSamplesGetPayload<{
  include: typeof SAMPLE_INCLUDE;
}>;

export type LabSampleResponse = {
  sampleId: number;
  sampleNo: string;
  labRequestId: number;
  specimenType: string;
  container: string | null;
  status: string;
  collectedBy: string | null;
  collectedAt: string | null;
  rejectReason: string | null;
  createdAt: string | null;
  requestNo: string | null;
  priority: string | null;
  labStatus: string | null;
  personId: number | null;
  personName: string | null;
  hospitalNo: string | null;
};

function toSampleResponse(row: LabSampleRow): LabSampleResponse {
  const person = row.request?.person;
  return {
    sampleId: row.SAMPLE_ID,
    sampleNo: row.SAMPLE_NO,
    labRequestId: row.LAB_REQUEST_ID,
    specimenType: row.SPECIMEN_TYPE,
    container: row.CONTAINER,
    status: row.STATUS,
    collectedBy: row.COLLECTED_BY,
    collectedAt: row.COLLECTED_AT?.toISOString() ?? null,
    rejectReason: row.REJECT_REASON,
    createdAt: row.CREATED_DATE?.toISOString() ?? null,
    requestNo: row.request?.REQUEST_NO ?? null,
    priority: row.request?.PRIORITY ?? null,
    labStatus: row.request?.LAB_STATUS ?? null,
    personId: person?.PERSON_ID ?? null,
    personName: person
      ? [person.FIRST_NAME, person.LAST_NAME].filter(Boolean).join(' ') || null
      : null,
    hospitalNo: person?.HOSPITAL_NO ?? null,
  };
}

const RESULT_INCLUDE = {
  item: {
    select: {
      ITEM_ID: true,
      TEST_CODE: true,
      TEST_NAME: true,
      CATEGORY: true,
      SPECIMEN_TYPE: true,
    },
  },
  template: {
    select: { TEMPLATE_ID: true, CODE: true, NAME: true, FIELDS: true },
  },
  request: {
    select: {
      REQUEST_NO: true,
      PRIORITY: true,
      LAB_STATUS: true,
      PERSON_ID: true,
      person: {
        select: {
          PERSON_ID: true,
          HOSPITAL_NO: true,
          FIRST_NAME: true,
          LAST_NAME: true,
          SEX: true,
        },
      },
    },
  },
} as const;

type LabResultRow = Prisma.LabResultsGetPayload<{
  include: typeof RESULT_INCLUDE;
}>;

export type LabResultResponse = {
  labResultId: number;
  labRequestId: number;
  requestItemId: number;
  templateId: number | null;
  templateCode: string | null;
  templateName: string | null;
  templateFields: unknown;
  values: unknown;
  comment: string | null;
  status: string;
  enteredBy: string | null;
  enteredAt: string | null;
  validatedBy: string | null;
  validatedAt: string | null;
  returnReason: string | null;
  version: number;
  testCode: string | null;
  testName: string | null;
  category: string | null;
  specimenType: string | null;
  requestNo: string | null;
  priority: string | null;
  labStatus: string | null;
  personId: number | null;
  personName: string | null;
  hospitalNo: string | null;
  sex: string | null;
};

function toResultResponse(row: LabResultRow): LabResultResponse {
  const person = row.request?.person;
  return {
    labResultId: row.LAB_RESULT_ID,
    labRequestId: row.LAB_REQUEST_ID,
    requestItemId: row.LAB_REQUEST_ITEM_ID,
    templateId: row.TEMPLATE_ID,
    templateCode: row.template?.CODE ?? null,
    templateName: row.template?.NAME ?? null,
    templateFields: row.template?.FIELDS ?? null,
    values: row.VALUES,
    comment: row.COMMENT,
    status: row.STATUS,
    enteredBy: row.ENTERED_BY,
    enteredAt: row.ENTERED_AT?.toISOString() ?? null,
    validatedBy: row.VALIDATED_BY,
    validatedAt: row.VALIDATED_AT?.toISOString() ?? null,
    returnReason: row.RETURN_REASON,
    version: row.VERSION,
    testCode: row.item?.TEST_CODE ?? null,
    testName: row.item?.TEST_NAME ?? null,
    category: row.item?.CATEGORY ?? null,
    specimenType: row.item?.SPECIMEN_TYPE ?? null,
    requestNo: row.request?.REQUEST_NO ?? null,
    priority: row.request?.PRIORITY ?? null,
    labStatus: row.request?.LAB_STATUS ?? null,
    personId: person?.PERSON_ID ?? null,
    personName: person
      ? [person.FIRST_NAME, person.LAST_NAME].filter(Boolean).join(' ') || null
      : null,
    hospitalNo: person?.HOSPITAL_NO ?? null,
    sex: person?.SEX ?? null,
  };
}

@Injectable()
export class LaboratoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
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
      throw new BadRequestException('Authenticated user required');
    }
    const source = dto.source === 'WalkIn' ? 'WalkIn' : 'Doctor';
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
          SOURCE: source,
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
      item: `Lab request sent (${source}): ${response.requestNo}`,
      newValue: response,
    });
    return response;
  }

  async listRequests(
    params: {
      personId?: number;
      encounterId?: number;
      status?: string;
      labStatus?: string;
      paymentStatus?: string;
      source?: string;
      workQueue?: boolean;
      q?: string;
      page?: number;
      limit?: number;
    },
    actor?: AuthUser,
  ) {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(100, Math.max(1, params.limit ?? 50));
    const where: Prisma.LabRequestsWhereInput = {};
    if (params.personId) where.PERSON_ID = params.personId;
    if (params.encounterId) where.ENCOUNTER_ID = params.encounterId;
    if (params.source) where.SOURCE = params.source;
    if (params.labStatus) {
      const parts = params.labStatus
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      where.LAB_STATUS = parts.length > 1 ? { in: parts } : parts[0];
    }

    const workQueueOnly = params.workQueue === true;
    if (workQueueOnly) {
      where.PAYMENT_STATUS = { in: ['Paid', 'Waived'] };
      where.STATUS = params.status ?? 'Sent';
    } else {
      if (params.status) where.STATUS = params.status;
      if (params.paymentStatus) {
        const parts = params.paymentStatus
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        where.PAYMENT_STATUS =
          parts.length > 1 ? { in: parts } : parts[0];
      }
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
      items: rows.map((row) => toRequestResponseForActor(row, actor)),
      meta: { page, limit, total },
    };
  }

  async findRequestById(
    id: number,
    actor?: AuthUser,
  ): Promise<LabRequestResponse> {
    const row = await this.prisma.labRequests.findUnique({
      where: { LAB_REQUEST_ID: id },
      include: REQUEST_INCLUDE,
    });
    if (!row) throw new NotFoundException('Lab request not found');
    return toRequestResponseForActor(row, actor);
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

  // -------------------------------------------------------------------------
  // Result templates (LAB_RESULT_TEMPLATES)
  // -------------------------------------------------------------------------

  async listTemplates(params: {
    q?: string;
    category?: string;
    status?: string;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(200, Math.max(1, params.limit ?? 100));
    const where: Prisma.LabResultTemplatesWhereInput = {};
    if (params.status && params.status !== 'All') where.STATUS = params.status;
    if (params.category && params.category !== 'All') {
      where.CATEGORY = params.category;
    }
    if (params.q?.trim()) {
      const q = params.q.trim();
      where.OR = [
        { NAME: { contains: q, mode: 'insensitive' } },
        { CODE: { contains: q, mode: 'insensitive' } },
        { CATEGORY: { contains: q, mode: 'insensitive' } },
      ];
    }
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.labResultTemplates.count({ where }),
      this.prisma.labResultTemplates.findMany({
        where,
        orderBy: [{ CATEGORY: 'asc' }, { NAME: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);
    return {
      items: rows.map(toTemplateResponse),
      meta: { page, limit, total },
    };
  }

  async findTemplateById(id: number): Promise<LabTemplateResponse> {
    const row = await this.prisma.labResultTemplates.findUnique({
      where: { TEMPLATE_ID: id },
    });
    if (!row) throw new NotFoundException('Lab result template not found');
    return toTemplateResponse(row);
  }

  async createTemplate(
    dto: CreateLabTemplateDto,
    actor?: AuthUser,
  ): Promise<LabTemplateResponse> {
    const code = (dto.code?.trim() || slugTemplateCode(dto.name)).toLowerCase();
    const existing = await this.prisma.labResultTemplates.findUnique({
      where: { CODE: code },
    });
    if (existing) {
      throw new BadRequestException(`Template code already exists: ${code}`);
    }
    assertUniqueFieldKeys(dto.fields);
    const now = new Date();
    const label = actorLabel(actor);
    const row = await this.prisma.labResultTemplates.create({
      data: {
        CODE: code,
        NAME: dto.name.trim(),
        CATEGORY: dto.category.trim(),
        DESCRIPTION: dto.description?.trim() ?? null,
        FIELDS: dto.fields as unknown as Prisma.InputJsonValue,
        STATUS: dto.status ?? 'Active',
        CREATED_BY_ID: actor?.id ?? null,
        CREATED_BY: label,
        CREATED_DATE: now,
      },
    });
    const response = toTemplateResponse(row);
    await this.audit.log({
      type: 'lab:template-create',
      entity: 'lab_result_templates',
      entityId: row.TEMPLATE_ID,
      userId: actor?.id,
      createdBy: label,
      item: `Lab result template created: ${response.name}`,
      newValue: response,
    });
    return response;
  }

  async updateTemplate(
    id: number,
    dto: UpdateLabTemplateDto,
    actor?: AuthUser,
  ): Promise<LabTemplateResponse> {
    const existing = await this.prisma.labResultTemplates.findUnique({
      where: { TEMPLATE_ID: id },
    });
    if (!existing) throw new NotFoundException('Lab result template not found');
    if (dto.fields) assertUniqueFieldKeys(dto.fields);
    const now = new Date();
    const label = actorLabel(actor);
    const row = await this.prisma.labResultTemplates.update({
      where: { TEMPLATE_ID: id },
      data: {
        ...(dto.name != null ? { NAME: dto.name.trim() } : {}),
        ...(dto.category != null ? { CATEGORY: dto.category.trim() } : {}),
        ...(dto.description !== undefined
          ? { DESCRIPTION: dto.description?.trim() ?? null }
          : {}),
        ...(dto.fields != null
          ? { FIELDS: dto.fields as unknown as Prisma.InputJsonValue }
          : {}),
        ...(dto.status != null ? { STATUS: dto.status } : {}),
        UPDATED_BY_ID: actor?.id ?? null,
        UPDATED_BY: label,
        UPDATED_DATE: now,
      },
    });
    const response = toTemplateResponse(row);
    await this.audit.log({
      type: 'lab:template-update',
      entity: 'lab_result_templates',
      entityId: id,
      userId: actor?.id,
      createdBy: label,
      item: `Lab result template updated: ${response.name}`,
      oldValue: toTemplateResponse(existing),
      newValue: response,
    });
    return response;
  }

  // -------------------------------------------------------------------------
  // Sample collection (LAB_SAMPLES)
  // -------------------------------------------------------------------------

  async collectRequestSamples(
    requestId: number,
    actor?: AuthUser,
  ): Promise<{ request: LabRequestResponse; samples: LabSampleResponse[] }> {
    const request = await this.prisma.labRequests.findUnique({
      where: { LAB_REQUEST_ID: requestId },
      include: REQUEST_INCLUDE,
    });
    if (!request) throw new NotFoundException('Lab request not found');
    if (request.STATUS === 'Cancelled') {
      throw new BadRequestException('Lab request is cancelled');
    }
    if (!isPaymentCleared(request.PAYMENT_STATUS)) {
      throw new BadRequestException(
        'Payment has not been cleared for this lab request',
      );
    }
    if (request.LAB_STATUS !== 'AwaitingCollection') {
      throw new BadRequestException(
        `Samples already collected (status: ${request.LAB_STATUS})`,
      );
    }

    const specimenTypes = [
      ...new Set(
        request.items.map((i) => i.SPECIMEN_TYPE?.trim() || 'Specimen'),
      ),
    ];
    const now = new Date();
    const year = now.getFullYear();
    const label = actorLabel(actor);

    const { samples, updated } = await this.prisma.$transaction(async (tx) => {
      const created: LabSampleRow[] = [];
      for (const specimenType of specimenTypes) {
        const row = await tx.labSamples.create({
          data: {
            SAMPLE_NO: `SMP-${year}-P${requestId}-${created.length}`,
            LAB_REQUEST_ID: requestId,
            SPECIMEN_TYPE: specimenType,
            STATUS: 'Collected',
            COLLECTED_BY: label,
            COLLECTED_AT: now,
            CREATED_BY_ID: actor?.id ?? null,
            CREATED_BY: label,
            CREATED_DATE: now,
          },
        });
        const withNo = await tx.labSamples.update({
          where: { SAMPLE_ID: row.SAMPLE_ID },
          data: { SAMPLE_NO: `SMP-${year}-${pad(row.SAMPLE_ID)}` },
          include: SAMPLE_INCLUDE,
        });
        created.push(withNo);
      }
      const updatedRequest = await tx.labRequests.update({
        where: { LAB_REQUEST_ID: requestId },
        data: {
          LAB_STATUS: 'Collected',
          UPDATED_BY_ID: actor?.id ?? null,
          UPDATED_BY: label,
          UPDATED_DATE: now,
        },
        include: REQUEST_INCLUDE,
      });
      return { samples: created, updated: updatedRequest };
    });

    const sampleResponses = samples.map(toSampleResponse);
    await this.audit.log({
      type: 'lab:sample-collect',
      entity: 'lab_requests',
      entityId: requestId,
      personId: request.PERSON_ID,
      userId: actor?.id,
      createdBy: label,
      item: `Samples collected for ${request.REQUEST_NO}: ${sampleResponses
        .map((s) => s.sampleNo)
        .join(', ')}`,
      newValue: sampleResponses,
    });
    return { request: toRequestResponse(updated), samples: sampleResponses };
  }

  async listLabSamples(params: {
    status?: string;
    requestId?: number;
    q?: string;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(100, Math.max(1, params.limit ?? 50));
    const where: Prisma.LabSamplesWhereInput = {};
    if (params.status) where.STATUS = params.status;
    if (params.requestId) where.LAB_REQUEST_ID = params.requestId;
    if (params.q?.trim()) {
      const q = params.q.trim();
      where.OR = [
        { SAMPLE_NO: { contains: q, mode: 'insensitive' } },
        { request: { REQUEST_NO: { contains: q, mode: 'insensitive' } } },
        {
          request: {
            person: {
              OR: [
                { FIRST_NAME: { contains: q, mode: 'insensitive' } },
                { LAST_NAME: { contains: q, mode: 'insensitive' } },
                { HOSPITAL_NO: { contains: q, mode: 'insensitive' } },
              ],
            },
          },
        },
      ];
    }
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.labSamples.count({ where }),
      this.prisma.labSamples.findMany({
        where,
        include: SAMPLE_INCLUDE,
        orderBy: { CREATED_DATE: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);
    return {
      items: rows.map(toSampleResponse),
      meta: { page, limit, total },
    };
  }

  async rejectSample(
    sampleId: number,
    dto: RejectLabSampleDto,
    actor?: AuthUser,
  ): Promise<LabSampleResponse> {
    const existing = await this.prisma.labSamples.findUnique({
      where: { SAMPLE_ID: sampleId },
      include: SAMPLE_INCLUDE,
    });
    if (!existing) throw new NotFoundException('Lab sample not found');
    if (existing.STATUS === 'Rejected') {
      throw new BadRequestException('Sample already rejected');
    }
    const request = await this.prisma.labRequests.findUnique({
      where: { LAB_REQUEST_ID: existing.LAB_REQUEST_ID },
      select: { LAB_STATUS: true, REQUEST_NO: true, PERSON_ID: true },
    });
    if (request && ['AwaitingValidation', 'Validated', 'PendingRevalidation'].includes(request.LAB_STATUS)) {
      throw new BadRequestException(
        'Cannot reject a sample after results have been submitted',
      );
    }
    const now = new Date();
    const label = actorLabel(actor);
    const row = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.labSamples.update({
        where: { SAMPLE_ID: sampleId },
        data: {
          STATUS: 'Rejected',
          REJECT_REASON: dto.reason.trim(),
          UPDATED_BY_ID: actor?.id ?? null,
          UPDATED_BY: label,
          UPDATED_DATE: now,
        },
        include: SAMPLE_INCLUDE,
      });
      // Request goes back to collection so a fresh specimen can be drawn.
      await tx.labRequests.update({
        where: { LAB_REQUEST_ID: existing.LAB_REQUEST_ID },
        data: {
          LAB_STATUS: 'AwaitingCollection',
          UPDATED_BY_ID: actor?.id ?? null,
          UPDATED_BY: label,
          UPDATED_DATE: now,
        },
      });
      return updated;
    });
    const response = toSampleResponse(row);
    await this.audit.log({
      type: 'lab:sample-reject',
      entity: 'lab_samples',
      entityId: sampleId,
      personId: request?.PERSON_ID,
      userId: actor?.id,
      createdBy: label,
      item: `Sample rejected: ${response.sampleNo} — ${dto.reason.trim()}`,
      oldValue: toSampleResponse(existing),
      newValue: response,
    });
    return response;
  }

  // -------------------------------------------------------------------------
  // Result entry (LAB_RESULTS + LAB_RESULT_VERSIONS)
  // -------------------------------------------------------------------------

  async saveResults(
    requestId: number,
    dto: SaveLabResultsDto,
    actor?: AuthUser,
  ): Promise<{ request: LabRequestResponse; results: LabResultResponse[] }> {
    const request = await this.prisma.labRequests.findUnique({
      where: { LAB_REQUEST_ID: requestId },
      include: REQUEST_INCLUDE,
    });
    if (!request) throw new NotFoundException('Lab request not found');
    if (request.STATUS === 'Cancelled') {
      throw new BadRequestException('Lab request is cancelled');
    }
    if (!isPaymentCleared(request.PAYMENT_STATUS)) {
      throw new BadRequestException(
        'Payment has not been cleared for this lab request',
      );
    }
    if (!['Collected', 'ResultDraft'].includes(request.LAB_STATUS)) {
      throw new BadRequestException(
        `Results cannot be entered while request is ${request.LAB_STATUS}`,
      );
    }

    const itemIds = new Set(request.items.map((i) => i.ITEM_ID));
    for (const item of dto.items) {
      if (!itemIds.has(item.requestItemId)) {
        throw new BadRequestException(
          `Request item ${item.requestItemId} does not belong to this lab request`,
        );
      }
    }

    const templateIds = [
      ...new Set(dto.items.map((i) => i.templateId).filter(Boolean)),
    ] as number[];
    if (templateIds.length > 0) {
      const found = await this.prisma.labResultTemplates.findMany({
        where: { TEMPLATE_ID: { in: templateIds } },
        select: { TEMPLATE_ID: true },
      });
      const foundSet = new Set(found.map((t) => t.TEMPLATE_ID));
      const missing = templateIds.filter((id) => !foundSet.has(id));
      if (missing.length > 0) {
        throw new BadRequestException(
          `Unknown template id(s): ${missing.join(', ')}`,
        );
      }
    }

    const submit = dto.action === 'submit';
    const now = new Date();
    const label = actorLabel(actor);

    const { rows, updated } = await this.prisma.$transaction(async (tx) => {
      const saved: LabResultRow[] = [];
      for (const item of dto.items) {
        const existing = await tx.labResults.findUnique({
          where: { LAB_REQUEST_ITEM_ID: item.requestItemId },
        });
        if (
          existing &&
          ['Validated', 'PendingRevalidation'].includes(existing.STATUS)
        ) {
          throw new BadRequestException(
            'Validated results can only be changed through amendment',
          );
        }
        const status = submit ? 'Submitted' : 'Draft';
        const values = item.values as Prisma.InputJsonValue;
        const row = existing
          ? await tx.labResults.update({
              where: { LAB_RESULT_ID: existing.LAB_RESULT_ID },
              data: {
                TEMPLATE_ID: item.templateId ?? existing.TEMPLATE_ID,
                VALUES: values,
                COMMENT: item.comment?.trim() ?? null,
                STATUS: status,
                ENTERED_BY: label,
                ENTERED_AT: now,
                RETURN_REASON: null,
                UPDATED_BY_ID: actor?.id ?? null,
                UPDATED_BY: label,
                UPDATED_DATE: now,
              },
              include: RESULT_INCLUDE,
            })
          : await tx.labResults.create({
              data: {
                LAB_REQUEST_ID: requestId,
                LAB_REQUEST_ITEM_ID: item.requestItemId,
                TEMPLATE_ID: item.templateId ?? null,
                VALUES: values,
                COMMENT: item.comment?.trim() ?? null,
                STATUS: status,
                ENTERED_BY: label,
                ENTERED_AT: now,
                VERSION: 1,
                CREATED_BY_ID: actor?.id ?? null,
                CREATED_BY: label,
                CREATED_DATE: now,
              },
              include: RESULT_INCLUDE,
            });
        await tx.labResultVersions.create({
          data: {
            LAB_RESULT_ID: row.LAB_RESULT_ID,
            VERSION: row.VERSION,
            VALUES: values,
            COMMENT: item.comment?.trim() ?? null,
            ACTION: submit ? 'submit' : 'draft',
            ACTED_BY: label,
            ACTED_AT: now,
          },
        });
        saved.push(row);
      }

      const labStatus = submit ? 'AwaitingValidation' : 'ResultDraft';
      const updatedRequest = await tx.labRequests.update({
        where: { LAB_REQUEST_ID: requestId },
        data: {
          LAB_STATUS: labStatus,
          UPDATED_BY_ID: actor?.id ?? null,
          UPDATED_BY: label,
          UPDATED_DATE: now,
        },
        include: REQUEST_INCLUDE,
      });
      return { rows: saved, updated: updatedRequest };
    });

    const responses = rows.map(toResultResponse);
    await this.audit.log({
      type: submit ? 'lab:result-submit' : 'lab:result-save',
      entity: 'lab_requests',
      entityId: requestId,
      personId: request.PERSON_ID,
      userId: actor?.id,
      createdBy: label,
      item: `Lab results ${submit ? 'submitted for validation' : 'saved as draft'}: ${request.REQUEST_NO}`,
      newValue: responses,
    });
    return { request: toRequestResponse(updated), results: responses };
  }

  async listResults(params: {
    status?: string;
    requestId?: number;
    q?: string;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(100, Math.max(1, params.limit ?? 50));
    const where: Prisma.LabResultsWhereInput = {};
    if (params.requestId) where.LAB_REQUEST_ID = params.requestId;
    if (params.status) {
      const parts = params.status
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      where.STATUS = parts.length > 1 ? { in: parts } : parts[0];
    }
    if (params.q?.trim()) {
      const q = params.q.trim();
      where.OR = [
        { item: { TEST_NAME: { contains: q, mode: 'insensitive' } } },
        { request: { REQUEST_NO: { contains: q, mode: 'insensitive' } } },
        {
          request: {
            person: {
              OR: [
                { FIRST_NAME: { contains: q, mode: 'insensitive' } },
                { LAST_NAME: { contains: q, mode: 'insensitive' } },
                { HOSPITAL_NO: { contains: q, mode: 'insensitive' } },
              ],
            },
          },
        },
      ];
    }
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.labResults.count({ where }),
      this.prisma.labResults.findMany({
        where,
        include: RESULT_INCLUDE,
        orderBy: { CREATED_DATE: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);
    return {
      items: rows.map(toResultResponse),
      meta: { page, limit, total },
    };
  }

  async findResultById(id: number): Promise<LabResultResponse> {
    const row = await this.prisma.labResults.findUnique({
      where: { LAB_RESULT_ID: id },
      include: RESULT_INCLUDE,
    });
    if (!row) throw new NotFoundException('Lab result not found');
    return toResultResponse(row);
  }

  async listResultVersions(id: number) {
    const result = await this.prisma.labResults.findUnique({
      where: { LAB_RESULT_ID: id },
      select: { LAB_RESULT_ID: true },
    });
    if (!result) throw new NotFoundException('Lab result not found');
    const rows = await this.prisma.labResultVersions.findMany({
      where: { LAB_RESULT_ID: id },
      orderBy: [{ VERSION: 'desc' }, { ACTED_AT: 'desc' }],
    });
    return rows.map((v) => ({
      versionId: v.VERSION_ID,
      labResultId: v.LAB_RESULT_ID,
      version: v.VERSION,
      values: v.VALUES,
      comment: v.COMMENT,
      action: v.ACTION,
      reason: v.REASON,
      actedBy: v.ACTED_BY,
      actedAt: v.ACTED_AT.toISOString(),
    }));
  }

  // -------------------------------------------------------------------------
  // Validation / return / amendment
  // -------------------------------------------------------------------------

  async validateResult(
    id: number,
    actor?: AuthUser,
  ): Promise<LabResultResponse> {
    const existing = await this.prisma.labResults.findUnique({
      where: { LAB_RESULT_ID: id },
      include: RESULT_INCLUDE,
    });
    if (!existing) throw new NotFoundException('Lab result not found');
    if (!['Submitted', 'PendingRevalidation'].includes(existing.STATUS)) {
      throw new BadRequestException(
        `Only submitted results can be validated (status: ${existing.STATUS})`,
      );
    }
    const revalidation = existing.STATUS === 'PendingRevalidation';
    const now = new Date();
    const label = actorLabel(actor);
    const row = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.labResults.update({
        where: { LAB_RESULT_ID: id },
        data: {
          STATUS: 'Validated',
          VALIDATED_BY: label,
          VALIDATED_AT: now,
          UPDATED_BY_ID: actor?.id ?? null,
          UPDATED_BY: label,
          UPDATED_DATE: now,
        },
        include: RESULT_INCLUDE,
      });
      await tx.labResultVersions.create({
        data: {
          LAB_RESULT_ID: id,
          VERSION: updated.VERSION,
          VALUES: updated.VALUES as Prisma.InputJsonValue,
          COMMENT: updated.COMMENT,
          ACTION: revalidation ? 'revalidate' : 'validate',
          ACTED_BY: label,
          ACTED_AT: now,
        },
      });
      // When every item of the request has a validated result → request Validated.
      const [itemCount, validatedCount] = await Promise.all([
        tx.labRequestItems.count({
          where: { LAB_REQUEST_ID: existing.LAB_REQUEST_ID },
        }),
        tx.labResults.count({
          where: {
            LAB_REQUEST_ID: existing.LAB_REQUEST_ID,
            STATUS: 'Validated',
          },
        }),
      ]);
      if (validatedCount >= itemCount) {
        await tx.labRequests.update({
          where: { LAB_REQUEST_ID: existing.LAB_REQUEST_ID },
          data: {
            LAB_STATUS: 'Validated',
            UPDATED_BY_ID: actor?.id ?? null,
            UPDATED_BY: label,
            UPDATED_DATE: now,
          },
        });
      }
      return updated;
    });
    const response = toResultResponse(row);
    await this.audit.log({
      type: 'lab:result-validate',
      entity: 'lab_results',
      entityId: id,
      personId: existing.request?.PERSON_ID,
      userId: actor?.id,
      createdBy: label,
      item: `Lab result validated: ${response.testName} (${response.requestNo})`,
      oldValue: { status: existing.STATUS },
      newValue: response,
    });
    return response;
  }

  async returnResult(
    id: number,
    dto: ReturnLabResultDto,
    actor?: AuthUser,
  ): Promise<LabResultResponse> {
    const existing = await this.prisma.labResults.findUnique({
      where: { LAB_RESULT_ID: id },
      include: RESULT_INCLUDE,
    });
    if (!existing) throw new NotFoundException('Lab result not found');
    if (!['Submitted', 'PendingRevalidation'].includes(existing.STATUS)) {
      throw new BadRequestException(
        `Only submitted results can be returned (status: ${existing.STATUS})`,
      );
    }
    const now = new Date();
    const label = actorLabel(actor);
    const reason = dto.reason.trim();
    const row = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.labResults.update({
        where: { LAB_RESULT_ID: id },
        data: {
          STATUS: 'Draft',
          RETURN_REASON: reason,
          UPDATED_BY_ID: actor?.id ?? null,
          UPDATED_BY: label,
          UPDATED_DATE: now,
        },
        include: RESULT_INCLUDE,
      });
      await tx.labResultVersions.create({
        data: {
          LAB_RESULT_ID: id,
          VERSION: updated.VERSION,
          VALUES: updated.VALUES as Prisma.InputJsonValue,
          COMMENT: updated.COMMENT,
          ACTION: 'return',
          REASON: reason,
          ACTED_BY: label,
          ACTED_AT: now,
        },
      });
      await tx.labRequests.update({
        where: { LAB_REQUEST_ID: existing.LAB_REQUEST_ID },
        data: {
          LAB_STATUS: 'ResultDraft',
          UPDATED_BY_ID: actor?.id ?? null,
          UPDATED_BY: label,
          UPDATED_DATE: now,
        },
      });
      return updated;
    });
    const response = toResultResponse(row);
    await this.audit.log({
      type: 'lab:result-return',
      entity: 'lab_results',
      entityId: id,
      personId: existing.request?.PERSON_ID,
      userId: actor?.id,
      createdBy: label,
      item: `Lab result returned for correction: ${response.testName} (${response.requestNo}) — ${reason}`,
      oldValue: { status: existing.STATUS },
      newValue: response,
    });
    return response;
  }

  async amendResult(
    id: number,
    dto: AmendLabResultDto,
    actor?: AuthUser,
  ): Promise<LabResultResponse> {
    const existing = await this.prisma.labResults.findUnique({
      where: { LAB_RESULT_ID: id },
      include: RESULT_INCLUDE,
    });
    if (!existing) throw new NotFoundException('Lab result not found');
    if (existing.STATUS !== 'Validated') {
      throw new BadRequestException(
        `Only validated results can be amended (status: ${existing.STATUS})`,
      );
    }
    const now = new Date();
    const label = actorLabel(actor);
    const reason = dto.reason.trim();
    const newVersion = existing.VERSION + 1;
    const row = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.labResults.update({
        where: { LAB_RESULT_ID: id },
        data: {
          VALUES: dto.values as Prisma.InputJsonValue,
          COMMENT: dto.comment?.trim() ?? existing.COMMENT,
          STATUS: 'PendingRevalidation',
          VERSION: newVersion,
          ENTERED_BY: label,
          ENTERED_AT: now,
          UPDATED_BY_ID: actor?.id ?? null,
          UPDATED_BY: label,
          UPDATED_DATE: now,
        },
        include: RESULT_INCLUDE,
      });
      // Immutable snapshot of the amended values; prior versions remain untouched.
      await tx.labResultVersions.create({
        data: {
          LAB_RESULT_ID: id,
          VERSION: newVersion,
          VALUES: dto.values as Prisma.InputJsonValue,
          COMMENT: dto.comment?.trim() ?? null,
          ACTION: 'amend',
          REASON: reason,
          ACTED_BY: label,
          ACTED_AT: now,
        },
      });
      await tx.labRequests.update({
        where: { LAB_REQUEST_ID: existing.LAB_REQUEST_ID },
        data: {
          LAB_STATUS: 'PendingRevalidation',
          UPDATED_BY_ID: actor?.id ?? null,
          UPDATED_BY: label,
          UPDATED_DATE: now,
        },
      });
      return updated;
    });
    const response = toResultResponse(row);
    await this.audit.log({
      type: 'lab:result-amend',
      entity: 'lab_results',
      entityId: id,
      personId: existing.request?.PERSON_ID,
      userId: actor?.id,
      createdBy: label,
      item: `Lab result amended (v${newVersion}): ${response.testName} (${response.requestNo}) — ${reason}`,
      oldValue: {
        status: existing.STATUS,
        version: existing.VERSION,
        values: existing.VALUES,
        comment: existing.COMMENT,
      },
      newValue: response,
    });
    return response;
  }
}
