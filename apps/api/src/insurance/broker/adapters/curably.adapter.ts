import { Injectable, Logger } from '@nestjs/common';
import type {
  BenefitsInput,
  BenefitsResult,
  ClaimStatusResult,
  ClaimSubmitInput,
  ClaimSubmitResult,
  EligibilityInput,
  EligibilityResult,
  HmoAdapter,
  PreAuthInput,
  PreAuthResult,
} from './hmo-adapter.interface';

/**
 * Curably aggregator adapter (Phase 1).
 * Maps HMS canonical calls to Curably REST rails:
 *   POST /api/verifications, GET/POST /api/provider/billing, GET/POST /api/hmo/claims
 *
 * Credentials via env (until HmoIntegrationCredentials vault is wired):
 *   CURABLY_BASE_URL, CURABLY_API_KEY, CURABLY_ORG_ID
 *
 * When credentials are missing, falls back to a clear ERROR / REJECTED response
 * so the broker remains usable in DRAFT without crashing.
 */
@Injectable()
export class CurablyAggregatorAdapter implements HmoAdapter {
  readonly adapterKey = 'curably';
  readonly capabilities = {
    eligibility: true,
    benefits: true,
    preAuth: true,
    claims: true,
    webhooks: true,
  };

  private readonly logger = new Logger(CurablyAggregatorAdapter.name);

  private get config() {
    return {
      baseUrl: (process.env.CURABLY_BASE_URL ?? '').replace(/\/+$/, ''),
      apiKey: process.env.CURABLY_API_KEY ?? '',
      orgId: process.env.CURABLY_ORG_ID ?? '',
    };
  }

  private get configured() {
    const { baseUrl, apiKey, orgId } = this.config;
    return Boolean(baseUrl && apiKey && orgId);
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    idempotencyKey?: string,
  ): Promise<{ ok: boolean; status: number; data: T | null; error?: string }> {
    const { baseUrl, apiKey, orgId } = this.config;
    if (!this.configured) {
      return { ok: false, status: 0, data: null, error: 'Curably credentials not configured' };
    }
    const headers: Record<string, string> = {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    };
    if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;

    try {
      const res = await fetch(`${baseUrl}${path}`, {
        method,
        headers,
        body: body != null ? JSON.stringify({ ...((body as object) ?? {}), org_id: orgId }) : undefined,
      });
      const text = await res.text();
      let data: T | null = null;
      try {
        data = text ? (JSON.parse(text) as T) : null;
      } catch {
        data = null;
      }
      if (!res.ok) {
        return {
          ok: false,
          status: res.status,
          data,
          error: `Curably ${method} ${path} failed (${res.status})`,
        };
      }
      return { ok: true, status: res.status, data };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Curably network error';
      this.logger.warn(message);
      return { ok: false, status: 0, data: null, error: message };
    }
  }

  async verifyEligibility(input: EligibilityInput): Promise<EligibilityResult> {
    if (!this.configured) {
      return {
        status: 'ERROR',
        member: {},
        plan: {},
        sourceAdapter: this.adapterKey,
        raw: { error: 'CURABLY_BASE_URL / CURABLY_API_KEY / CURABLY_ORG_ID required' },
      };
    }
    const res = await this.request<{
      status?: string;
      verified?: boolean;
      subject?: { name?: string; dob?: string; gender?: string; photo_url?: string };
      plan?: { code?: string; name?: string; employer?: string };
      valid_from?: string;
      valid_to?: string;
      id?: string;
    }>('POST', '/api/verifications', {
      member_no: input.memberNo,
      payer_id: String(input.payerId),
      person_id: String(input.personId),
      first_name: input.firstName,
      last_name: input.lastName,
      date_of_birth: input.dateOfBirth?.toISOString().slice(0, 10),
    });

    if (!res.ok || !res.data) {
      return {
        status: 'ERROR',
        member: {},
        plan: {},
        sourceAdapter: this.adapterKey,
        raw: { error: res.error, body: res.data },
      };
    }

    const d = res.data;
    const active =
      d.verified === true ||
      String(d.status ?? '').toUpperCase() === 'VERIFIED' ||
      String(d.status ?? '').toUpperCase() === 'ACTIVE';

    return {
      status: active ? 'ACTIVE' : 'INACTIVE',
      member: {
        fullName: d.subject?.name,
        dob: d.subject?.dob ?? null,
        gender: d.subject?.gender ?? null,
        photoUrl: d.subject?.photo_url ?? null,
      },
      plan: {
        code: d.plan?.code ?? null,
        name: d.plan?.name ?? null,
        employer: d.plan?.employer ?? null,
      },
      validFrom: d.valid_from ?? null,
      validTo: d.valid_to ?? null,
      externalRef: d.id ?? null,
      sourceAdapter: this.adapterKey,
      raw: d,
    };
  }

