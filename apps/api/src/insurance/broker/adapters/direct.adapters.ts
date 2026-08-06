import { Injectable } from '@nestjs/common';
import { MockHmoAdapter } from './mock.adapter';
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
 * Base for direct HMO adapters pending partnership / OpenAPI.
 * Delegates to Mock until the HMO contract is signed; checklist tracks readiness.
 */
abstract class PendingDirectAdapter implements HmoAdapter {
  abstract readonly adapterKey: string;
  abstract readonly displayName: string;
  readonly capabilities = {
    eligibility: false,
    benefits: false,
    preAuth: false,
    claims: false,
    webhooks: false,
  };

  constructor(protected readonly mock: MockHmoAdapter) {}

  protected notLive<T extends { sourceAdapter: string }>(
    result: T,
    note: string,
  ): T {
    return { ...result, sourceAdapter: this.adapterKey, notes: note } as T;
  }

  async verifyEligibility(input: EligibilityInput): Promise<EligibilityResult> {
    const r = await this.mock.verifyEligibility(input);
    return {
      ...r,
      sourceAdapter: this.adapterKey,
      raw: {
        ...(typeof r.raw === 'object' && r.raw ? r.raw : {}),
        pendingDirect: true,
        hmo: this.displayName,
        message: `${this.displayName} direct API pending — using sandbox simulation`,
      },
    };
  }

  async getBenefits(input: BenefitsInput): Promise<BenefitsResult> {
    const r = await this.mock.getBenefits(input);
    return { ...r, sourceAdapter: this.adapterKey };
  }

  async requestPreAuth(input: PreAuthInput): Promise<PreAuthResult> {
    const r = await this.mock.requestPreAuth(input);
    return {
      ...r,
      sourceAdapter: this.adapterKey,
      notes: r.notes
        ? `${r.notes} (${this.displayName} direct pending)`
        : `${this.displayName} direct API pending`,
    };
  }

  async submitClaim(input: ClaimSubmitInput): Promise<ClaimSubmitResult> {
    const r = await this.mock.submitClaim(input);
    return { ...r, sourceAdapter: this.adapterKey };
  }

  async getClaimStatus(externalRef: string): Promise<ClaimStatusResult> {
    const r = await this.mock.getClaimStatus(externalRef);
    return { ...r, sourceAdapter: this.adapterKey };
  }
}

@Injectable()
export class HygeiaAdapter extends PendingDirectAdapter {
  readonly adapterKey = 'hygeia';
  readonly displayName = 'Hygeia HMO';
}

@Injectable()
export class AxaMansardAdapter extends PendingDirectAdapter {
  readonly adapterKey = 'axa_mansard';
  readonly displayName = 'AXA Mansard Health';
}

@Injectable()
export class RelianceAdapter extends PendingDirectAdapter {
  readonly adapterKey = 'reliance';
  readonly displayName = 'Reliance Health';
}

@Injectable()
export class ThtAdapter extends PendingDirectAdapter {
  readonly adapterKey = 'tht';
  readonly displayName = 'Total Health Trust';
}

@Injectable()
export class AiicoAdapter extends PendingDirectAdapter {
  readonly adapterKey = 'aiico';
  readonly displayName = 'AIICO Multishield';
}

export const DEFAULT_HMO_CHECKLIST = {
  contractSigned: false,
  credentialsInVault: false,
  eligibilityLive: false,
  benefitsLive: false,
  preAuthLive: false,
  claimsLive: false,
  webhooksLive: false,
  productionGoLive: false,
};
