import { ROLES, type RoleName } from './roles.constants';

/**
 * Granular permissions. Every guarded endpoint declares one of these via
 * @RequirePermissions(); the PermissionsGuard resolves the caller's role(s)
 * to permissions using ROLE_PERMISSIONS below.
 */
export const PERMISSIONS = {
  // Patients (PERSONS)
  PATIENT_CREATE: 'patient:create',
  PATIENT_READ: 'patient:read',
  PATIENT_UPDATE: 'patient:update',

  // Registration cards (PATIENT_CARDS)
  CARD_CREATE: 'card:create',
  CARD_READ: 'card:read',
  CARD_CONFIRM_PAYMENT: 'card:confirm-payment',

  // Triage
  TRIAGE_CREATE: 'triage:create',
  TRIAGE_READ: 'triage:read',
  TRIAGE_UPDATE: 'triage:update',

  // Clinical prescriptions
  PRESCRIPTION_CREATE: 'prescription:create',
  PRESCRIPTION_READ: 'prescription:read',
  PRESCRIPTION_UPDATE: 'prescription:update',

  // Pharmacy (suppliers, drugs, procurement, inventory)
  PHARMACY_READ: 'pharmacy:read',
  SUPPLIER_CREATE: 'supplier:create',
  SUPPLIER_UPDATE: 'supplier:update',
  DRUG_CREATE: 'drug:create',
  DRUG_UPDATE: 'drug:update',
  PROCUREMENT_CREATE: 'procurement:create',
  PROCUREMENT_APPROVE: 'procurement:approve',
  STOCK_RECEIVE: 'stock:receive',
  STOCK_ADJUST: 'stock:adjust',
  PHARMACY_DISPENSE: 'pharmacy:dispense',
  /** Walk-in / OTC sales (request → cashier pay → dispense) */
  PHARMACY_SALE_CREATE: 'pharmacy:sale-create',
  PHARMACY_SALE_READ: 'pharmacy:sale-read',
  PHARMACY_SALE_PAY: 'pharmacy:sale-pay',

  // Audit
  AUDIT_READ: 'audit:read',

  // Identity (staff user lookup — no password/credential access)
  USER_READ: 'user:read',
} as const;

export type PermissionName = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

const FULL_ACCESS: PermissionName[] = Object.values(PERMISSIONS);

/**
 * Standard front-desk Records Officer (Health Records / Medical Records
 * front desk) permission set for a typical HMS:
 * - register + search + update patient demographics
 * - open registration cards (payment stays Pending until cashier confirms)
 * - send patients to triage and view the queue
 * - read audit trail of registration activity
 * - look up staff users (identity search) — no role/credential management
 */
const RECORDS_PERMISSIONS: PermissionName[] = [
  PERMISSIONS.PATIENT_CREATE,
  PERMISSIONS.PATIENT_READ,
  PERMISSIONS.PATIENT_UPDATE,
  PERMISSIONS.CARD_CREATE,
  PERMISSIONS.CARD_READ,
  PERMISSIONS.TRIAGE_CREATE,
  PERMISSIONS.TRIAGE_READ,
  PERMISSIONS.AUDIT_READ,
  PERMISSIONS.USER_READ,
];

const CASHIER_PERMISSIONS: PermissionName[] = [
  PERMISSIONS.PATIENT_READ,
  PERMISSIONS.CARD_READ,
  PERMISSIONS.CARD_CONFIRM_PAYMENT,
  PERMISSIONS.PHARMACY_SALE_READ,
  PERMISSIONS.PHARMACY_SALE_PAY,
  PERMISSIONS.AUDIT_READ,
];

/**
 * Pharmacist permission set: full pharmacy operations (suppliers, drugs,
 * procurement, stock receiving/adjustment) plus patient lookup and the
 * pharmacy audit trail.
 */
