/** Canonical HMO broker adapter contract — all payers implement this shape. */

export type AdapterCapabilities = {
  eligibility: boolean;
  benefits: boolean;
  preAuth: boolean;
  claims: boolean;
  webhooks: boolean;
};

export type EligibilityInput = {
  personId: number;
  payerId: number;
  memberNo: string;
  encounterId?: number;
  firstName?: string;
  lastName?: string;
  dateOfBirth?: Date | null;
};

export type EligibilityResult = {
  status: 'ACTIVE' | 'INACTIVE' | 'UNKNOWN' | 'ERROR';
  member: {
    fullName?: string;
    dob?: string | null;
    gender?: string | null;
    photoUrl?: string | null;
  };
  plan: {
    code?: string | null;
    name?: string | null;
    employer?: string | null;
  };
  validFrom?: string | null;
  validTo?: string | null;
  externalRef?: string | null;
  sourceAdapter: string;
  raw?: unknown;
};

export type BenefitsInput = {
  personId: number;
  payerId: number;
  memberNo: string;
  serviceCode?: string;
  category?: string;
};

export type BenefitItem = {
  serviceCode?: string;
  category: string;
  name: string;
  coveragePercent: number;
  limitAmount?: number | null;
  limitCurrency?: string;
  coPayPercent?: number;
  covered: boolean;
  notes?: string;
};

export type BenefitsResult = {
  planCode?: string | null;
  planName?: string | null;
  benefits: BenefitItem[];
  exclusions: string[];
  sourceAdapter: string;
  fetchedAt: string;
  expiresAt?: string | null;
  raw?: unknown;
};

export type PreAuthInput = {
  personId: number;
  payerId: number;
  memberNo: string;
  encounterId?: number;
  admissionId?: number;
  diagnosisCodes: string[];
  procedureCodes?: string[];
  serviceCodes?: string[];
  estimatedAmount?: number;
  notes?: string;
  idempotencyKey?: string;
  lines?: Array<{
    serviceCode?: string;
    description?: string;
    quantity?: number;
    unitAmount?: number;
  }>;
};

export type PreAuthResult = {
  status: 'APPROVED' | 'DENIED' | 'PENDING';
  authCode?: string | null;
  approvedAmount?: number | null;
  validUntil?: string | null;
  externalRef?: string | null;
  notes?: string | null;
  sourceAdapter: string;
  raw?: unknown;
};

export type ClaimLineInput = {
  serviceCode?: string;
  description?: string;
  quantity?: number;
  unitAmount?: number;
  payerAmount?: number;
  patientAmount?: number;
  billLineRef?: string;
};

export type ClaimSubmitInput = {
  personId: number;
  payerId: number;
  memberNo: string;
  authId?: number;
  encounterId?: number;
  admissionId?: number;
  totalAmount: number;
  payerAmount?: number;
  patientAmount?: number;
  diagnosisCodes?: string[];
  lines: ClaimLineInput[];
  idempotencyKey?: string;
};

export type ClaimSubmitResult = {
  status: 'RECEIVED' | 'REJECTED' | 'QUERIED';
  externalClaimRef?: string | null;
  validationErrors?: string[];
  sourceAdapter: string;
  raw?: unknown;
};

export type ClaimStatusResult = {
  status: string;
  externalClaimRef?: string | null;
  message?: string | null;
  sourceAdapter: string;
  raw?: unknown;
};

export interface HmoAdapter {
  readonly adapterKey: string;
  readonly capabilities: AdapterCapabilities;
  verifyEligibility(input: EligibilityInput): Promise<EligibilityResult>;
  getBenefits(input: BenefitsInput): Promise<BenefitsResult>;
  requestPreAuth(input: PreAuthInput): Promise<PreAuthResult>;
  submitClaim(input: ClaimSubmitInput): Promise<ClaimSubmitResult>;
  getClaimStatus(externalRef: string): Promise<ClaimStatusResult>;
}
