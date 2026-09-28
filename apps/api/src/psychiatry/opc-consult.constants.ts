/** Stable MasterServices codes for psychiatric OPC consultation billing. */
export const OPC_CONSULT_SERVICE_CODES = [
  'SVC-OPC-CONSULT',
  'SVC-PSYCH-CONSULT',
] as const;

/** Prisma default when no ACTIVE master service is found. */
export const OPC_CONSULT_FALLBACK_AMOUNT = 7500;
