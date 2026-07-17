import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../auth/types/auth-user.type';
import { UpdatePharmacySettingsDto } from './dto/pharmacy-settings.dto';

export type PharmacySettingsResponse = {
  settingsId: number;
  defaultReorderLevel: number;
  expiringSoonDays: number;
  expiryCriticalDays: number;
  expiryWarningDays: number;
  receiveStockWarnDays: number;
  recentlyReceivedDays: number;
  controlledRequiresWitness: boolean;
  lowStockAlertEnabled: boolean;
  expiryAlertEnabled: boolean;
  updatedBy: string | null;
  updatedAt: string | null;
};

const DEFAULTS = {
  DEFAULT_REORDER_LEVEL: 50,
  EXPIRING_SOON_DAYS: 180,
  EXPIRY_CRITICAL_DAYS: 30,
  EXPIRY_WARNING_DAYS: 90,
  RECEIVE_STOCK_WARN_DAYS: 180,
  RECENTLY_RECEIVED_DAYS: 7,
  CONTROLLED_REQUIRES_WITNESS: 'Y',
  LOW_STOCK_ALERT_ENABLED: 'Y',
  EXPIRY_ALERT_ENABLED: 'Y',
} as const;

function actorLabel(actor?: AuthUser): string {
  if (!actor) return 'SYSTEM';
  const name = [actor.firstName, actor.lastName].filter(Boolean).join(' ');
  return name || actor.email;
}

function yn(v: boolean): string {
  return v ? 'Y' : 'N';
}

function toResponse(row: {
  SETTINGS_ID: number;
  DEFAULT_REORDER_LEVEL: number;
  EXPIRING_SOON_DAYS: number;
  EXPIRY_CRITICAL_DAYS: number;
  EXPIRY_WARNING_DAYS: number;
  RECEIVE_STOCK_WARN_DAYS: number;
  RECENTLY_RECEIVED_DAYS: number;
  CONTROLLED_REQUIRES_WITNESS: string;
  LOW_STOCK_ALERT_ENABLED: string;
  EXPIRY_ALERT_ENABLED: string;
  UPDATED_BY: string | null;
  UPDATED_DATE: Date | null;
}): PharmacySettingsResponse {
  return {
    settingsId: row.SETTINGS_ID,
    defaultReorderLevel: row.DEFAULT_REORDER_LEVEL,
    expiringSoonDays: row.EXPIRING_SOON_DAYS,
    expiryCriticalDays: row.EXPIRY_CRITICAL_DAYS,
    expiryWarningDays: row.EXPIRY_WARNING_DAYS,
    receiveStockWarnDays: row.RECEIVE_STOCK_WARN_DAYS,
    recentlyReceivedDays: row.RECENTLY_RECEIVED_DAYS,
    controlledRequiresWitness: row.CONTROLLED_REQUIRES_WITNESS === 'Y',
    lowStockAlertEnabled: row.LOW_STOCK_ALERT_ENABLED === 'Y',
    expiryAlertEnabled: row.EXPIRY_ALERT_ENABLED === 'Y',
    updatedBy: row.UPDATED_BY,
    updatedAt: row.UPDATED_DATE?.toISOString() ?? null,
  };
}

@Injectable()
export class PharmacySettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Ensure singleton exists and return it. */
  async getOrCreate(): Promise<PharmacySettingsResponse> {
    let row = await this.prisma.pharmacySettings.findUnique({
      where: { SETTINGS_ID: 1 },
    });
    if (!row) {
      row = await this.prisma.pharmacySettings.create({
        data: {
          SETTINGS_ID: 1,
          ...DEFAULTS,
          CREATED_DATE: new Date(),
        },
      });
    }
    return toResponse(row);
  }

  async update(
    dto: UpdatePharmacySettingsDto,
    actor?: AuthUser,
  ): Promise<PharmacySettingsResponse> {
    await this.getOrCreate();
    const before = await this.prisma.pharmacySettings.findUniqueOrThrow({
      where: { SETTINGS_ID: 1 },
    });

    const updated = await this.prisma.pharmacySettings.update({
      where: { SETTINGS_ID: 1 },
      data: {
        ...(dto.defaultReorderLevel !== undefined
          ? { DEFAULT_REORDER_LEVEL: dto.defaultReorderLevel }
          : {}),
        ...(dto.expiringSoonDays !== undefined
          ? { EXPIRING_SOON_DAYS: dto.expiringSoonDays }
          : {}),
        ...(dto.expiryCriticalDays !== undefined
          ? { EXPIRY_CRITICAL_DAYS: dto.expiryCriticalDays }
          : {}),
        ...(dto.expiryWarningDays !== undefined
          ? { EXPIRY_WARNING_DAYS: dto.expiryWarningDays }
          : {}),
        ...(dto.receiveStockWarnDays !== undefined
          ? { RECEIVE_STOCK_WARN_DAYS: dto.receiveStockWarnDays }
          : {}),
        ...(dto.recentlyReceivedDays !== undefined
          ? { RECENTLY_RECEIVED_DAYS: dto.recentlyReceivedDays }
          : {}),
        ...(dto.controlledRequiresWitness !== undefined
          ? { CONTROLLED_REQUIRES_WITNESS: yn(dto.controlledRequiresWitness) }
          : {}),
        ...(dto.lowStockAlertEnabled !== undefined
          ? { LOW_STOCK_ALERT_ENABLED: yn(dto.lowStockAlertEnabled) }
          : {}),
        ...(dto.expiryAlertEnabled !== undefined
          ? { EXPIRY_ALERT_ENABLED: yn(dto.expiryAlertEnabled) }
          : {}),
        UPDATED_BY_ID: actor?.id ?? null,
        UPDATED_BY: actorLabel(actor),
        UPDATED_DATE: new Date(),
      },
    });

    const response = toResponse(updated);
    await this.audit.log({
      type: 'pharmacy:settings-update',
      entity: 'pharmacy_settings',
      entityId: 1,
      userId: actor?.id,
      createdBy: actorLabel(actor),
      item: 'Pharmacy alert thresholds / settings updated',
      oldValue: toResponse(before),
      newValue: response,
    });

    return response;
  }
}
