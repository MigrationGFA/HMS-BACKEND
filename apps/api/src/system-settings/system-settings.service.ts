import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../auth/types/auth-user.type';

export type ModuleStatus = 'released' | 'existing_hidden' | 'future';

export const PHASE_MODULES_KEY = 'phase_modules';

export const PHASE1_MODULE_DEFAULTS: Record<string, ModuleStatus> = {
  public_site: 'released',
  booking: 'released',
  patient: 'released',
  doctor: 'released',
  doctor_demos: 'existing_hidden',
  records_frontdesk: 'released',
  accounts_cashier: 'released',
  accounts_finance: 'released',
  hr: 'released',
  hr_extended: 'existing_hidden',
  admin_users: 'released',
  admin_cms: 'released',
  admin_audit: 'released',
  admin_modules: 'released',
  admin_demos: 'existing_hidden',
  lab: 'existing_hidden',
  pharmacy: 'existing_hidden',
  nursing: 'existing_hidden',
  radiology: 'existing_hidden',
  fleet: 'existing_hidden',
  stores: 'existing_hidden',
  scm: 'existing_hidden',
  nutrition: 'existing_hidden',
  psych_opc: 'existing_hidden',
  icu: 'existing_hidden',
  staff_generic: 'existing_hidden',
  student: 'existing_hidden',
  billing_mega: 'existing_hidden',
  hms_identity: 'existing_hidden',
};

const ALLOWED_STATUSES = new Set<ModuleStatus>([
  'released',
  'existing_hidden',
  'future',
]);

@Injectable()
export class SystemSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async getPhaseModules(): Promise<{
    modules: Record<string, ModuleStatus>;
    source: 'db' | 'defaults';
    updatedAt: Date | null;
    updatedBy: string | null;
  }> {
    const row = await this.prisma.systemSetting.findUnique({
      where: { SETTING_KEY: PHASE_MODULES_KEY },
    });
    if (!row) {
      return {
        modules: { ...PHASE1_MODULE_DEFAULTS },
        source: 'defaults',
        updatedAt: null,
        updatedBy: null,
      };
    }
    const stored = (row.SETTING_VALUE ?? {}) as Record<string, string>;
    const modules: Record<string, ModuleStatus> = { ...PHASE1_MODULE_DEFAULTS };
    for (const [k, v] of Object.entries(stored)) {
      if (ALLOWED_STATUSES.has(v as ModuleStatus)) {
        modules[k] = v as ModuleStatus;
      }
    }
    return {
      modules,
      source: 'db',
      updatedAt: row.UPDATED_AT,
      updatedBy: row.UPDATED_BY,
    };
  }

  async patchPhaseModules(
    patch: Record<string, string>,
    user: AuthUser,
  ): Promise<{ modules: Record<string, ModuleStatus> }> {
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
      throw new BadRequestException('modules must be an object');
    }

    const current = await this.getPhaseModules();
    const next: Record<string, ModuleStatus> = { ...current.modules };

    for (const [key, value] of Object.entries(patch)) {
      if (!(key in PHASE1_MODULE_DEFAULTS) && !(key in next)) {
        throw new BadRequestException(`Unknown module id: ${key}`);
      }
      if (!ALLOWED_STATUSES.has(value as ModuleStatus)) {
        throw new BadRequestException(
          `Invalid status for ${key}: ${value}. Use released | existing_hidden | future`,
        );
      }
      next[key] = value as ModuleStatus;
    }

    await this.prisma.systemSetting.upsert({
      where: { SETTING_KEY: PHASE_MODULES_KEY },
      create: {
        SETTING_KEY: PHASE_MODULES_KEY,
        SETTING_VALUE: next as unknown as Prisma.InputJsonValue,
        UPDATED_BY: user.email ?? String(user.id),
      },
      update: {
        SETTING_VALUE: next as unknown as Prisma.InputJsonValue,
        UPDATED_BY: user.email ?? String(user.id),
      },
    });

    await this.audit.log({
      type: 'system:phase-modules-update',
      entity: 'SYSTEM_SETTINGS',
      entityId: PHASE_MODULES_KEY,
      userId: user.id,
      createdBy: user.email ?? String(user.id),
      oldValue: current.modules,
      newValue: next,
    });

    return { modules: next };
  }

  async getSetting(key: string): Promise<unknown> {
    const row = await this.prisma.systemSetting.findUnique({
      where: { SETTING_KEY: key },
    });
    if (!row) throw new NotFoundException(`Setting not found: ${key}`);
    return row.SETTING_VALUE;
  }
}