const PHARMACY_PERMISSIONS: PermissionName[] = [
  PERMISSIONS.PATIENT_READ,
  PERMISSIONS.PHARMACY_READ,
  PERMISSIONS.PRESCRIPTION_READ,
  PERMISSIONS.PRESCRIPTION_UPDATE,
  PERMISSIONS.SUPPLIER_CREATE,
  PERMISSIONS.SUPPLIER_UPDATE,
  PERMISSIONS.DRUG_CREATE,
  PERMISSIONS.DRUG_UPDATE,
  PERMISSIONS.PROCUREMENT_CREATE,
  PERMISSIONS.PROCUREMENT_APPROVE,
  PERMISSIONS.STOCK_RECEIVE,
  PERMISSIONS.STOCK_ADJUST,
  PERMISSIONS.PHARMACY_DISPENSE,
  PERMISSIONS.PHARMACY_SALE_CREATE,
  PERMISSIONS.PHARMACY_SALE_READ,
  PERMISSIONS.AUDIT_READ,
];

const CLINICAL_READ_PERMISSIONS: PermissionName[] = [
  PERMISSIONS.PATIENT_READ,
  PERMISSIONS.TRIAGE_READ,
  PERMISSIONS.PRESCRIPTION_READ,
  /** Doctors need catalog lookup while building prescriptions. */
  PERMISSIONS.PHARMACY_READ,
];

const CLINICAL_PERMISSIONS: PermissionName[] = [
  ...CLINICAL_READ_PERMISSIONS,
  PERMISSIONS.PATIENT_UPDATE,
  PERMISSIONS.TRIAGE_CREATE,
  PERMISSIONS.TRIAGE_UPDATE,
  PERMISSIONS.PRESCRIPTION_CREATE,
  PERMISSIONS.PRESCRIPTION_UPDATE,
];

/**
 * Role → permissions map. Roles not listed here have no guarded-endpoint
 * access beyond plain authentication.
 */
export const ROLE_PERMISSIONS: Partial<Record<RoleName, PermissionName[]>> = {
  [ROLES.SUPER_ADMIN]: FULL_ACCESS,
  [ROLES.ADMIN]: FULL_ACCESS,
  [ROLES.CMD]: FULL_ACCESS,
  [ROLES.IT]: FULL_ACCESS,

  [ROLES.RECORDS]: RECORDS_PERMISSIONS,
  [ROLES.CASHIER]: CASHIER_PERMISSIONS,
  [ROLES.FINANCE]: [
    PERMISSIONS.PATIENT_READ,
    PERMISSIONS.CARD_READ,
    PERMISSIONS.CARD_CONFIRM_PAYMENT,
    PERMISSIONS.PHARMACY_SALE_READ,
    PERMISSIONS.PHARMACY_SALE_PAY,
    PERMISSIONS.AUDIT_READ,
  ],

  [ROLES.DOCTOR]: CLINICAL_PERMISSIONS,
  [ROLES.NURSE]: CLINICAL_PERMISSIONS,
  [ROLES.PSYCHIATRIC_OPC]: CLINICAL_PERMISSIONS,
  [ROLES.PSYCHOLOGY]: CLINICAL_READ_PERMISSIONS,
  [ROLES.CHILD_ADOLESCENT]: CLINICAL_READ_PERMISSIONS,
  [ROLES.ADDICTION_REHAB]: CLINICAL_READ_PERMISSIONS,
  [ROLES.PSYCHOGERIATRICS]: CLINICAL_READ_PERMISSIONS,
  [ROLES.PHYSIOTHERAPY]: CLINICAL_READ_PERMISSIONS,
  [ROLES.SPEECH_THERAPY]: CLINICAL_READ_PERMISSIONS,
  [ROLES.NUTRITION]: CLINICAL_READ_PERMISSIONS,
  [ROLES.SOCIAL_WORK]: CLINICAL_READ_PERMISSIONS,
  [ROLES.ICU]: CLINICAL_PERMISSIONS,
  [ROLES.LAB]: [PERMISSIONS.PATIENT_READ],
  [ROLES.RADIOLOGY]: [PERMISSIONS.PATIENT_READ],
  [ROLES.PHARMACIST]: PHARMACY_PERMISSIONS,
};

export function permissionsForRoles(roles: string[]): Set<PermissionName> {
  const granted = new Set<PermissionName>();
  for (const role of roles) {
    const perms = ROLE_PERMISSIONS[role as RoleName];
    if (perms) {
      for (const p of perms) granted.add(p);
    }
  }
  return granted;
}
