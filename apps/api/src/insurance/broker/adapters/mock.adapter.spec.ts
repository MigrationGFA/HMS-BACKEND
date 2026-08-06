import { MockHmoAdapter } from './mock.adapter';

describe('MockHmoAdapter', () => {
  const adapter = new MockHmoAdapter();

  it('returns ACTIVE eligibility for normal member numbers', async () => {
    const result = await adapter.verifyEligibility({
      personId: 1,
      payerId: 1,
      memberNo: 'MOCK-12345',
      firstName: 'Ada',
      lastName: 'Lovelace',
    });
    expect(result.status).toBe('ACTIVE');
    expect(result.sourceAdapter).toBe('mock');
    expect(result.plan.code).toBe('MOCK-GOLD');
    expect(result.member.fullName).toContain('Ada');
  });

  it('returns INACTIVE when memberNo ends with 000', async () => {
    const result = await adapter.verifyEligibility({
      personId: 1,
      payerId: 1,
      memberNo: 'HYG-000',
    });
    expect(result.status).toBe('INACTIVE');
  });

  it('returns benefits with coverage percents', async () => {
    const result = await adapter.getBenefits({
      personId: 1,
      payerId: 1,
      memberNo: 'MOCK-1',
    });
    expect(result.benefits.length).toBeGreaterThan(0);
    expect(result.sourceAdapter).toBe('mock');
  });

  it('approves pre-auth and returns an auth code', async () => {
    const result = await adapter.requestPreAuth({
      personId: 1,
      payerId: 1,
      memberNo: 'MOCK-1',
      diagnosisCodes: ['F20.0'],
      estimatedAmount: 50_000,
    });
    expect(result.status).toBe('APPROVED');
    expect(result.authCode).toBeTruthy();
  });

  it('accepts claim submission with external ref', async () => {
    const result = await adapter.submitClaim({
      personId: 1,
      payerId: 1,
      memberNo: 'MOCK-1',
      totalAmount: 10_000,
      diagnosisCodes: ['F20.0'],
      lines: [{ description: 'Consult', unitAmount: 10_000, quantity: 1 }],
    });
    expect(result.status).toBe('RECEIVED');
    expect(result.externalClaimRef).toBeTruthy();
  });
});
