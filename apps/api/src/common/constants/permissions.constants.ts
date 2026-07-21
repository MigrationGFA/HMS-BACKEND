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

  // Admissions / wards / beds (Abdul-Azeez)
  ADMISSION_CREATE: 'admission:create',
  ADMISSION_READ: 'admission:read',
  ADMISSION_UPDATE: 'admission:update',
  /** Cashier confirm payment for admission package bills */
  ADMISSION_PAY: 'admission:pay',

  // Nursing ward documentation (Abdul-Azeez)
  NURSING_NOTE_CREATE: 'nursing-note:create',
  NURSING_NOTE_READ: 'nursing-note:read',
  NURSING_VITAL_CREATE: 'nursing-vital:create',
  NURSING_VITAL_READ: 'nursing-vital:read',
  NURSING_CARE_PLAN_CREATE: 'nursing-care-plan:create',
  NURSING_CARE_PLAN_READ: 'nursing-care-plan:read',
  NURSING_CARE_PLAN_UPDATE: 'nursing-care-plan:update',
  NURSING_OBS_CREATE: 'nursing-observation:create',
  NURSING_OBS_READ: 'nursing-observation:read',
  NURSING_INCIDENT_CREATE: 'nursing-incident:create',
  NURSING_INCIDENT_READ: 'nursing-incident:read',
  NURSING_INCIDENT_UPDATE: 'nursing-incident:update',
  NURSING_FORM_CREATE: 'nursing-form:create',
  NURSING_FORM_READ: 'nursing-form:read',

  // Nursing ops (Phases 10–12) (Abdul-Azeez)
  NURSING_ORDER_CREATE: 'nursing-order:create',
  NURSING_ORDER_READ: 'nursing-order:read',
  NURSING_ORDER_UPDATE: 'nursing-order:update',
  NURSING_TASK_CREATE: 'nursing-task:create',
  NURSING_TASK_READ: 'nursing-task:read',
  NURSING_TASK_UPDATE: 'nursing-task:update',
  NURSING_MAR_CREATE: 'nursing-mar:create',
  NURSING_MAR_READ: 'nursing-mar:read',
  NURSING_MAR_UPDATE: 'nursing-mar:update',
  NURSING_SAMPLE_READ: 'nursing-sample:read',
  NURSING_SAMPLE_UPDATE: 'nursing-sample:update',
  NURSING_SHIFT_CREATE: 'nursing-shift:create',
  NURSING_SHIFT_READ: 'nursing-shift:read',
  NURSING_SHIFT_UPDATE: 'nursing-shift:update',
  NURSING_HANDOVER_CREATE: 'nursing-handover:create',
  NURSING_HANDOVER_READ: 'nursing-handover:read',
  NURSING_HANDOVER_UPDATE: 'nursing-handover:update',
  NURSING_ICU_CREATE: 'nursing-icu:create',
  NURSING_ICU_READ: 'nursing-icu:read',
  NURSING_ICU_UPDATE: 'nursing-icu:update',
  NURSING_COMMS_CREATE: 'nursing-comms:create',
  NURSING_COMMS_READ: 'nursing-comms:read',
  NURSING_COMMS_UPDATE: 'nursing-comms:update',
  NURSING_REPORT_CREATE: 'nursing-report:create',
  NURSING_REPORT_READ: 'nursing-report:read',
  NURSING_ANALYTICS_READ: 'nursing-analytics:read',

  // Doctor consultation encounters (main)
  ENCOUNTER_CREATE: 'encounter:create',
  ENCOUNTER_READ: 'encounter:read',
  ENCOUNTER_UPDATE: 'encounter:update',
  ENCOUNTER_COMPLETE: 'encounter:complete',

  // Clinical documentation notes
  CLINICAL_NOTE_CREATE: 'clinical-note:create',
  CLINICAL_NOTE_READ: 'clinical-note:read',
  CLINICAL_NOTE_UPDATE: 'clinical-note:update',
  CLINICAL_NOTE_SIGN: 'clinical-note:sign',
  CLINICAL_NOTE_REVIEW: 'clinical-note:review',

  // Structured diagnoses (ICD catalog + patient problem list)
  DIAGNOSIS_CREATE: 'diagnosis:create',
  DIAGNOSIS_READ: 'diagnosis:read',
  DIAGNOSIS_UPDATE: 'diagnosis:update',

  // Clinical prescriptions
  PRESCRIPTION_CREATE: 'prescription:create',
  PRESCRIPTION_READ: 'prescription:read',
  PRESCRIPTION_UPDATE: 'prescription:update',
  /** Cashier/billing confirm payment for doctor prescriptions */
  PRESCRIPTION_PAY: 'prescription:pay',

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
  /** Return of already-dispensed drugs */
  PHARMACY_RETURN_CREATE: 'pharmacy:return-create',
  PHARMACY_RETURN_READ: 'pharmacy:return-read',
  /** Update hospital-level pharmacy thresholds / alert settings */
  PHARMACY_SETTINGS_UPDATE: 'pharmacy:settings-update',

  // Laboratory (catalog + doctor requests; cashier confirms payment)
  LAB_READ: 'lab:read',
  LAB_CREATE: 'lab:create',
  LAB_UPDATE: 'lab:update',
  /** Cashier/billing confirm payment for lab requests */
  LAB_PAY: 'lab:pay',
  /** Manage lab result templates (create/edit/deactivate) */
  LAB_TEMPLATE_MANAGE: 'lab:template-manage',
  /** Collect / reject specimens for paid lab requests */
  LAB_COLLECT: 'lab:collect',
  /** Enter / submit lab results */
  LAB_RESULT: 'lab:result',
  /** Validate, return or amend lab results */
  LAB_VALIDATE: 'lab:validate',

  // Imaging / radiology (catalog + doctor requests; cashier confirms payment)
  IMAGING_READ: 'imaging:read',
  IMAGING_CREATE: 'imaging:create',
  IMAGING_UPDATE: 'imaging:update',
  /** Cashier/billing confirm payment for imaging requests */
  IMAGING_PAY: 'imaging:pay',

  // Patient transfers (doctor request → nurse/records allocate → receive)
  TRANSFER_CREATE: 'transfer:create',
  TRANSFER_READ: 'transfer:read',
  TRANSFER_UPDATE: 'transfer:update',
  TRANSFER_ALLOCATE: 'transfer:allocate',
  TRANSFER_RECEIVE: 'transfer:receive',

  // In-app notifications inbox
  NOTIFICATION_READ: 'notification:read',

  // Clinical referrals (doctor → Records/Nurse → department attend or admit)
  REFERRAL_CREATE: 'referral:create',
  REFERRAL_READ: 'referral:read',
  REFERRAL_UPDATE: 'referral:update',
  REFERRAL_ALLOCATE: 'referral:allocate',
  REFERRAL_RECEIVE: 'referral:receive',

  // Discharge drafts (doctor → cashier clearance → Records finalize)
  DISCHARGE_CREATE: 'discharge:create',
  DISCHARGE_READ: 'discharge:read',
  DISCHARGE_UPDATE: 'discharge:update',
  DISCHARGE_CLEAR_PAYMENT: 'discharge:clear-payment',
  DISCHARGE_FINALIZE: 'discharge:finalize',

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
  PERMISSIONS.TRIAGE_UPDATE,
  PERMISSIONS.ENCOUNTER_READ,
  PERMISSIONS.ADMISSION_READ,
  PERMISSIONS.ADMISSION_CREATE,
  PERMISSIONS.ADMISSION_UPDATE,
  PERMISSIONS.TRANSFER_READ,
  PERMISSIONS.TRANSFER_UPDATE,
  PERMISSIONS.TRANSFER_ALLOCATE,
  PERMISSIONS.NOTIFICATION_READ,
  PERMISSIONS.REFERRAL_READ,
  PERMISSIONS.REFERRAL_UPDATE,
  PERMISSIONS.REFERRAL_ALLOCATE,
  PERMISSIONS.DISCHARGE_READ,
  PERMISSIONS.DISCHARGE_UPDATE,
  PERMISSIONS.DISCHARGE_FINALIZE,
  PERMISSIONS.AUDIT_READ,
  PERMISSIONS.USER_READ,
];