  async getBenefits(input: BenefitsInput): Promise<BenefitsResult> {
    if (!this.configured) {
      return {
        benefits: [],
        exclusions: [],
        sourceAdapter: this.adapterKey,
        fetchedAt: new Date().toISOString(),
        raw: { error: 'Curably not configured' },
      };
    }
    const qs = new URLSearchParams({
      member_no: input.memberNo,
      payer_id: String(input.payerId),
    });
    if (input.serviceCode) qs.set('service_code', input.serviceCode);
    if (input.category) qs.set('category', input.category);

    const res = await this.request<{
      plan?: { code?: string; name?: string };
      benefits?: Array<{
        category?: string;
        name?: string;
        service_code?: string;
        coverage_percent?: number;
        limit_amount?: number;
        co_pay_percent?: number;
        covered?: boolean;
        notes?: string;
      }>;
      exclusions?: string[];
    }>('GET', `/api/provider/billing?${qs.toString()}`);

    if (!res.ok || !res.data) {
      return {
        benefits: [],
        exclusions: [],
        sourceAdapter: this.adapterKey,
        fetchedAt: new Date().toISOString(),
        raw: { error: res.error },
      };
    }

    return {
      planCode: res.data.plan?.code ?? null,
      planName: res.data.plan?.name ?? null,
      benefits: (res.data.benefits ?? []).map((b) => ({
        category: b.category ?? 'General',
        name: b.name ?? b.service_code ?? 'Benefit',
        serviceCode: b.service_code,
        coveragePercent: b.coverage_percent ?? (b.covered === false ? 0 : 100),
        limitAmount: b.limit_amount ?? null,
        coPayPercent: b.co_pay_percent,
        covered: b.covered !== false,
        notes: b.notes,
      })),
      exclusions: res.data.exclusions ?? [],
      sourceAdapter: this.adapterKey,
      fetchedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
      raw: res.data,
    };
  }

  async requestPreAuth(input: PreAuthInput): Promise<PreAuthResult> {
    if (!this.configured) {
      return {
        status: 'DENIED',
        notes: 'Curably not configured',
        sourceAdapter: this.adapterKey,
      };
    }
    const res = await this.request<{
      status?: string;
      auth_code?: string;
      approved_amount?: number;
      valid_until?: string;
      id?: string;
      message?: string;
    }>(
      'POST',
      '/api/provider/billing',
      {
        action: 'pre_approval',
        member_no: input.memberNo,
        payer_id: String(input.payerId),
        diagnosis_codes: input.diagnosisCodes,
        procedure_codes: input.procedureCodes,
        service_codes: input.serviceCodes,
        estimated_amount: input.estimatedAmount,
        notes: input.notes,
        lines: input.lines,
      },
      input.idempotencyKey,
    );

    if (!res.ok || !res.data) {
      return {
        status: 'DENIED',
        notes: res.error ?? 'Pre-auth failed',
        sourceAdapter: this.adapterKey,
        raw: res.data,
      };
    }

    const st = String(res.data.status ?? 'PENDING').toUpperCase();
    const status =
      st.includes('APPROV') ? 'APPROVED' : st.includes('DEN') ? 'DENIED' : 'PENDING';

    return {
      status,
      authCode: res.data.auth_code ?? null,
      approvedAmount: res.data.approved_amount ?? null,
      validUntil: res.data.valid_until ?? null,
      externalRef: res.data.id ?? null,
      notes: res.data.message ?? null,
      sourceAdapter: this.adapterKey,
      raw: res.data,
    };
  }

  async submitClaim(input: ClaimSubmitInput): Promise<ClaimSubmitResult> {
    if (!this.configured) {
      return {
        status: 'REJECTED',
        validationErrors: ['Curably not configured'],
        sourceAdapter: this.adapterKey,
      };
    }
    const res = await this.request<{
      status?: string;
      claim_id?: string;
      id?: string;
      errors?: string[];
      message?: string;
    }>(
      'POST',
      '/api/hmo/claims',
      {
        member_no: input.memberNo,
        payer_id: String(input.payerId),
        person_id: String(input.personId),
        encounter_id: input.encounterId != null ? String(input.encounterId) : undefined,
        total_amount: input.totalAmount,
        payer_amount: input.payerAmount,
        patient_amount: input.patientAmount,
        diagnosis_codes: input.diagnosisCodes,
        lines: input.lines,
      },
      input.idempotencyKey,
    );

    if (!res.ok || !res.data) {
      return {
        status: 'REJECTED',
        validationErrors: [res.error ?? 'Claim submission failed'],
        sourceAdapter: this.adapterKey,
        raw: res.data,
      };
    }

    const st = String(res.data.status ?? 'RECEIVED').toUpperCase();
    const status =
      st.includes('REJECT') ? 'REJECTED' : st.includes('QUER') ? 'QUERIED' : 'RECEIVED';

    return {
      status,
      externalClaimRef: res.data.claim_id ?? res.data.id ?? null,
      validationErrors: res.data.errors,
      sourceAdapter: this.adapterKey,
      raw: res.data,
    };
  }

  async getClaimStatus(externalRef: string): Promise<ClaimStatusResult> {
    if (!this.configured) {
      return {
        status: 'UNKNOWN',
        externalClaimRef: externalRef,
        message: 'Curably not configured',
        sourceAdapter: this.adapterKey,
      };
    }
    const res = await this.request<{
      status?: string;
      claim_id?: string;
      message?: string;
    }>('GET', `/api/hmo/claims?claim_id=${encodeURIComponent(externalRef)}`);

    return {
      status: res.data?.status ?? (res.ok ? 'RECEIVED' : 'ERROR'),
      externalClaimRef: res.data?.claim_id ?? externalRef,
      message: res.data?.message ?? res.error ?? null,
      sourceAdapter: this.adapterKey,
      raw: res.data,
    };
  }
}
