import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import type { AuthUser } from '../auth/types/auth-user.type';
import {
  CheckInteractionsDto,
  CreateAllergyDto,
  CreateRuleDto,
  NotifyAlertDto,
  OverrideAlertDto,
  UpdateAllergyDto,
  UpdateRuleDto,
} from './dto/clinical-pharmacy.dto';

function actorLabel(user: AuthUser): string {
  return [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email;
}

function norm(s: string | null | undefined): string {
  return (s ?? '').trim().toLowerCase();
}

function nameMatch(a: string, b: string): boolean {
  const na = norm(a);
  const nb = norm(b);
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}

type MedLine = {
  drugId: number;
  drugName: string;
  controlled: boolean;
  prescriptionId: number | null;
  doctorUserId: number | null;
};

type Finding = {
  alertType: string;
  severity: string;
  drugA: string;
  drugB: string | null;
  message: string;
  ruleCode: string | null;
  prescriptionId: number | null;
  doctorUserId: number | null;
};

@Injectable()
export class ClinicalPharmacyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  private notDeletedAlert(): Prisma.ClinicalPharmacyAlertsWhereInput {
    return { NOT: { DELETED_FLAG: 'Y' } };
  }

  private notDeletedRule(): Prisma.DrugInteractionRulesWhereInput {
    return { NOT: { DELETED_FLAG: 'Y' } };
  }

  private notDeletedAllergy(): Prisma.PatientAllergiesWhereInput {
    return { NOT: { DELETED_FLAG: 'Y' } };
  }

  private mapAlert(
    row: {
      ALERT_ID: number;
      ALERT_NO: string;
      PERSON_ID: number;
      PRESCRIPTION_ID: number | null;
      DOCTOR_USER_ID: number | null;
      ALERT_TYPE: string;
      SEVERITY: string;
      DRUG_A: string;
      DRUG_B: string | null;
      MESSAGE: string;
      RULE_CODE: string | null;
      STATUS: string;
      OVERRIDE_REASON: string | null;
      OVERRIDDEN_BY: string | null;
      OVERRIDDEN_AT: Date | null;
      NOTIFY_NOTE: string | null;
      NOTIFIED_AT: Date | null;
      NOTIFIED_BY: string | null;
      CREATED_BY: string | null;
      CREATED_DATE: Date | null;
    },
    person?: {
      FIRST_NAME: string | null;
      LAST_NAME: string | null;
      HOSPITAL_NO: string | null;
    } | null,
    rxNo?: string | null,
  ) {
    const patientName =
      [person?.FIRST_NAME, person?.LAST_NAME].filter(Boolean).join(' ') ||
      (person?.HOSPITAL_NO ?? `Person #${row.PERSON_ID}`);
    return {
      alertId: row.ALERT_ID,
      alertNo: row.ALERT_NO,
      personId: row.PERSON_ID,
      patientName,
      hospitalNo: person?.HOSPITAL_NO ?? null,
      prescriptionId: row.PRESCRIPTION_ID,
      rxNo: rxNo ?? null,
      doctorUserId: row.DOCTOR_USER_ID,
      alertType: row.ALERT_TYPE,
      severity: row.SEVERITY,
      drugA: row.DRUG_A,
      drugB: row.DRUG_B,
      message: row.MESSAGE,
      ruleCode: row.RULE_CODE,
      status: row.STATUS,
      overrideReason: row.OVERRIDE_REASON,
      overriddenBy: row.OVERRIDDEN_BY,
      overriddenAt: row.OVERRIDDEN_AT?.toISOString() ?? null,
      notifyNote: row.NOTIFY_NOTE,
      notifiedAt: row.NOTIFIED_AT?.toISOString() ?? null,
      notifiedBy: row.NOTIFIED_BY,
      createdBy: row.CREATED_BY,
      createdAt: row.CREATED_DATE?.toISOString() ?? null,
    };
  }

  private mapRule(row: {
    RULE_ID: number;
    CODE: string;
    DRUG_A_ID: number | null;
    DRUG_B_ID: number | null;
    DRUG_A_NAME: string | null;
    DRUG_B_NAME: string | null;
    ALERT_TYPE: string;
    SEVERITY: string;
    MESSAGE: string;
    STATUS: string;
    CREATED_DATE: Date | null;
  }) {
    return {
      ruleId: row.RULE_ID,
      code: row.CODE,
      drugAId: row.DRUG_A_ID,
      drugBId: row.DRUG_B_ID,
      drugAName: row.DRUG_A_NAME,
      drugBName: row.DRUG_B_NAME,
      alertType: row.ALERT_TYPE,
      severity: row.SEVERITY,
      message: row.MESSAGE,
      status: row.STATUS,
      createdAt: row.CREATED_DATE?.toISOString() ?? null,
    };
  }

  private mapAllergy(row: {
    ALLERGY_ID: number;
    PERSON_ID: number;
    SUBSTANCE: string;
    REACTION: string | null;
    SEVERITY: string;
    STATUS: string;
    CREATED_DATE: Date | null;
  }) {
    return {
      allergyId: row.ALLERGY_ID,
      personId: row.PERSON_ID,
      substance: row.SUBSTANCE,
      reaction: row.REACTION,
      severity: row.SEVERITY,
      status: row.STATUS,
      createdAt: row.CREATED_DATE?.toISOString() ?? null,
    };
  }

  private async nextAlertNo(): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `CPA-${year}-`;
    const latest = await this.prisma.clinicalPharmacyAlerts.findFirst({
      where: { ALERT_NO: { startsWith: prefix } },
      orderBy: { ALERT_NO: 'desc' },
      select: { ALERT_NO: true },
    });
    let next = 1;
    if (latest?.ALERT_NO) {
      const n = Number(latest.ALERT_NO.slice(prefix.length));
      if (Number.isFinite(n) && n >= next) next = n + 1;
    }
    return `${prefix}${String(next).padStart(4, '0')}`;
  }

  private findingKey(f: Finding): string {
    const a = norm(f.drugA);
    const b = norm(f.drugB);
    const pair = [a, b].filter(Boolean).sort().join('|');
    return `${f.alertType}:${pair}:${f.ruleCode ?? ''}`;
  }

  private async loadMeds(
    personId: number,
    proposedDrugIds?: number[],
  ): Promise<MedLine[]> {
    const rx = await this.prisma.prescriptions.findMany({
      where: {
        PERSON_ID: personId,
        STATUS: { in: ['Sent', 'Draft', 'Partially Dispensed'] },
      },
      include: {
        items: {
          where: { LINE_STATUS: { in: ['Active', 'Dispensed'] } },
          include: { drug: true },
        },
      },
      orderBy: { CREATED_DATE: 'desc' },
      take: 20,
    });

    const meds: MedLine[] = [];
    const seen = new Set<number>();
    for (const p of rx) {
      for (const item of p.items) {
        if (seen.has(item.DRUG_ID)) continue;
        seen.add(item.DRUG_ID);
        meds.push({
          drugId: item.DRUG_ID,
          drugName: item.DRUG_NAME || item.drug?.NAME || `Drug #${item.DRUG_ID}`,
          controlled: (item.drug?.CONTROLLED_FLAG ?? 'N').toUpperCase() === 'Y',
          prescriptionId: p.PRESCRIPTION_ID,
          doctorUserId: p.PRESCRIBED_BY_ID,
        });
      }
    }

    if (proposedDrugIds?.length) {
      const drugs = await this.prisma.drugs.findMany({
        where: { DRUG_ID: { in: proposedDrugIds }, STATUS: 'Active' },
      });
      for (const d of drugs) {
        if (seen.has(d.DRUG_ID)) continue;
        seen.add(d.DRUG_ID);
        meds.push({
          drugId: d.DRUG_ID,
          drugName: d.NAME,
          controlled: (d.CONTROLLED_FLAG ?? 'N').toUpperCase() === 'Y',
          prescriptionId: null,
          doctorUserId: null,
        });
      }
    }

    return meds;
  }

  private evaluate(
    meds: MedLine[],
    allergies: { SUBSTANCE: string; SEVERITY: string; REACTION: string | null }[],
    rules: {
      CODE: string;
      DRUG_A_ID: number | null;
      DRUG_B_ID: number | null;
      DRUG_A_NAME: string | null;
      DRUG_B_NAME: string | null;
      ALERT_TYPE: string;
      SEVERITY: string;
      MESSAGE: string;
    }[],
  ): Finding[] {
    const findings: Finding[] = [];
    const push = (f: Finding) => {
      if (!findings.some((x) => this.findingKey(x) === this.findingKey(f))) {
        findings.push(f);
      }
    };

    for (const rule of rules) {
      if (rule.ALERT_TYPE === 'AllergyClass') {
        const substance = rule.DRUG_A_NAME ?? '';
        for (const allergy of allergies) {
          if (!nameMatch(allergy.SUBSTANCE, substance) && !nameMatch(substance, allergy.SUBSTANCE)) {
            continue;
          }
          for (const med of meds) {
            if (
              nameMatch(med.drugName, substance) ||
              nameMatch(med.drugName, allergy.SUBSTANCE) ||
              (norm(med.drugName).includes('penicillin') &&
                norm(allergy.SUBSTANCE).includes('penicillin')) ||
              (norm(med.drugName).includes('amoxicillin') &&
                (norm(allergy.SUBSTANCE).includes('penicillin') ||
                  norm(substance).includes('penicillin')))
            ) {
              push({
                alertType: 'Allergy',
                severity: rule.SEVERITY === 'Mild' ? allergy.SEVERITY || rule.SEVERITY : rule.SEVERITY,
                drugA: med.drugName,
                drugB: `Allergy: ${allergy.SUBSTANCE}`,
                message: rule.MESSAGE,
                ruleCode: rule.CODE,
                prescriptionId: med.prescriptionId,
                doctorUserId: med.doctorUserId,
              });
            }
          }
        }
        continue;
      }

      if (rule.ALERT_TYPE === 'Controlled') {
        for (const med of meds) {
          const nameHit =
            (rule.DRUG_A_NAME && nameMatch(med.drugName, rule.DRUG_A_NAME)) ||
            (rule.DRUG_A_ID != null && med.drugId === rule.DRUG_A_ID);
          if (med.controlled || nameHit) {
            if (!nameHit && !rule.DRUG_A_NAME && !rule.DRUG_A_ID && !med.controlled) continue;
            if (!med.controlled && !nameHit) continue;
            push({
              alertType: 'Controlled',
              severity: rule.SEVERITY,
              drugA: med.drugName,
              drugB: null,
              message: rule.MESSAGE,
              ruleCode: rule.CODE,
              prescriptionId: med.prescriptionId,
              doctorUserId: med.doctorUserId,
            });
          }
        }
        continue;
      }

      if (rule.ALERT_TYPE === 'Psychiatric') {
        for (const med of meds) {
          const nameHit =
            (rule.DRUG_A_NAME && nameMatch(med.drugName, rule.DRUG_A_NAME)) ||
            (rule.DRUG_A_ID != null && med.drugId === rule.DRUG_A_ID);
          if (!nameHit) continue;
          push({
            alertType: 'Psychiatric',
            severity: rule.SEVERITY,
            drugA: med.drugName,
            drugB: null,
            message: rule.MESSAGE,
            ruleCode: rule.CODE,
            prescriptionId: med.prescriptionId,
            doctorUserId: med.doctorUserId,
          });
        }
        continue;
      }

      // DDI / Duplicate — need two meds matching A and B
      for (let i = 0; i < meds.length; i++) {
        for (let j = i + 1; j < meds.length; j++) {
          const m1 = meds[i];
          const m2 = meds[j];
          const matchPair = (a: MedLine, b: MedLine) => {
            const aIdOk =
              rule.DRUG_A_ID != null &&
              rule.DRUG_B_ID != null &&
              ((a.drugId === rule.DRUG_A_ID && b.drugId === rule.DRUG_B_ID) ||
                (a.drugId === rule.DRUG_B_ID && b.drugId === rule.DRUG_A_ID));
            const aNameOk =
              rule.DRUG_A_NAME &&
              rule.DRUG_B_NAME &&
              ((nameMatch(a.drugName, rule.DRUG_A_NAME) &&
                nameMatch(b.drugName, rule.DRUG_B_NAME)) ||
                (nameMatch(a.drugName, rule.DRUG_B_NAME) &&
                  nameMatch(b.drugName, rule.DRUG_A_NAME)));
            return Boolean(aIdOk || aNameOk);
          };
          if (!matchPair(m1, m2)) continue;
          push({
            alertType: rule.ALERT_TYPE === 'Duplicate' ? 'Duplicate' : 'DDI',
            severity: rule.SEVERITY,
            drugA: m1.drugName,
            drugB: m2.drugName,
            message: rule.MESSAGE,
            ruleCode: rule.CODE,
            prescriptionId: m1.prescriptionId ?? m2.prescriptionId,
            doctorUserId: m1.doctorUserId ?? m2.doctorUserId,
          });
        }
      }
    }

    // Controlled drugs without a specific rule still flag if CONTROLLED_FLAG=Y
    const hasGenericCtl = rules.some((r) => r.ALERT_TYPE === 'Controlled');
    if (!hasGenericCtl) {
      for (const med of meds) {
        if (!med.controlled) continue;
        push({
          alertType: 'Controlled',
          severity: 'Severe',
          drugA: med.drugName,
          drugB: null,
          message: 'Controlled substance — document witness / override before dispense.',
          ruleCode: null,
          prescriptionId: med.prescriptionId,
          doctorUserId: med.doctorUserId,
        });
      }
    }

    return findings;
  }

  async listAlerts(
    params: {
      status?: string;
      severity?: string;
      type?: string;
      q?: string;
      page?: number;
      limit?: number;
    },
  ) {
    const page = Math.max(params.page ?? 1, 1);
    const limit = Math.min(Math.max(params.limit ?? 50, 1), 200);
    const q = params.q?.trim();

    const where: Prisma.ClinicalPharmacyAlertsWhereInput = {
      ...this.notDeletedAlert(),
      ...(params.status ? { STATUS: params.status } : {}),
      ...(params.severity ? { SEVERITY: params.severity } : {}),
      ...(params.type ? { ALERT_TYPE: params.type } : {}),
      ...(q
        ? {
            OR: [
              { ALERT_NO: { contains: q, mode: 'insensitive' } },
              { DRUG_A: { contains: q, mode: 'insensitive' } },
              { DRUG_B: { contains: q, mode: 'insensitive' } },
              { MESSAGE: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const [rows, total, openCount, severeOpen, allergyOpen, overriddenToday] =
      await Promise.all([
        this.prisma.clinicalPharmacyAlerts.findMany({
          where,
          orderBy: [{ SEVERITY: 'asc' }, { CREATED_DATE: 'desc' }],
          skip: (page - 1) * limit,
          take: limit,
        }),
        this.prisma.clinicalPharmacyAlerts.count({ where }),
        this.prisma.clinicalPharmacyAlerts.count({
          where: { ...this.notDeletedAlert(), STATUS: 'Open' },
        }),
        this.prisma.clinicalPharmacyAlerts.count({
          where: {
            ...this.notDeletedAlert(),
            STATUS: 'Open',
            SEVERITY: 'Severe',
          },
        }),
        this.prisma.clinicalPharmacyAlerts.count({
          where: {
            ...this.notDeletedAlert(),
            STATUS: 'Open',
            ALERT_TYPE: 'Allergy',
          },
        }),
        this.prisma.clinicalPharmacyAlerts.count({
          where: {
            ...this.notDeletedAlert(),
            STATUS: 'Overridden',
            OVERRIDDEN_AT: { gte: startOfDay },
          },
        }),
      ]);

    const personIds = [...new Set(rows.map((r) => r.PERSON_ID))];
    const rxIds = [
      ...new Set(
        rows.map((r) => r.PRESCRIPTION_ID).filter((id): id is number => id != null),
      ),
    ];
    const [persons, prescriptions] = await Promise.all([
      personIds.length
        ? this.prisma.persons.findMany({
            where: { PERSON_ID: { in: personIds } },
            select: {
              PERSON_ID: true,
              FIRST_NAME: true,
              LAST_NAME: true,
              HOSPITAL_NO: true,
            },
          })
        : Promise.resolve([]),
      rxIds.length
        ? this.prisma.prescriptions.findMany({
            where: { PRESCRIPTION_ID: { in: rxIds } },
            select: { PRESCRIPTION_ID: true, RX_NO: true },
          })
        : Promise.resolve([]),
    ]);
    const personMap = new Map(persons.map((p) => [p.PERSON_ID, p]));
    const rxMap = new Map(prescriptions.map((p) => [p.PRESCRIPTION_ID, p.RX_NO]));

    // Sort severity Severe first (DB asc puts Mild first if alpha — reorder in memory)
    const severityRank: Record<string, number> = {
      Severe: 0,
      Moderate: 1,
      Mild: 2,
    };
    const items = rows
      .map((r) =>
        this.mapAlert(
          r,
          personMap.get(r.PERSON_ID),
          r.PRESCRIPTION_ID != null ? rxMap.get(r.PRESCRIPTION_ID) : null,
        ),
      )
      .sort(
        (a, b) =>
          (severityRank[a.severity] ?? 9) - (severityRank[b.severity] ?? 9),
      );

    return {
      items,
      meta: { page, limit, total },
      kpis: {
        open: openCount,
        severe: severeOpen,
        allergy: allergyOpen,
        overriddenToday,
      },
    };
  }

  async getAlert(id: number) {
    const row = await this.prisma.clinicalPharmacyAlerts.findFirst({
      where: { ALERT_ID: id, ...this.notDeletedAlert() },
    });
    if (!row) throw new NotFoundException('Alert not found');
    const person = await this.prisma.persons.findUnique({
      where: { PERSON_ID: row.PERSON_ID },
      select: {
        FIRST_NAME: true,
        LAST_NAME: true,
        HOSPITAL_NO: true,
      },
    });
    let rxNo: string | null = null;
    if (row.PRESCRIPTION_ID) {
      const rx = await this.prisma.prescriptions.findUnique({
        where: { PRESCRIPTION_ID: row.PRESCRIPTION_ID },
        select: { RX_NO: true },
      });
      rxNo = rx?.RX_NO ?? null;
    }
    return this.mapAlert(row, person, rxNo);
  }

  async check(dto: CheckInteractionsDto, user: AuthUser) {
    const person = await this.prisma.persons.findUnique({
      where: { PERSON_ID: dto.personId },
    });
    if (!person) throw new NotFoundException('Patient not found');

    const [meds, allergies, rules] = await Promise.all([
      this.loadMeds(dto.personId, dto.drugIds),
      this.prisma.patientAllergies.findMany({
        where: {
          PERSON_ID: dto.personId,
          STATUS: 'Active',
          ...this.notDeletedAllergy(),
        },
      }),
      this.prisma.drugInteractionRules.findMany({
        where: { STATUS: 'Active', ...this.notDeletedRule() },
      }),
    ]);

    const findings = this.evaluate(meds, allergies, rules);
    const label = actorLabel(user);
    const now = new Date();
    const created: ReturnType<ClinicalPharmacyService['mapAlert']>[] = [];

    for (const f of findings) {
      const existing = await this.prisma.clinicalPharmacyAlerts.findFirst({
        where: {
          PERSON_ID: dto.personId,
          STATUS: 'Open',
          ALERT_TYPE: f.alertType,
          DRUG_A: f.drugA,
          ...(f.drugB ? { DRUG_B: f.drugB } : { DRUG_B: null }),
          ...this.notDeletedAlert(),
        },
      });
      if (existing) {
        created.push(
          this.mapAlert(existing, {
            FIRST_NAME: person.FIRST_NAME,
            LAST_NAME: person.LAST_NAME,
            HOSPITAL_NO: person.HOSPITAL_NO,
          }),
        );
        continue;
      }

      const alertNo = await this.nextAlertNo();
      const row = await this.prisma.clinicalPharmacyAlerts.create({
        data: {
          ALERT_NO: alertNo,
          PERSON_ID: dto.personId,
          PRESCRIPTION_ID: dto.prescriptionId ?? f.prescriptionId,
          DOCTOR_USER_ID: f.doctorUserId,
          ALERT_TYPE: f.alertType,
          SEVERITY: f.severity,
          DRUG_A: f.drugA,
          DRUG_B: f.drugB,
          MESSAGE: f.message,
          RULE_CODE: f.ruleCode,
          STATUS: 'Open',
          CREATED_BY_ID: user.id,
          CREATED_BY: label,
          CREATED_DATE: now,
          DELETED_FLAG: 'N',
        },
      });
      created.push(
        this.mapAlert(row, {
          FIRST_NAME: person.FIRST_NAME,
          LAST_NAME: person.LAST_NAME,
          HOSPITAL_NO: person.HOSPITAL_NO,
        }),
      );
    }

    await this.audit.log({
      type: 'clinical-pharmacy:check',
      item: `Person #${dto.personId}`,
      entity: 'ClinicalPharmacyAlert',
      personId: dto.personId,
      userId: user.id,
      createdBy: label,
      newValue: { findings: findings.length, created: created.length },
    });

    return {
      findings: created,
      medCount: meds.length,
      allergyCount: allergies.length,
      ruleCount: rules.length,
    };
  }

  async override(id: number, dto: OverrideAlertDto, user: AuthUser) {
    const existing = await this.prisma.clinicalPharmacyAlerts.findFirst({
      where: { ALERT_ID: id, ...this.notDeletedAlert() },
    });
    if (!existing) throw new NotFoundException('Alert not found');
    if (existing.STATUS === 'Closed') {
      throw new BadRequestException('Closed alerts cannot be overridden');
    }
    const label = actorLabel(user);
    const now = new Date();
    const row = await this.prisma.clinicalPharmacyAlerts.update({
      where: { ALERT_ID: id },
      data: {
        STATUS: 'Overridden',
        OVERRIDE_REASON: dto.reason.trim(),
        OVERRIDDEN_BY: label,
        OVERRIDDEN_BY_ID: user.id,
        OVERRIDDEN_AT: now,
        UPDATED_BY_ID: user.id,
        UPDATED_BY: label,
        UPDATED_DATE: now,
      },
    });
    await this.audit.log({
      type: 'clinical-pharmacy:override',
      item: existing.ALERT_NO,
      entity: 'ClinicalPharmacyAlert',
      entityId: id,
      personId: existing.PERSON_ID,
      userId: user.id,
      createdBy: label,
      oldValue: { status: existing.STATUS },
      newValue: { status: 'Overridden', reason: dto.reason.trim() },
    });
    return this.getAlert(row.ALERT_ID);
  }

  async notify(id: number, dto: NotifyAlertDto, user: AuthUser) {
    const existing = await this.prisma.clinicalPharmacyAlerts.findFirst({
      where: { ALERT_ID: id, ...this.notDeletedAlert() },
    });
    if (!existing) throw new NotFoundException('Alert not found');
    if (!existing.DOCTOR_USER_ID) {
      throw new BadRequestException(
        'No prescribing doctor linked to this alert — cannot notify',
      );
    }
    const label = actorLabel(user);
    const now = new Date();
    const note = dto.note?.trim() || existing.MESSAGE;

    await this.notifications.createForUser({
      userId: existing.DOCTOR_USER_ID,
      roleHint: 'DOCTOR',
      type: 'ClinicalPharmacyAlert',
      title: `Pharmacy alert ${existing.ALERT_NO}: ${existing.ALERT_TYPE}`,
      body: `${existing.DRUG_A}${existing.DRUG_B ? ` ⟷ ${existing.DRUG_B}` : ''} — ${note}`,
      linkPath: '/pharmacy/interactions',
      entity: 'ClinicalPharmacyAlert',
      entityId: id,
      personId: existing.PERSON_ID,
    });

    const row = await this.prisma.clinicalPharmacyAlerts.update({
      where: { ALERT_ID: id },
      data: {
        STATUS: existing.STATUS === 'Overridden' ? 'Overridden' : 'Notified',
        NOTIFY_NOTE: note,
        NOTIFIED_AT: now,
        NOTIFIED_BY: label,
        NOTIFIED_BY_ID: user.id,
        UPDATED_BY_ID: user.id,
        UPDATED_BY: label,
        UPDATED_DATE: now,
      },
    });

    await this.audit.log({
      type: 'clinical-pharmacy:notify',
      item: existing.ALERT_NO,
      entity: 'ClinicalPharmacyAlert',
      entityId: id,
      personId: existing.PERSON_ID,
      userId: user.id,
      createdBy: label,
      newValue: { doctorUserId: existing.DOCTOR_USER_ID, note },
    });

    return this.getAlert(row.ALERT_ID);
  }

  async close(id: number, user: AuthUser) {
    const existing = await this.prisma.clinicalPharmacyAlerts.findFirst({
      where: { ALERT_ID: id, ...this.notDeletedAlert() },
    });
    if (!existing) throw new NotFoundException('Alert not found');
    const label = actorLabel(user);
    const now = new Date();
    await this.prisma.clinicalPharmacyAlerts.update({
      where: { ALERT_ID: id },
      data: {
        STATUS: 'Closed',
        UPDATED_BY_ID: user.id,
        UPDATED_BY: label,
        UPDATED_DATE: now,
      },
    });
    await this.audit.log({
      type: 'clinical-pharmacy:close',
      item: existing.ALERT_NO,
      entity: 'ClinicalPharmacyAlert',
      entityId: id,
      personId: existing.PERSON_ID,
      userId: user.id,
      createdBy: label,
      oldValue: { status: existing.STATUS },
      newValue: { status: 'Closed' },
    });
    return this.getAlert(id);
  }

  async listRules(params?: { status?: string; q?: string }) {
    const q = params?.q?.trim();
    const rows = await this.prisma.drugInteractionRules.findMany({
      where: {
        ...this.notDeletedRule(),
        ...(params?.status ? { STATUS: params.status } : {}),
        ...(q
          ? {
              OR: [
                { CODE: { contains: q, mode: 'insensitive' } },
                { DRUG_A_NAME: { contains: q, mode: 'insensitive' } },
                { DRUG_B_NAME: { contains: q, mode: 'insensitive' } },
                { MESSAGE: { contains: q, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: { CODE: 'asc' },
    });
    return { items: rows.map((r) => this.mapRule(r)) };
  }

  async createRule(dto: CreateRuleDto, user: AuthUser) {
    const label = actorLabel(user);
    const row = await this.prisma.drugInteractionRules.create({
      data: {
        CODE: dto.code.trim().toUpperCase(),
        ALERT_TYPE: dto.alertType,
        SEVERITY: dto.severity,
        MESSAGE: dto.message.trim(),
        DRUG_A_ID: dto.drugAId ?? null,
        DRUG_B_ID: dto.drugBId ?? null,
        DRUG_A_NAME: dto.drugAName?.trim() ?? null,
        DRUG_B_NAME: dto.drugBName?.trim() ?? null,
        STATUS: 'Active',
        CREATED_BY_ID: user.id,
        CREATED_BY: label,
        CREATED_DATE: new Date(),
        DELETED_FLAG: 'N',
      },
    });
    return this.mapRule(row);
  }

  async updateRule(id: number, dto: UpdateRuleDto, user: AuthUser) {
    const existing = await this.prisma.drugInteractionRules.findFirst({
      where: { RULE_ID: id, ...this.notDeletedRule() },
    });
    if (!existing) throw new NotFoundException('Rule not found');
    const label = actorLabel(user);
    const row = await this.prisma.drugInteractionRules.update({
      where: { RULE_ID: id },
      data: {
        ...(dto.severity != null ? { SEVERITY: dto.severity } : {}),
        ...(dto.message != null ? { MESSAGE: dto.message.trim() } : {}),
        ...(dto.status != null ? { STATUS: dto.status } : {}),
        ...(dto.drugAName !== undefined
          ? { DRUG_A_NAME: dto.drugAName?.trim() ?? null }
          : {}),
        ...(dto.drugBName !== undefined
          ? { DRUG_B_NAME: dto.drugBName?.trim() ?? null }
          : {}),
        ...(dto.drugAId !== undefined ? { DRUG_A_ID: dto.drugAId } : {}),
        ...(dto.drugBId !== undefined ? { DRUG_B_ID: dto.drugBId } : {}),
        UPDATED_BY_ID: user.id,
        UPDATED_BY: label,
        UPDATED_DATE: new Date(),
      },
    });
    return this.mapRule(row);
  }

  async listAllergies(personId: number) {
    const rows = await this.prisma.patientAllergies.findMany({
      where: { PERSON_ID: personId, ...this.notDeletedAllergy() },
      orderBy: { CREATED_DATE: 'desc' },
    });
    return { items: rows.map((r) => this.mapAllergy(r)) };
  }

  async createAllergy(dto: CreateAllergyDto, user: AuthUser) {
    const person = await this.prisma.persons.findUnique({
      where: { PERSON_ID: dto.personId },
    });
    if (!person) throw new NotFoundException('Patient not found');
    const label = actorLabel(user);
    const row = await this.prisma.patientAllergies.create({
      data: {
        PERSON_ID: dto.personId,
        SUBSTANCE: dto.substance.trim(),
        REACTION: dto.reaction?.trim() ?? null,
        SEVERITY: dto.severity ?? 'Moderate',
        STATUS: 'Active',
        CREATED_BY_ID: user.id,
        CREATED_BY: label,
        CREATED_DATE: new Date(),
        DELETED_FLAG: 'N',
      },
    });
    return this.mapAllergy(row);
  }

  async updateAllergy(id: number, dto: UpdateAllergyDto, user: AuthUser) {
    const existing = await this.prisma.patientAllergies.findFirst({
      where: { ALLERGY_ID: id, ...this.notDeletedAllergy() },
    });
    if (!existing) throw new NotFoundException('Allergy not found');
    const label = actorLabel(user);
    const row = await this.prisma.patientAllergies.update({
      where: { ALLERGY_ID: id },
      data: {
        ...(dto.substance != null ? { SUBSTANCE: dto.substance.trim() } : {}),
        ...(dto.reaction !== undefined
          ? { REACTION: dto.reaction?.trim() ?? null }
          : {}),
        ...(dto.severity != null ? { SEVERITY: dto.severity } : {}),
        ...(dto.status != null ? { STATUS: dto.status } : {}),
        UPDATED_BY_ID: user.id,
        UPDATED_BY: label,
        UPDATED_DATE: new Date(),
      },
    });
    return this.mapAllergy(row);
  }
}