const CASHIER_PERMISSIONS: PermissionName[] = [
  PERMISSIONS.PATIENT_READ,
  PERMISSIONS.CARD_READ,
  PERMISSIONS.CARD_CONFIRM_PAYMENT,
  PERMISSIONS.PRESCRIPTION_READ,
  PERMISSIONS.PRESCRIPTION_PAY,
  PERMISSIONS.PHARMACY_SALE_READ,
  PERMISSIONS.PHARMACY_SALE_PAY,
  PERMISSIONS.LAB_READ,
  PERMISSIONS.LAB_PAY,
  PERMISSIONS.IMAGING_READ,
  PERMISSIONS.IMAGING_PAY,
  PERMISSIONS.ADMISSION_READ,
  PERMISSIONS.ADMISSION_PAY,
  PERMISSIONS.DISCHARGE_READ,
  PERMISSIONS.DISCHARGE_CLEAR_PAYMENT,
  PERMISSIONS.NOTIFICATION_READ,
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
  PERMISSIONS.PHARMACY_RETURN_CREATE,
  PERMISSIONS.PHARMACY_RETURN_READ,
  PERMISSIONS.PHARMACY_SETTINGS_UPDATE,
  PERMISSIONS.AUDIT_READ,
];

// Combined read permissions for clinical roles (both nursing and encounters)
const CLINICAL_READ_PERMISSIONS: PermissionName[] = [
  PERMISSIONS.PATIENT_READ,
  PERMISSIONS.TRIAGE_READ,
  // Nursing read permissions (Abdul-Azeez)
  PERMISSIONS.ADMISSION_READ,
  PERMISSIONS.NURSING_NOTE_READ,
  PERMISSIONS.NURSING_VITAL_READ,
  PERMISSIONS.NURSING_CARE_PLAN_READ,
  PERMISSIONS.NURSING_OBS_READ,
  PERMISSIONS.NURSING_INCIDENT_READ,
  PERMISSIONS.NURSING_FORM_READ,
  PERMISSIONS.NURSING_ORDER_READ,
  PERMISSIONS.NURSING_TASK_READ,
  PERMISSIONS.NURSING_MAR_READ,
  PERMISSIONS.NURSING_SAMPLE_READ,
  PERMISSIONS.NURSING_SHIFT_READ,
  PERMISSIONS.NURSING_HANDOVER_READ,
  PERMISSIONS.NURSING_ICU_READ,
  PERMISSIONS.NURSING_COMMS_READ,
  PERMISSIONS.NURSING_REPORT_READ,
  PERMISSIONS.NURSING_ANALYTICS_READ,
  // Encounter read (main)
  PERMISSIONS.ENCOUNTER_READ,
  PERMISSIONS.CLINICAL_NOTE_READ,
  PERMISSIONS.DIAGNOSIS_READ,
  PERMISSIONS.PRESCRIPTION_READ,
  /** Doctors need catalog lookup while building prescriptions. */
  PERMISSIONS.PHARMACY_READ,
  /** Doctors need lab catalog while building lab requests. */
  PERMISSIONS.LAB_READ,
  /** Doctors need imaging catalog while building imaging requests. */
  PERMISSIONS.IMAGING_READ,
  PERMISSIONS.TRANSFER_READ,
  PERMISSIONS.NOTIFICATION_READ,
  PERMISSIONS.REFERRAL_READ,
  PERMISSIONS.REFERRAL_RECEIVE,
];

