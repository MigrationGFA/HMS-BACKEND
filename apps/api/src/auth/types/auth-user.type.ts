export interface AuthUser {
  id: number;
  email: string;
  phone: string | null;
  firstName: string | null;
  lastName: string | null;
  roles: string[];
  /** True when GENERATE_PIN = Y (migrated staff must reset temporary PIN). */
  mustResetPassword: boolean;
  /**
   * USERS.PERSON_ID — links a staff/patient account to a PERSONS record.
   * Required (non-null) for the PATIENT-portal role (ADR-HR-D5); null for
   * most staff accounts that are not also registered patients.
   */
  personId: number | null;
}
