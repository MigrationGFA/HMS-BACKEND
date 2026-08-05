/** Extensible chat module registry — add radiology later by extending this map. */
export const CHAT_MODULES = [
  'doctor',
  'laboratory',
  'pharmacy',
  'cashier',
  'records',
] as const;

export type ChatModuleId = (typeof CHAT_MODULES)[number];

export const CHAT_GROUPS = [
  'Nurses',
  'Laboratory',
  'Radiology',
  'Pharmacy',
  'Accounts',
  'Medical Records',
  'Management',
  'Psychology',
  'Social Work',
  'Nutrition',
  'Ward Team',
  'Emergency Unit',
  'Consultants',
  'NHIA/NHIS',
  'ICT Support',
] as const;

export type ChatGroup = (typeof CHAT_GROUPS)[number];

/** Map UI group labels → chat module id (department threads). */
export const GROUP_TO_CHAT_MODULE: Partial<Record<ChatGroup, ChatModuleId>> = {
  Nurses: 'doctor',
  Laboratory: 'laboratory',
  Pharmacy: 'pharmacy',
  Accounts: 'cashier',
  'Medical Records': 'records',
};

/** Map HMS roles → chat module scopes (for directory + room joins). */
export const ROLE_TO_CHAT_MODULES: Record<string, ChatModuleId[]> = {
  DOCTOR: ['doctor'],
  NURSE: ['doctor'],
  PSYCHIATRIC_OPC: ['doctor'],
  ICU: ['doctor'],
  LAB: ['laboratory'],
  LABORATORY: ['laboratory'],
  PHARMACY: ['pharmacy'],
  PHARMACIST: ['pharmacy'],
  CASHIER: ['cashier'],
  RECORDS: ['records'],
  ADMIN: ['doctor', 'laboratory', 'pharmacy', 'cashier', 'records'],
  SUPERADMIN: ['doctor', 'laboratory', 'pharmacy', 'cashier', 'records'],
  IT: ['doctor', 'laboratory', 'pharmacy', 'cashier', 'records'],
};

export function modulesForRoles(roles: string[]): ChatModuleId[] {
  const set = new Set<ChatModuleId>();
  for (const role of roles) {
    const mapped = ROLE_TO_CHAT_MODULES[role.toUpperCase()] ?? [];
    for (const m of mapped) set.add(m);
  }
  return [...set];
}

export function isChatModule(v: string): v is ChatModuleId {
  return (CHAT_MODULES as readonly string[]).includes(v);
}
