import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthUser } from '../../auth/types/auth-user.type';
import type { HmoAdapter } from './adapters/hmo-adapter.interface';
import { MockHmoAdapter } from './adapters/mock.adapter';
import { CurablyAggregatorAdapter } from './adapters/curably.adapter';
import {
  AiicoAdapter,
  AxaMansardAdapter,
  DEFAULT_HMO_CHECKLIST,
  HygeiaAdapter,
  RelianceAdapter,
  ThtAdapter,
} from './adapters/direct.adapters';
import type {
  BenefitsQueryDto,
  CreatePreAuthDto,
  EligibilityQueryDto,
  SubmitClaimDto,
  UpsertCoverageDto,
} from './dto/hmo-broker.dto';

@Injectable()
export class HmoBrokerService {
  private readonly adapters: Map<string, HmoAdapter>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly mock: MockHmoAdapter,
    private readonly curably: CurablyAggregatorAdapter,
    private readonly hygeia: HygeiaAdapter,
    private readonly axa: AxaMansardAdapter,
    private readonly reliance: RelianceAdapter,
    private readonly tht: ThtAdapter,
    private readonly aiico: AiicoAdapter,
  ) {
    this.adapters = new Map<string, HmoAdapter>([
      [this.mock.adapterKey, this.mock],
      [this.curably.adapterKey, this.curably],
      [this.hygeia.adapterKey, this.hygeia],
      [this.axa.adapterKey, this.axa],
      [this.reliance.adapterKey, this.reliance],
      [this.tht.adapterKey, this.tht],
      [this.aiico.adapterKey, this.aiico],
    ]);
  }

  private actorLabel(user?: AuthUser | null) {
    if (!user) return 'system';
    return user.email ?? `user:${user.id}`;
  }

  private async resolveAdapter(payerId: number): Promise<{
    adapter: HmoAdapter;
    payer: { PAYER_ID: number; CODE: string; NAME: string; PAYER_TYPE: string; STATUS: string };
    profile: { PROFILE_ID: number; ADAPTER_KEY: string; STATUS: string } | null;
  }> {
    const payer = await this.prisma.servicePayers.findUnique({
      where: { PAYER_ID: payerId },
      include: { hmoProfile: true },
    });
    if (!payer) throw new NotFoundException(`Payer ${payerId} not found`);
    if (payer.PAYER_TYPE !== 'HMO') {
      throw new BadRequestException(`Payer ${payer.CODE} is not an HMO payer`);
    }

    const adapterKey = payer.hmoProfile?.ADAPTER_KEY ?? 'mock';
    const adapter = this.adapters.get(adapterKey) ?? this.mock;
    return {
      adapter,
      payer: {
        PAYER_ID: payer.PAYER_ID,
        CODE: payer.CODE,
        NAME: payer.NAME,
        PAYER_TYPE: payer.PAYER_TYPE,
        STATUS: payer.STATUS,
      },
      profile: payer.hmoProfile
        ? {
            PROFILE_ID: payer.hmoProfile.PROFILE_ID,
            ADAPTER_KEY: payer.hmoProfile.ADAPTER_KEY,
            STATUS: payer.hmoProfile.STATUS,
          }
        : null,
    };
  }

  private async logIntegration(input: {
    payerId?: number;
    adapterKey: string;
    operation: string;
    personId?: number;
    success: boolean;
    httpStatus?: number;
    durationMs?: number;
    errorMessage?: string;
    requestMeta?: unknown;
    responseMeta?: unknown;
  }) {
    await this.prisma.hmoIntegrationLogs.create({
      data: {
        PAYER_ID: input.payerId,
        ADAPTER_KEY: input.adapterKey,
        OPERATION: input.operation,
        PERSON_ID: input.personId,
        SUCCESS: input.success,
        HTTP_STATUS: input.httpStatus,
        DURATION_MS: input.durationMs,
        ERROR_MESSAGE: input.errorMessage?.slice(0, 500),
        REQUEST_META: (input.requestMeta as Prisma.InputJsonValue) ?? undefined,
        RESPONSE_META: (input.responseMeta as Prisma.InputJsonValue) ?? undefined,
      },
    });
  }

  async listPayers() {
    const rows = await this.prisma.servicePayers.findMany({
      where: { PAYER_TYPE: 'HMO' },
      include: { hmoProfile: true },
      orderBy: { NAME: 'asc' },
    });
    return {
      items: rows.map((r) => ({
        payerId: r.PAYER_ID,
        code: r.CODE,
        name: r.NAME,
        status: r.STATUS,
        adapterKey: r.hmoProfile?.ADAPTER_KEY ?? null,
        integrationStatus: r.hmoProfile?.STATUS ?? 'DRAFT',
        capabilities: r.hmoProfile?.CAPABILITIES ?? null,
        checklist: r.hmoProfile?.CHECKLIST ?? null,
      })),
    };
  }

  async upsertCoverage(dto: UpsertCoverageDto, user?: AuthUser) {
    const payer = await this.prisma.servicePayers.findUnique({
      where: { PAYER_ID: dto.payerId },
    });
    if (!payer || payer.PAYER_TYPE !== 'HMO') {
      throw new BadRequestException('Invalid HMO payer');
    }
    const person = await this.prisma.persons.findUnique({
      where: { PERSON_ID: dto.personId },
    });
    if (!person) throw new NotFoundException('Patient not found');

    const label = this.actorLabel(user);
    const now = new Date();
    const existing = await this.prisma.patientHmoCoverage.findFirst({
      where: {
        PERSON_ID: dto.personId,
        PAYER_ID: dto.payerId,
        STATUS: 'Active',
      },
    });

    const data = {
      MEMBER_NO: dto.memberNo.trim(),
      PLAN_CODE: dto.planCode,
      PLAN_NAME: dto.planName,
      EMPLOYER_NAME: dto.employerName,
      PRINCIPAL_FLAG: dto.principalFlag,
      VALID_FROM: dto.validFrom ? new Date(dto.validFrom) : null,
      VALID_TO: dto.validTo ? new Date(dto.validTo) : null,
      UPDATED_BY: label,
      UPDATED_DATE: now,
    };

    const coverage = existing
      ? await this.prisma.patientHmoCoverage.update({
          where: { COVERAGE_ID: existing.COVERAGE_ID },
          data,
        })
      : await this.prisma.patientHmoCoverage.create({
          data: {
            PERSON_ID: dto.personId,
            PAYER_ID: dto.payerId,
            ...data,
            STATUS: 'Active',
            CREATED_BY: label,
            CREATED_DATE: now,
          },
        });

    await this.prisma.persons.update({
      where: { PERSON_ID: dto.personId },
      data: { HMO_ID: dto.payerId, UPDATED_BY: label, UPDATED_DATE: now },
    });

    await this.audit.log({
      type: 'hmo:coverage-upsert',
      entity: 'patient_hmo_coverage',
      entityId: coverage.COVERAGE_ID,
      personId: dto.personId,
      userId: user?.id,
      createdBy: label,
      item: `HMO coverage saved: ${payer.CODE} / ${dto.memberNo}`,
      newValue: { coverageId: coverage.COVERAGE_ID, payerId: dto.payerId, memberNo: dto.memberNo },
    });

    return {
      coverageId: coverage.COVERAGE_ID,
      personId: coverage.PERSON_ID,
      payerId: coverage.PAYER_ID,
      memberNo: coverage.MEMBER_NO,
      planCode: coverage.PLAN_CODE,
      planName: coverage.PLAN_NAME,
      status: coverage.STATUS,
    };
  }

  async verifyEligibility(query: EligibilityQueryDto, user?: AuthUser) {
    const started = Date.now();
    const { adapter, payer } = await this.resolveAdapter(query.payerId);
    const person = await this.prisma.persons.findUnique({
      where: { PERSON_ID: query.personId },
    });
    if (!person) throw new NotFoundException('Patient not found');

    const result = await adapter.verifyEligibility({
      personId: query.personId,
      payerId: query.payerId,
      memberNo: query.memberNo.trim(),
      encounterId: query.encounterId,
      firstName: person.FIRST_NAME ?? undefined,
      lastName: person.LAST_NAME ?? undefined,
      dateOfBirth: person.DATE_OF_BIRTH,
    });

    const coverage = await this.prisma.patientHmoCoverage.findFirst({
      where: {
        PERSON_ID: query.personId,
        PAYER_ID: query.payerId,
        STATUS: 'Active',
      },
    });

    const row = await this.prisma.hmoEligibilityChecks.create({
      data: {
        PERSON_ID: query.personId,
        PAYER_ID: query.payerId,
        COVERAGE_ID: coverage?.COVERAGE_ID,
        ENCOUNTER_ID: query.encounterId,
        MEMBER_NO: query.memberNo.trim(),
        STATUS: result.status,
        MEMBER_NAME: result.member.fullName,
        MEMBER_DOB: result.member.dob ? new Date(result.member.dob) : null,
        MEMBER_GENDER: result.member.gender,
        PHOTO_URL: result.member.photoUrl,
        PLAN_CODE: result.plan.code,
        PLAN_NAME: result.plan.name,
        EMPLOYER_NAME: result.plan.employer,
        VALID_FROM: result.validFrom ? new Date(result.validFrom) : null,
        VALID_TO: result.validTo ? new Date(result.validTo) : null,
        SOURCE_ADAPTER: result.sourceAdapter,
        EXTERNAL_REF: result.externalRef,
        RAW_RESPONSE: (result.raw as Prisma.InputJsonValue) ?? undefined,
        VERIFIED_BY: this.actorLabel(user),
      },
    });

    await this.logIntegration({
      payerId: payer.PAYER_ID,
      adapterKey: adapter.adapterKey,
      operation: 'eligibility',
      personId: query.personId,
      success: result.status === 'ACTIVE' || result.status === 'INACTIVE',
      durationMs: Date.now() - started,
      requestMeta: { memberNo: query.memberNo, encounterId: query.encounterId },
      responseMeta: { status: result.status, externalRef: result.externalRef },
    });

    await this.audit.log({
      type: 'hmo:eligibility-check',
      entity: 'hmo_eligibility_checks',
      entityId: row.CHECK_ID,
      personId: query.personId,
      userId: user?.id,
      createdBy: this.actorLabel(user),
      status: result.status,
      item: `HMO eligibility ${result.status} via ${adapter.adapterKey}`,
      newValue: { checkId: row.CHECK_ID, payerCode: payer.CODE, status: result.status },
    });

    return {
      checkId: row.CHECK_ID,
      status: result.status,
      member: result.member,
      plan: result.plan,
      validFrom: result.validFrom,
      validTo: result.validTo,
      verifiedAt: row.VERIFIED_AT.toISOString(),
      sourceAdapter: result.sourceAdapter,
      payer: { payerId: payer.PAYER_ID, code: payer.CODE, name: payer.NAME },
    };
  }

  async getBenefits(query: BenefitsQueryDto, user?: AuthUser) {
    const started = Date.now();
    const { adapter, payer } = await this.resolveAdapter(query.payerId);
    const result = await adapter.getBenefits({
      personId: query.personId,
      payerId: query.payerId,
      memberNo: query.memberNo.trim(),
      serviceCode: query.serviceCode,
      category: query.category,
    });

    const snapshot = await this.prisma.hmoBenefitSnapshots.create({
      data: {
        PERSON_ID: query.personId,
        PAYER_ID: query.payerId,
        MEMBER_NO: query.memberNo.trim(),
        PLAN_CODE: result.planCode,
        PLAN_NAME: result.planName,
        BENEFITS: result.benefits as unknown as Prisma.InputJsonValue,
        EXCLUSIONS: result.exclusions as unknown as Prisma.InputJsonValue,
        SOURCE_ADAPTER: result.sourceAdapter,
        EXPIRES_AT: result.expiresAt ? new Date(result.expiresAt) : null,
      },
    });

    await this.logIntegration({
      payerId: payer.PAYER_ID,
      adapterKey: adapter.adapterKey,
      operation: 'benefits',
      personId: query.personId,
      success: true,
      durationMs: Date.now() - started,
      requestMeta: { serviceCode: query.serviceCode, category: query.category },
      responseMeta: { benefitCount: result.benefits.length },
    });

    await this.audit.log({
      type: 'hmo:benefits-inquiry',
      entity: 'hmo_benefit_snapshots',
      entityId: snapshot.SNAPSHOT_ID,
      personId: query.personId,
      userId: user?.id,
      createdBy: this.actorLabel(user),
      item: `HMO benefits via ${adapter.adapterKey}`,
    });

    return {
      snapshotId: snapshot.SNAPSHOT_ID,
      planCode: result.planCode,
      planName: result.planName,
      benefits: result.benefits,
      exclusions: result.exclusions,
      sourceAdapter: result.sourceAdapter,
      fetchedAt: result.fetchedAt,
      expiresAt: result.expiresAt,
      payer: { payerId: payer.PAYER_ID, code: payer.CODE, name: payer.NAME },
    };
  }

  async requestPreAuth(dto: CreatePreAuthDto, user?: AuthUser) {
    if (dto.idempotencyKey) {
      const existing = await this.prisma.hmoAuthorizations.findUnique({
        where: { IDEMPOTENCY_KEY: dto.idempotencyKey },
      });
      if (existing) {
        return this.mapAuth(existing);
      }
    }

    const started = Date.now();
    const { adapter, payer } = await this.resolveAdapter(dto.payerId);
    const result = await adapter.requestPreAuth({
      personId: dto.personId,
      payerId: dto.payerId,
      memberNo: dto.memberNo.trim(),
      encounterId: dto.encounterId,
      admissionId: dto.admissionId,
      diagnosisCodes: dto.diagnosisCodes,
      procedureCodes: dto.procedureCodes,
      serviceCodes: dto.serviceCodes,
      estimatedAmount: dto.estimatedAmount,
      notes: dto.notes,
      idempotencyKey: dto.idempotencyKey,
      lines: dto.lines,
    });

    const auth = await this.prisma.hmoAuthorizations.create({
      data: {
        PERSON_ID: dto.personId,
        PAYER_ID: dto.payerId,
        ENCOUNTER_ID: dto.encounterId,
        ADMISSION_ID: dto.admissionId,
        MEMBER_NO: dto.memberNo.trim(),
        DIAGNOSIS_CODES: dto.diagnosisCodes,
        PROCEDURE_CODES: dto.procedureCodes ?? undefined,
        SERVICE_CODES: dto.serviceCodes ?? undefined,
        ESTIMATED_AMOUNT: dto.estimatedAmount,
        APPROVED_AMOUNT: result.approvedAmount ?? undefined,
        STATUS: result.status,
        AUTH_CODE: result.authCode,
        EXTERNAL_REF: result.externalRef,
        VALID_UNTIL: result.validUntil ? new Date(result.validUntil) : null,
        NOTES: result.notes,
        SOURCE_ADAPTER: result.sourceAdapter,
        IDEMPOTENCY_KEY: dto.idempotencyKey,
        RAW_RESPONSE: (result.raw as Prisma.InputJsonValue) ?? undefined,
        REQUESTED_BY: this.actorLabel(user),
        lines: dto.lines?.length
          ? {
              create: dto.lines.map((l) => ({
                SERVICE_CODE: l.serviceCode,
                DESCRIPTION: l.description,
                QUANTITY: l.quantity ?? 1,
                UNIT_AMOUNT: l.unitAmount,
                STATUS: result.status,
              })),
            }
          : undefined,
      },
    });

    await this.logIntegration({
      payerId: payer.PAYER_ID,
      adapterKey: adapter.adapterKey,
      operation: 'pre-auth',
      personId: dto.personId,
      success: result.status !== 'DENIED',
      durationMs: Date.now() - started,
      requestMeta: { diagnosisCodes: dto.diagnosisCodes, estimatedAmount: dto.estimatedAmount },
      responseMeta: { status: result.status, authCode: result.authCode },
    });

    await this.audit.log({
      type: 'hmo:preauth',
      entity: 'hmo_authorizations',
      entityId: auth.AUTH_ID,
      personId: dto.personId,
      userId: user?.id,
      createdBy: this.actorLabel(user),
      status: result.status,
      item: `HMO pre-auth ${result.status}`,
      newValue: { authId: auth.AUTH_ID, authCode: result.authCode, status: result.status },
    });

    return this.mapAuth(auth);
  }

  async getPreAuth(authId: number) {
    const auth = await this.prisma.hmoAuthorizations.findUnique({
      where: { AUTH_ID: authId },
      include: { lines: true },
    });
    if (!auth) throw new NotFoundException('Authorization not found');
    return {
      ...this.mapAuth(auth),
      lines: auth.lines.map((l) => ({
        lineId: l.LINE_ID,
        serviceCode: l.SERVICE_CODE,
        description: l.DESCRIPTION,
        quantity: l.QUANTITY,
        unitAmount: l.UNIT_AMOUNT != null ? Number(l.UNIT_AMOUNT) : null,
        status: l.STATUS,
      })),
    };
  }

  async submitClaim(dto: SubmitClaimDto, user?: AuthUser) {
    if (dto.idempotencyKey) {
      const existing = await this.prisma.hmoClaims.findUnique({
        where: { IDEMPOTENCY_KEY: dto.idempotencyKey },
        include: { events: true },
      });
      if (existing) return this.mapClaim(existing);
    }

    const started = Date.now();
    const { adapter, payer } = await this.resolveAdapter(dto.payerId);
    const result = await adapter.submitClaim({
      personId: dto.personId,
      payerId: dto.payerId,
      memberNo: dto.memberNo.trim(),
      authId: dto.authId,
      encounterId: dto.encounterId,
      admissionId: dto.admissionId,
      totalAmount: dto.totalAmount,
      payerAmount: dto.payerAmount,
      patientAmount: dto.patientAmount,
      diagnosisCodes: dto.diagnosisCodes,
      lines: dto.lines,
      idempotencyKey: dto.idempotencyKey,
    });

    const claim = await this.prisma.hmoClaims.create({
      data: {
        PERSON_ID: dto.personId,
        PAYER_ID: dto.payerId,
        AUTH_ID: dto.authId,
        ENCOUNTER_ID: dto.encounterId,
        ADMISSION_ID: dto.admissionId,
        MEMBER_NO: dto.memberNo.trim(),
        STATUS: result.status,
        EXTERNAL_CLAIM_REF: result.externalClaimRef,
        TOTAL_AMOUNT: dto.totalAmount,
        PAYER_AMOUNT: dto.payerAmount ?? dto.totalAmount - (dto.patientAmount ?? 0),
        PATIENT_AMOUNT: dto.patientAmount ?? 0,
        DIAGNOSIS_CODES: dto.diagnosisCodes ?? undefined,
        VALIDATION_ERRORS: result.validationErrors ?? undefined,
        SOURCE_ADAPTER: result.sourceAdapter,
        IDEMPOTENCY_KEY: dto.idempotencyKey,
        RAW_RESPONSE: (result.raw as Prisma.InputJsonValue) ?? undefined,
        SUBMITTED_BY: this.actorLabel(user),
        lines: {
          create: dto.lines.map((l) => ({
            SERVICE_CODE: l.serviceCode,
            DESCRIPTION: l.description,
            QUANTITY: l.quantity ?? 1,
            UNIT_AMOUNT: l.unitAmount,
            PAYER_AMOUNT: l.payerAmount,
            PATIENT_AMOUNT: l.patientAmount,
            BILL_LINE_REF: l.billLineRef,
          })),
        },
        events: {
          create: {
            TO_STATUS: result.status,
            MESSAGE: result.validationErrors?.join('; ') ?? 'Claim submitted',
            SOURCE: adapter.adapterKey,
            CREATED_BY: this.actorLabel(user),
          },
        },
      },
      include: { events: true },
    });

    await this.logIntegration({
      payerId: payer.PAYER_ID,
      adapterKey: adapter.adapterKey,
      operation: 'claim-submit',
      personId: dto.personId,
      success: result.status === 'RECEIVED',
      durationMs: Date.now() - started,
      errorMessage: result.validationErrors?.join('; '),
      requestMeta: { totalAmount: dto.totalAmount, lineCount: dto.lines.length },
      responseMeta: { status: result.status, externalClaimRef: result.externalClaimRef },
    });

    await this.audit.log({
      type: 'hmo:claim-submit',
      entity: 'hmo_claims',
      entityId: claim.CLAIM_ID,
      personId: dto.personId,
      userId: user?.id,
      createdBy: this.actorLabel(user),
      status: result.status,
      item: `HMO claim ${result.status}`,
      newValue: {
        claimId: claim.CLAIM_ID,
        externalClaimRef: result.externalClaimRef,
        status: result.status,
      },
    });

    return this.mapClaim(claim);
  }

  async getClaim(claimId: number) {
    const claim = await this.prisma.hmoClaims.findUnique({
      where: { CLAIM_ID: claimId },
      include: { lines: true, events: { orderBy: { CREATED_AT: 'asc' } } },
    });
    if (!claim) throw new NotFoundException('Claim not found');
    return {
      ...this.mapClaim(claim),
      lines: claim.lines.map((l) => ({
        lineId: l.LINE_ID,
        serviceCode: l.SERVICE_CODE,
        description: l.DESCRIPTION,
        quantity: l.QUANTITY,
        unitAmount: l.UNIT_AMOUNT != null ? Number(l.UNIT_AMOUNT) : null,
        payerAmount: l.PAYER_AMOUNT != null ? Number(l.PAYER_AMOUNT) : null,
        patientAmount: l.PATIENT_AMOUNT != null ? Number(l.PATIENT_AMOUNT) : null,
        billLineRef: l.BILL_LINE_REF,
      })),
      timeline: claim.events.map((e) => ({
        eventId: e.EVENT_ID,
        fromStatus: e.FROM_STATUS,
        toStatus: e.TO_STATUS,
        message: e.MESSAGE,
        source: e.SOURCE,
        createdAt: e.CREATED_AT.toISOString(),
      })),
    };
  }

  async pollClaimStatus(claimId: number, user?: AuthUser) {
    const claim = await this.prisma.hmoClaims.findUnique({
      where: { CLAIM_ID: claimId },
    });
    if (!claim) throw new NotFoundException('Claim not found');
    if (!claim.EXTERNAL_CLAIM_REF) {
      throw new BadRequestException('Claim has no external reference to poll');
    }

    const { adapter } = await this.resolveAdapter(claim.PAYER_ID);
    const result = await adapter.getClaimStatus(claim.EXTERNAL_CLAIM_REF);
    const nextStatus = result.status.toUpperCase();

    if (nextStatus !== claim.STATUS) {
      await this.prisma.hmoClaims.update({
        where: { CLAIM_ID: claimId },
        data: { STATUS: nextStatus, UPDATED_AT: new Date() },
      });
      await this.prisma.hmoClaimStatusEvents.create({
        data: {
          CLAIM_ID: claimId,
          FROM_STATUS: claim.STATUS,
          TO_STATUS: nextStatus,
          MESSAGE: result.message,
          SOURCE: adapter.adapterKey,
          RAW_PAYLOAD: (result.raw as Prisma.InputJsonValue) ?? undefined,
          CREATED_BY: this.actorLabel(user),
        },
      });
    }

    return this.getClaim(claimId);
  }

  /**
   * Webhook ingress from Curably / direct HMO.
   * Verifies optional HMAC when CURABLY_WEBHOOK_SECRET is set.
   */
  async handleWebhook(
    payerCode: string,
    body: Record<string, unknown>,
    signatureHeader?: string,
  ) {
    const payer = await this.prisma.servicePayers.findFirst({
      where: { CODE: payerCode },
      include: { hmoProfile: true },
    });
    if (!payer) throw new NotFoundException(`Unknown payer code ${payerCode}`);

    const secret = process.env.CURABLY_WEBHOOK_SECRET;
    if (secret && signatureHeader) {
      const crypto = await import('crypto');
      const raw = JSON.stringify(body);
      const expected =
        'sha256=' + crypto.createHmac('sha256', secret).update(raw, 'utf8').digest('hex');
      if (signatureHeader !== expected) {
        throw new BadRequestException('Invalid webhook signature');
      }
    }

    const event = String(body.event ?? body.type ?? 'unknown');
    const externalRef = String(
      body.claim_id ?? body.externalClaimRef ?? body.id ?? '',
    );

    await this.logIntegration({
      payerId: payer.PAYER_ID,
      adapterKey: payer.hmoProfile?.ADAPTER_KEY ?? 'webhook',
      operation: 'webhook',
      success: true,
      requestMeta: { event, payerCode },
      responseMeta: { externalRef: externalRef || null },
    });

    if (externalRef) {
      const claim = await this.prisma.hmoClaims.findFirst({
        where: { EXTERNAL_CLAIM_REF: externalRef, PAYER_ID: payer.PAYER_ID },
      });
      if (claim) {
        const toStatus = String(body.status ?? body.claim_status ?? claim.STATUS).toUpperCase();
        if (toStatus !== claim.STATUS) {
          await this.prisma.hmoClaims.update({
            where: { CLAIM_ID: claim.CLAIM_ID },
            data: { STATUS: toStatus, UPDATED_AT: new Date() },
          });
          await this.prisma.hmoClaimStatusEvents.create({
            data: {
              CLAIM_ID: claim.CLAIM_ID,
              FROM_STATUS: claim.STATUS,
              TO_STATUS: toStatus,
              MESSAGE: `Webhook ${event}`,
              SOURCE: 'webhook',
              RAW_PAYLOAD: body as Prisma.InputJsonValue,
              CREATED_BY: 'webhook',
            },
          });
        }
      }
    }

    return { received: true, event, payerCode };
  }

  private mapAuth(auth: {
    AUTH_ID: number;
    STATUS: string;
    AUTH_CODE: string | null;
    APPROVED_AMOUNT: Prisma.Decimal | null;
    VALID_UNTIL: Date | null;
    EXTERNAL_REF: string | null;
    NOTES: string | null;
    SOURCE_ADAPTER: string;
    REQUESTED_AT: Date;
  }) {
    return {
      authId: auth.AUTH_ID,
      status: auth.STATUS,
      authCode: auth.AUTH_CODE,
      approvedAmount: auth.APPROVED_AMOUNT != null ? Number(auth.APPROVED_AMOUNT) : null,
      validUntil: auth.VALID_UNTIL?.toISOString() ?? null,
      externalRef: auth.EXTERNAL_REF,
      notes: auth.NOTES,
      sourceAdapter: auth.SOURCE_ADAPTER,
      requestedAt: auth.REQUESTED_AT.toISOString(),
    };
  }

  private mapClaim(claim: {
    CLAIM_ID: number;
    STATUS: string;
    EXTERNAL_CLAIM_REF: string | null;
    TOTAL_AMOUNT: Prisma.Decimal;
    PAYER_AMOUNT: Prisma.Decimal | null;
    PATIENT_AMOUNT: Prisma.Decimal | null;
    VALIDATION_ERRORS: Prisma.JsonValue;
    SOURCE_ADAPTER: string;
    SUBMITTED_AT: Date;
  }) {
    return {
      claimId: claim.CLAIM_ID,
      status: claim.STATUS,
      externalClaimRef: claim.EXTERNAL_CLAIM_REF,
      totalAmount: Number(claim.TOTAL_AMOUNT),
      payerAmount: claim.PAYER_AMOUNT != null ? Number(claim.PAYER_AMOUNT) : null,
      patientAmount: claim.PATIENT_AMOUNT != null ? Number(claim.PATIENT_AMOUNT) : null,
      validationErrors: claim.VALIDATION_ERRORS,
      sourceAdapter: claim.SOURCE_ADAPTER,
      submittedAt: claim.SUBMITTED_AT.toISOString(),
    };
  }

  /** Expose checklist template for seed / admin. */
  getDefaultChecklist() {
    return { ...DEFAULT_HMO_CHECKLIST };
  }

  /**
   * Latest stored coverage + eligibility snapshot for OPD / consultation headers
   * (does not re-call the external adapter).
   */
  async getPersonCoverage(personId: number) {
    const person = await this.prisma.persons.findUnique({
      where: { PERSON_ID: personId },
      select: { PERSON_ID: true, HMO_ID: true },
    });
    if (!person) throw new NotFoundException('Patient not found');

    const coverage = await this.prisma.patientHmoCoverage.findFirst({
      where: { PERSON_ID: personId, STATUS: 'Active' },
      include: { payer: true },
      orderBy: { UPDATED_DATE: 'desc' },
    });

    const latestCheck = coverage
      ? await this.prisma.hmoEligibilityChecks.findFirst({
          where: {
            PERSON_ID: personId,
            PAYER_ID: coverage.PAYER_ID,
          },
          orderBy: { VERIFIED_AT: 'desc' },
        })
      : await this.prisma.hmoEligibilityChecks.findFirst({
          where: { PERSON_ID: personId },
          orderBy: { VERIFIED_AT: 'desc' },
        });

    return {
      personId,
      hmoId: person.HMO_ID,
      coverage: coverage
        ? {
            coverageId: coverage.COVERAGE_ID,
            payerId: coverage.PAYER_ID,
            payerCode: coverage.payer.CODE,
            payerName: coverage.payer.NAME,
            memberNo: coverage.MEMBER_NO,
            planCode: coverage.PLAN_CODE,
            planName: coverage.PLAN_NAME,
            employerName: coverage.EMPLOYER_NAME,
            status: coverage.STATUS,
            validFrom: coverage.VALID_FROM?.toISOString() ?? null,
            validTo: coverage.VALID_TO?.toISOString() ?? null,
          }
        : null,
      latestEligibility: latestCheck
        ? {
            checkId: latestCheck.CHECK_ID,
            status: latestCheck.STATUS,
            planName: latestCheck.PLAN_NAME,
            memberName: latestCheck.MEMBER_NAME,
            verifiedAt: latestCheck.VERIFIED_AT.toISOString(),
            sourceAdapter: latestCheck.SOURCE_ADAPTER,
          }
        : null,
    };
  }

  /** Poll open claims that still have an external reference (async job). */
  async pollOpenClaims(limit = 25) {
    const open = await this.prisma.hmoClaims.findMany({
      where: {
        EXTERNAL_CLAIM_REF: { not: null },
        STATUS: { in: ['RECEIVED', 'PENDING', 'QUERIED', 'IN_REVIEW'] },
      },
      orderBy: { UPDATED_AT: 'asc' },
      take: limit,
    });
    const results: Array<{ claimId: number; status: string; ok: boolean; error?: string }> = [];
    for (const claim of open) {
      try {
        const updated = await this.pollClaimStatus(claim.CLAIM_ID);
        results.push({ claimId: claim.CLAIM_ID, status: updated.status, ok: true });
      } catch (err) {
        results.push({
          claimId: claim.CLAIM_ID,
          status: claim.STATUS,
          ok: false,
          error: err instanceof Error ? err.message : 'poll failed',
        });
      }
    }
    return { polled: results.length, results };
  }
}
