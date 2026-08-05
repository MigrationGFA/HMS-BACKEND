/** Stable MasterServices codes for first-time patient registration charges. */
export const REGISTRATION_CHARGE_CODES = {
  REG_FEE: 'SVC-REG-FEE',
  CARD_FEE: 'SVC-CARD-FEE',
  CONSULT_FEE: 'SVC-REG-CONSULT',
} as const;

export type RegistrationChargeField = 'regFee' | 'cardFee' | 'consultFee';

export type RegistrationChargeDefinition = {
  code: string;
  field: RegistrationChargeField;
  label: string;
};

export const REGISTRATION_CHARGE_DEFINITIONS: RegistrationChargeDefinition[] = [
  {
    code: REGISTRATION_CHARGE_CODES.REG_FEE,
    field: 'regFee',
    label: 'Registration Fee',
  },
  {
    code: REGISTRATION_CHARGE_CODES.CARD_FEE,
    field: 'cardFee',
    label: 'Card Fee',
  },
  {
    code: REGISTRATION_CHARGE_CODES.CONSULT_FEE,
    field: 'consultFee',
    label: 'Consultation Fee',
  },
];

export type RegistrationChargesResult = {
  regFee: number;
  cardFee: number;
  consultFee: number;
  total: number;
  items: Array<{
    code: string;
    label: string;
    amount: number;
    serviceId: number;
    source: string;
  }>;
};