// Full clinical permissions (read + write for nursing and encounters)
const CLINICAL_PERMISSIONS: PermissionName[] = [
  ...CLINICAL_READ_PERMISSIONS,
  PERMISSIONS.PATIENT_UPDATE,
  PERMISSIONS.TRIAGE_CREATE,
  PERMISSIONS.TRIAGE_UPDATE,
  // Nursing write permissions (Abdul-Azeez)
  PERMISSIONS.ADMISSION_CREATE,
  PERMISSIONS.ADMISSION_UPDATE,
  PERMISSIONS.NURSING_NOTE_CREATE,
  PERMISSIONS.NURSING_VITAL_CREATE,
  PERMISSIONS.NURSING_CARE_PLAN_CREATE,
  PERMISSIONS.NURSING_CARE_PLAN_UPDATE,
  PERMISSIONS.NURSING_OBS_CREATE,
  PERMISSIONS.NURSING_INCIDENT_CREATE,
  PERMISSIONS.NURSING_INCIDENT_UPDATE,
  PERMISSIONS.NURSING_FORM_CREATE,
  PERMISSIONS.NURSING_ORDER_CREATE,
  PERMISSIONS.NURSING_ORDER_UPDATE,
  PERMISSIONS.NURSING_TASK_CREATE,
  PERMISSIONS.NURSING_TASK_UPDATE,
  PERMISSIONS.NURSING_MAR_CREATE,
  PERMISSIONS.NURSING_MAR_UPDATE,
  PERMISSIONS.NURSING_SAMPLE_UPDATE,
  PERMISSIONS.NURSING_SHIFT_CREATE,
  PERMISSIONS.NURSING_SHIFT_UPDATE,
  PERMISSIONS.NURSING_HANDOVER_CREATE,
  PERMISSIONS.NURSING_HANDOVER_UPDATE,
  PERMISSIONS.NURSING_ICU_CREATE,
  PERMISSIONS.NURSING_ICU_UPDATE,
  PERMISSIONS.NURSING_COMMS_CREATE,
  PERMISSIONS.NURSING_COMMS_UPDATE,
  PERMISSIONS.NURSING_REPORT_CREATE,
  // Encounter write permissions (main)
  PERMISSIONS.ENCOUNTER_CREATE,
  PERMISSIONS.ENCOUNTER_UPDATE,
  PERMISSIONS.ENCOUNTER_COMPLETE,
  PERMISSIONS.CLINICAL_NOTE_CREATE,
  PERMISSIONS.CLINICAL_NOTE_UPDATE,
  PERMISSIONS.CLINICAL_NOTE_SIGN,
  PERMISSIONS.CLINICAL_NOTE_REVIEW,
  PERMISSIONS.DIAGNOSIS_CREATE,
  PERMISSIONS.DIAGNOSIS_UPDATE,
  PERMISSIONS.PRESCRIPTION_CREATE,
  PERMISSIONS.PRESCRIPTION_UPDATE,
  PERMISSIONS.LAB_CREATE,
  PERMISSIONS.LAB_UPDATE,
  /** Ward/clinic staff may collect specimens for paid lab requests. */
  PERMISSIONS.LAB_COLLECT,
  PERMISSIONS.IMAGING_CREATE,
  PERMISSIONS.IMAGING_UPDATE,
  PERMISSIONS.TRANSFER_CREATE,
  PERMISSIONS.TRANSFER_READ,
  PERMISSIONS.TRANSFER_UPDATE,
  PERMISSIONS.TRANSFER_ALLOCATE,
  PERMISSIONS.TRANSFER_RECEIVE,
  PERMISSIONS.NOTIFICATION_READ,
  PERMISSIONS.REFERRAL_CREATE,
  PERMISSIONS.REFERRAL_READ,
  PERMISSIONS.REFERRAL_UPDATE,
  PERMISSIONS.REFERRAL_ALLOCATE,
  PERMISSIONS.REFERRAL_RECEIVE,
  PERMISSIONS.DISCHARGE_CREATE,
  PERMISSIONS.DISCHARGE_READ,
  PERMISSIONS.DISCHARGE_UPDATE,
  PERMISSIONS.AUDIT_READ,
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
    PERMISSIONS.PRESCRIPTION_READ,
    PERMISSIONS.PRESCRIPTION_PAY,
    PERMISSIONS.PHARMACY_SALE_READ,
    PERMISSIONS.PHARMACY_SALE_PAY,
    PERMISSIONS.LAB_READ,
    PERMISSIONS.LAB_PAY,
    PERMISSIONS.IMAGING_READ,
    PERMISSIONS.IMAGING_PAY,
    PERMISSIONS.ADMISSION_READ,
    PERMISSIONS.ADMISSION_PAY,
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
  [ROLES.LAB]: [
    PERMISSIONS.PATIENT_READ,
    PERMISSIONS.LAB_READ,
    PERMISSIONS.LAB_CREATE,
    PERMISSIONS.LAB_UPDATE,
    PERMISSIONS.LAB_TEMPLATE_MANAGE,
    PERMISSIONS.LAB_COLLECT,
    PERMISSIONS.LAB_RESULT,
    PERMISSIONS.LAB_VALIDATE,
    PERMISSIONS.NURSING_ORDER_CREATE,
    PERMISSIONS.NURSING_ORDER_READ,
    PERMISSIONS.NURSING_SAMPLE_READ,
    PERMISSIONS.NURSING_SAMPLE_UPDATE,
  ],
  [ROLES.RADIOLOGY]: [
    PERMISSIONS.PATIENT_READ,
    PERMISSIONS.IMAGING_READ,
    PERMISSIONS.IMAGING_UPDATE,
    PERMISSIONS.NURSING_ORDER_CREATE,
    PERMISSIONS.NURSING_ORDER_READ,
    PERMISSIONS.NOTIFICATION_READ,
  ],
  [ROLES.PHARMACIST]: [
    ...PHARMACY_PERMISSIONS,
    PERMISSIONS.NOTIFICATION_READ,
  ],
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