import { Injectable } from '@nestjs/common';
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
 * Phase 0 sandbox adapter — deterministic responses for UAT without live HMO.
 * Inactive when memberNo ends with "000" or starts with "INACTIVE".
 */
@Injectable()
export class MockHmoAdapter implements HmoAdapter {
  readonly adapterKey = 'mock';
  readonly capabilities = {
    eligibility: true,
    benefits: true,
    preAuth: true,
    claims: true,
    webhooks: false,
  };

  async verifyEligibility(input: EligibilityInput): Promise<EligibilityResult> {
    const inactive =
      input.memberNo.toUpperCase().startsWith('INACTIVE') ||
      input.memberNo.endsWith('000');
    const name =
      [input.firstName, input.lastName].filter(Boolean).join(' ') ||
      `Mock Member ${input.memberNo}`;
    return {
      status: inactive ? 'INACTIVE' : 'ACTIVE',
      member: {
        fullName: name,
        dob: input.dateOfBirth?.toISOString().slice(0, 10) ?? '1990-01-15',
        gender: null,
        photoUrl: null,
      },
      plan: {
        code: 'MOCK-GOLD',
        name: 'Mock Gold Plan',
        employer: 'Mock Employer Ltd',
      },
      validFrom: new Date(new Date().getFullYear(), 0, 1).toISOString(),
      validTo: new Date(new Date().getFullYear(), 11, 31).toISOString(),
      externalRef: `MOCK-ELIG-${input.memberNo}`,
      sourceAdapter: this.adapterKey,
    };
  }

  async getBenefits(input: BenefitsInput): Promise<BenefitsResult> {
    const all: BenefitsResult['benefits'] = [
      {
        category: 'Consultation',
        name: 'General Consultation',
        coveragePercent: 100,
        covered: true,
        coPayPercent: 0,
      },
      {
        category: 'Laboratory',
        name: 'Routine Lab Panel',
        coveragePercent: 80,
        limitAmount: 150000,
        limitCurrency: 'NGN',
        covered: true,
        coPayPercent: 20,
      },
      {
        category: 'Pharmacy',
        name: 'Outpatient Drugs',
        coveragePercent: 70,
        limitAmount: 100000,
        limitCurrency: 'NGN',
        covered: true,
        coPayPercent: 30,
      },
      {
        category: 'Dental',
        name: 'Dental',
        coveragePercent: 50,
        limitAmount: 50000,
        limitCurrency: 'NGN',
        covered: true,
        coPayPercent: 50,
      },
      {
        category: 'Ward',
        name: 'Private Ward',
        coveragePercent: 0,
        covered: false,
        notes: 'Not covered on Mock Gold',
      },
      {
        category: 'Admission',
        name: 'Surgical Admission',
        coveragePercent: 90,
        covered: true,
        coPayPercent: 10,
        notes: 'Pre-authorization required',
      },
    ];
    const filtered = input.serviceCode
      ? all.filter(
          (b) =>
            b.serviceCode === input.serviceCode ||
            b.category.toLowerCase().includes(input.serviceCode!.toLowerCase()) ||
            b.name.toLowerCase().includes(input.serviceCode!.toLowerCase()),
        )
      : input.category
        ? all.filter((b) => b.category.toLowerCase() === input.category!.toLowerCase())
        : all;

    return {
      planCode: 'MOCK-GOLD',
      planName: 'Mock Gold Plan',
      benefits: filtered.length ? filtered : all,
      exclusions: ['Cosmetic surgery', 'Experimental therapy', 'Private Ward'],
      sourceAdapter: this.adapterKey,
      fetchedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    };
  }

  async requestPreAuth(input: PreAuthInput): Promise<PreAuthResult> {
    const highCost = (input.estimatedAmount ?? 0) > 500000;
    if (input.diagnosisCodes.some((c) => c.toUpperCase().startsWith('DENY'))) {
      return {
        status: 'DENIED',
        authCode: null,
        approvedAmount: 0,
        notes: 'Mock denial — diagnosis flagged',
        sourceAdapter: this.adapterKey,
      };
    }
    if (highCost) {
      return {
        status: 'PENDING',
        authCode: null,
        approvedAmount: null,
        externalRef: `MOCK-PA-PEND-${Date.now()}`,
        notes: 'Pending manual review (amount > ₦500,000)',
        sourceAdapter: this.adapterKey,
      };
    }
    const code = `MOCK-AUTH-${Date.now().toString(36).toUpperCase()}`;
    return {
      status: 'APPROVED',
      authCode: code,
      approvedAmount: input.estimatedAmount ?? null,
      validUntil: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
      externalRef: code,
      sourceAdapter: this.adapterKey,
    };
  }

  async submitClaim(input: ClaimSubmitInput): Promise<ClaimSubmitResult> {
    if (!input.diagnosisCodes?.length) {
      return {
        status: 'REJECTED',
        validationErrors: ['Missing Diagnosis Code'],
        sourceAdapter: this.adapterKey,
      };
    }
    if (!input.lines?.length) {
      return {
        status: 'REJECTED',
        validationErrors: ['Claim must include at least one line'],
        sourceAdapter: this.adapterKey,
      };
    }
    return {
      status: 'RECEIVED',
      externalClaimRef: `MOCK-CLM-${Date.now()}`,
      sourceAdapter: this.adapterKey,
    };
  }

  async getClaimStatus(externalRef: string): Promise<ClaimStatusResult> {
    return {
      status: 'RECEIVED',
      externalClaimRef: externalRef,
      message: 'Mock claim awaiting adjudication',
      sourceAdapter: this.adapterKey,
    };
  }
}
