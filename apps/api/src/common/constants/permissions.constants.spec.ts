import {
  PERMISSIONS,
  normalizeRoleName,
  permissionsForRoles,
} from './permissions.constants';
import { ROLES } from './roles.constants';

describe('permissionsForRoles / normalizeRoleName', () => {
  const requiredRecordsReads = [
    PERMISSIONS.PATIENT_READ,
    PERMISSIONS.CARD_READ,
    PERMISSIONS.REFERRAL_READ,
    PERMISSIONS.ADMISSION_READ,
    PERMISSIONS.DISCHARGE_READ,
    PERMISSIONS.RECORDS_FILE_READ,
    PERMISSIONS.RECORDS_ARCHIVE_READ,
    PERMISSIONS.COMMS_READ,
    PERMISSIONS.TRANSFER_RECEIVE,
  ] as const;

  it('maps RECORDS to the full records permission set including transfer:receive', () => {
    const granted = permissionsForRoles([ROLES.RECORDS]);
    for (const p of requiredRecordsReads) {
      expect(granted.has(p)).toBe(true);
    }
  });

  it.each([
    'RECORD OFFICER',
    'Record Officer',
    'RECORD_OFFICER',
    'record_officer',
    'RECORD ADMIN',
    'Record Admin',
    'RECORD_ADMIN',
    'RECORD STATISTICAL OFFICER',
    'CLINICAL CODING AND INDEXING',
  ])('aliases production label "%s" to RECORDS permissions', (label) => {
    expect(normalizeRoleName(label)).toBe(ROLES.RECORDS);
    const granted = permissionsForRoles([label]);
    for (const p of requiredRecordsReads) {
      expect(granted.has(p)).toBe(true);
    }
  });

  it('returns empty set for unmapped roles', () => {
    const granted = permissionsForRoles(['STAFF', 'UNKNOWN_ROLE', 'RESEARCH']);
    expect(granted.size).toBe(0);
  });

  it('unions permissions across multiple roles', () => {
    const granted = permissionsForRoles(['RECORD OFFICER', 'CASHIER']);
    expect(granted.has(PERMISSIONS.PATIENT_READ)).toBe(true);
    expect(granted.has(PERMISSIONS.CARD_CONFIRM_PAYMENT)).toBe(true);
  });

  it('maps CMD Role and NURSE ADMIN via aliases', () => {
    expect(normalizeRoleName('CMD Role')).toBe(ROLES.CMD);
    expect(normalizeRoleName('NURSE ADMIN')).toBe(ROLES.NURSE);
    expect(permissionsForRoles(['CMD Role']).size).toBeGreaterThan(0);
  });
});
