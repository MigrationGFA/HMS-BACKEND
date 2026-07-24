import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../auth/types/auth-user.type';
import {
  CreateEmergencyAlertDto,
  CreateEmergencyOverrideSessionDto,
} from './dto/emergency-override.dto';

function actorLabel(user: AuthUser): string {
  return [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email;
}

function personName(p: {
  FIRST_NAME: string | null;
  MIDDLE_NAME?: string | null;
  LAST_NAME: string | null;
  HOSPITAL_NO: string | null;
  PERSON_ID: number;
}): string {
  return (
    [p.FIRST_NAME, p.MIDDLE_NAME, p.LAST_NAME].filter(Boolean).join(' ') ||
    p.HOSPITAL_NO ||
    `#${p.PERSON_ID}`
  );
}

@Injectable()
export class EmergencyOverrideService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private async nextOverrideNo(): Promise<string> {
    const year = new Date().getFullYear();
    const count = await this.prisma.emergencyOverrideSessions.count({
      where: {
        OVERRIDE_NO: { startsWith: `EO-${year}-` },
      },
    });
    return `EO-${year}-${String(count + 1).padStart(4, '0')}`;
  }

  private mapSession(row: {
    SESSION_ID: number;
    OVERRIDE_NO: string;
    PERSON_ID: number;
    ADMISSION_ID: number | null;
    REASON: string;
    JUSTIFICATION: string;
    SEVERITY: number;
    DURATION_MINUTES: number;
    LOCATION: string | null;
    CONSULTANT: string | null;
    STATUS: string;
    ACTIONS_JSON: string | null;
    STARTED_AT: Date;
    ENDS_AT: Date | null;
    ENDED_AT: Date | null;
    CREATED_BY: string | null;
    CREATED_DATE: Date | null;
  }, person?: { FIRST_NAME: string | null; LAST_NAME: string | null; HOSPITAL_NO: string | null; PERSON_ID: number; MIDDLE_NAME?: string | null } | null) {
    let actions: string[] = [];
    try {
      actions = row.ACTIONS_JSON ? (JSON.parse(row.ACTIONS_JSON) as string[]) : [];
    } catch {
      actions = [];
    }
    return {
      sessionId: row.SESSION_ID,
      overrideNo: row.OVERRIDE_NO,
      personId: row.PERSON_ID,
      admissionId: row.ADMISSION_ID,
      patientName: person ? personName(person) : `Person #${row.PERSON_ID}`,
      hospitalNo: person?.HOSPITAL_NO ?? null,
      reason: row.REASON,
      justification: row.JUSTIFICATION,
      severity: row.SEVERITY,
      durationMinutes: row.DURATION_MINUTES,
      location: row.LOCATION,
      consultant: row.CONSULTANT,
      status: row.STATUS,
      actions,
      startedAt: row.STARTED_AT.toISOString(),
      endsAt: row.ENDS_AT?.toISOString() ?? null,
      endedAt: row.ENDED_AT?.toISOString() ?? null,
      createdBy: row.CREATED_BY,
      createdAt: row.CREATED_DATE?.toISOString() ?? null,
    };
  }

  private mapAlert(row: {
    ALERT_ID: number;
    PERSON_ID: number | null;
    ALERT_TYPE: string;
    MESSAGE: string;
    SEVERITY: string;
    ACKNOWLEDGED_AT: Date | null;
    ACKNOWLEDGED_BY: string | null;
    CREATED_BY: string | null;
    CREATED_DATE: Date | null;
  }, person?: { FIRST_NAME: string | null; LAST_NAME: string | null; HOSPITAL_NO: string | null; PERSON_ID: number; MIDDLE_NAME?: string | null } | null) {
    return {
      alertId: row.ALERT_ID,
      personId: row.PERSON_ID,
      patientName: person
        ? personName(person)
        : row.PERSON_ID != null
          ? `Person #${row.PERSON_ID}`
          : null,
      hospitalNo: person?.HOSPITAL_NO ?? null,
      type: row.ALERT_TYPE,
      message: row.MESSAGE,
      severity: row.SEVERITY,
      acknowledged: Boolean(row.ACKNOWLEDGED_AT),
      acknowledgedAt: row.ACKNOWLEDGED_AT?.toISOString() ?? null,
      acknowledgedBy: row.ACKNOWLEDGED_BY,
      createdBy: row.CREATED_BY,
      createdAt: row.CREATED_DATE?.toISOString() ?? null,
    };
  }

  async expireStaleSessions() {
    const now = new Date();
    await this.prisma.emergencyOverrideSessions.updateMany({
      where: {
        STATUS: 'Active',
        NOT: { DELETED_FLAG: 'Y' },
        ENDS_AT: { lt: now },
      },
      data: {
        STATUS: 'Expired',
        ENDED_AT: now,
        UPDATED_DATE: now,
      },
    });
  }

  async board() {
    await this.expireStaleSessions();

    const [activeSessions, expiredSessions, openAlerts, admissions] = await Promise.all([
      this.prisma.emergencyOverrideSessions.count({
        where: { STATUS: 'Active', NOT: { DELETED_FLAG: 'Y' } },
      }),
      this.prisma.emergencyOverrideSessions.count({
        where: { STATUS: 'Expired', NOT: { DELETED_FLAG: 'Y' } },
      }),
      this.prisma.emergencyCriticalAlerts.count({
        where: { ACKNOWLEDGED_AT: null, NOT: { DELETED_FLAG: 'Y' } },
      }),
      this.prisma.admissions.findMany({
        where: {
          STATUS: { in: ['ADMITTED', 'ON_LEAVE', 'DISCHARGE_ORDERED'] },
        },
        include: {
          person: true,
          ward: true,
          bed: true,
        },
        orderBy: { ADMITTED_AT: 'desc' },
        take: 100,
      }),
    ]);

    const emergencyWards = admissions.filter((a) => {
      const name = (a.ward?.NAME ?? '').toLowerCase();
      return (
        name.includes('emergency') ||
        name.includes('resus') ||
        name.includes('icu') ||
        name.includes('acute')
      );
    });

    const patients = (emergencyWards.length ? emergencyWards : admissions.slice(0, 25)).map(
      (a) => ({
        personId: a.PERSON_ID,
        admissionId: a.ADMISSION_ID,
        patientName: a.person ? personName(a.person) : `Person #${a.PERSON_ID}`,
        hospitalNo: a.person?.HOSPITAL_NO ?? null,
        ward: a.ward?.NAME ?? null,
        bed: a.bed?.LABEL ?? null,
        status: a.STATUS,
        admittedAt: a.ADMITTED_AT?.toISOString() ?? null,
      }),
    );

    const sessionRequests = await this.prisma.emergencyOverrideSessions.count({
      where: { NOT: { DELETED_FLAG: 'Y' } },
    });

    return {
      kpis: {
        emergencyPatients: patients.length,
        overrideRequests: sessionRequests,
        criticalAlerts: openAlerts,
        activeSessions,
        expiredSessions,
        emergencyAdmissions: patients.length,
      },
      patients,
    };
  }

  async listSessions(params?: { status?: string; limit?: number }) {
    await this.expireStaleSessions();
    const limit = Math.min(Math.max(params?.limit ?? 50, 1), 200);
    const rows = await this.prisma.emergencyOverrideSessions.findMany({
      where: {
        NOT: { DELETED_FLAG: 'Y' },
        ...(params?.status ? { STATUS: params.status } : {}),
      },
      orderBy: { STARTED_AT: 'desc' },
      take: limit,
    });
    const personIds = [...new Set(rows.map((r) => r.PERSON_ID))];
    const people = personIds.length
      ? await this.prisma.persons.findMany({ where: { PERSON_ID: { in: personIds } } })
      : [];
    const byId = new Map(people.map((p) => [p.PERSON_ID, p]));
    return {
      items: rows.map((r) => this.mapSession(r, byId.get(r.PERSON_ID))),
    };
  }

  async createSession(dto: CreateEmergencyOverrideSessionDto, user: AuthUser) {
    const person = await this.prisma.persons.findUnique({
      where: { PERSON_ID: dto.personId },
    });
    if (!person) throw new NotFoundException('Patient not found');

    const duration = dto.durationMinutes ?? 60;
    const startedAt = new Date();
    const endsAt = new Date(startedAt.getTime() + duration * 60_000);
    const overrideNo = await this.nextOverrideNo();
    const label = actorLabel(user);

    const row = await this.prisma.emergencyOverrideSessions.create({
      data: {
        OVERRIDE_NO: overrideNo,
        PERSON_ID: dto.personId,
        ADMISSION_ID: dto.admissionId ?? null,
        REASON: dto.reason.trim(),
        JUSTIFICATION: dto.justification.trim(),
        SEVERITY: dto.severity ?? 3,
        DURATION_MINUTES: duration,
        LOCATION: dto.location?.trim() || null,
        CONSULTANT: dto.consultant?.trim() || null,
        STATUS: 'Active',
        ACTIONS_JSON: JSON.stringify(['Session started']),
        STARTED_AT: startedAt,
        ENDS_AT: endsAt,
        CREATED_BY_ID: user.id,
        CREATED_BY: label,
        CREATED_DATE: startedAt,
      },
    });

    await this.audit.log({
      type: 'emergency:override-start',
      item: overrideNo,
      entity: 'EmergencyOverrideSession',
      entityId: row.SESSION_ID,
      personId: dto.personId,
      userId: user.id,
      createdBy: label,
      newValue: {
        reason: row.REASON,
        severity: row.SEVERITY,
        durationMinutes: duration,
      },
    });

    return this.mapSession(row, person);
  }

  async endSession(id: number, user: AuthUser) {
    const row = await this.prisma.emergencyOverrideSessions.findFirst({
      where: { SESSION_ID: id, NOT: { DELETED_FLAG: 'Y' } },
    });
    if (!row) throw new NotFoundException('Override session not found');
    if (row.STATUS !== 'Active') {
      throw new BadRequestException(`Session is already ${row.STATUS}`);
    }

    const now = new Date();
    const label = actorLabel(user);
    const updated = await this.prisma.emergencyOverrideSessions.update({
      where: { SESSION_ID: id },
      data: {
        STATUS: 'Ended',
        ENDED_AT: now,
        UPDATED_BY_ID: user.id,
        UPDATED_BY: label,
        UPDATED_DATE: now,
      },
    });

    await this.audit.log({
      type: 'emergency:override-end',
      item: updated.OVERRIDE_NO,
      entity: 'EmergencyOverrideSession',
      entityId: id,
      personId: updated.PERSON_ID,
      userId: user.id,
      createdBy: label,
      oldValue: { status: 'Active' },
      newValue: { status: 'Ended' },
    });

    const person = await this.prisma.persons.findUnique({
      where: { PERSON_ID: updated.PERSON_ID },
    });
    return this.mapSession(updated, person);
  }

  async listAlerts(params?: { limit?: number }) {
    const limit = Math.min(Math.max(params?.limit ?? 50, 1), 200);
    const rows = await this.prisma.emergencyCriticalAlerts.findMany({
      where: { NOT: { DELETED_FLAG: 'Y' } },
      orderBy: { CREATED_DATE: 'desc' },
      take: limit,
    });
    const personIds = [
      ...new Set(rows.map((r) => r.PERSON_ID).filter((x): x is number => x != null)),
    ];
    const people = personIds.length
      ? await this.prisma.persons.findMany({ where: { PERSON_ID: { in: personIds } } })
      : [];
    const byId = new Map(people.map((p) => [p.PERSON_ID, p]));
    return {
      items: rows.map((r) =>
        this.mapAlert(r, r.PERSON_ID != null ? byId.get(r.PERSON_ID) : null),
      ),
    };
  }

  async createAlert(dto: CreateEmergencyAlertDto, user: AuthUser) {
    const label = actorLabel(user);
    const now = new Date();
    const row = await this.prisma.emergencyCriticalAlerts.create({
      data: {
        PERSON_ID: dto.personId ?? null,
        ALERT_TYPE: dto.alertType.trim(),
        MESSAGE: dto.message.trim(),
        SEVERITY: dto.severity?.trim() || 'High',
        CREATED_BY_ID: user.id,
        CREATED_BY: label,
        CREATED_DATE: now,
      },
    });
    await this.audit.log({
      type: 'emergency:alert-create',
      item: row.ALERT_TYPE,
      entity: 'EmergencyCriticalAlert',
      entityId: row.ALERT_ID,
      personId: dto.personId ?? null,
      userId: user.id,
      createdBy: label,
      newValue: { message: row.MESSAGE, severity: row.SEVERITY },
    });
    const person =
      dto.personId != null
        ? await this.prisma.persons.findUnique({ where: { PERSON_ID: dto.personId } })
        : null;
    return this.mapAlert(row, person);
  }

  async ackAlert(id: number, user: AuthUser) {
    const row = await this.prisma.emergencyCriticalAlerts.findFirst({
      where: { ALERT_ID: id, NOT: { DELETED_FLAG: 'Y' } },
    });
    if (!row) throw new NotFoundException('Alert not found');
    const label = actorLabel(user);
    const now = new Date();
    const updated = await this.prisma.emergencyCriticalAlerts.update({
      where: { ALERT_ID: id },
      data: {
        ACKNOWLEDGED_AT: now,
        ACKNOWLEDGED_BY_ID: user.id,
        ACKNOWLEDGED_BY: label,
      },
    });
    await this.audit.log({
      type: 'emergency:alert-ack',
      item: updated.ALERT_TYPE,
      entity: 'EmergencyCriticalAlert',
      entityId: id,
      personId: updated.PERSON_ID,
      userId: user.id,
      createdBy: label,
    });
    const person =
      updated.PERSON_ID != null
        ? await this.prisma.persons.findUnique({ where: { PERSON_ID: updated.PERSON_ID } })
        : null;
    return this.mapAlert(updated, person);
  }

  async listAdmissions() {
    const rows = await this.prisma.admissions.findMany({
      where: { STATUS: { in: ['ADMITTED', 'ON_LEAVE', 'DISCHARGE_ORDERED'] } },
      include: { person: true, ward: true },
      orderBy: { ADMITTED_AT: 'desc' },
      take: 50,
    });
    return {
      items: rows.map((a) => ({
        admissionId: a.ADMISSION_ID,
        personId: a.PERSON_ID,
        patientName: a.person ? personName(a.person) : `Person #${a.PERSON_ID}`,
        hospitalNo: a.person?.HOSPITAL_NO ?? null,
        ward: a.ward?.NAME ?? null,
        status: a.STATUS,
        admittedAt: a.ADMITTED_AT?.toISOString() ?? null,
        doctor: a.CREATED_BY ?? null,
      })),
    };
  }

  async listReferrals() {
    const rows = await this.prisma.clinicalReferrals.findMany({
      where: {
        PRIORITY: 'Emergency',
        STATUS: { notIn: ['Cancelled', 'Rejected', 'Completed'] },
      },
      include: { person: true },
      orderBy: { CREATED_DATE: 'desc' },
      take: 50,
    });
    return {
      items: rows.map((r) => ({
        referralId: r.REFERRAL_ID,
        referralNo: r.REFERRAL_NO,
        personId: r.PERSON_ID,
        patientName: r.person ? personName(r.person) : `Person #${r.PERSON_ID}`,
        destination: r.TO_DEPARTMENT ?? r.EXTERNAL_FACILITY ?? '—',
        priority: r.PRIORITY,
        reason: r.REASON,
        status: r.STATUS,
        createdAt: r.CREATED_DATE?.toISOString() ?? null,
      })),
    };
  }

  async listMedications() {
    const rows = await this.prisma.prescriptions.findMany({
      where: {
        OR: [{ URGENCY: 'Stat' }, { PAYMENT_STATUS: 'Emergency' }],
      },
      include: {
        person: true,
        items: { take: 3 },
      },
      orderBy: { CREATED_DATE: 'desc' },
      take: 50,
    });
    return {
      items: rows.flatMap((rx) =>
        (rx.items.length ? rx.items : [null]).map((item) => ({
          prescriptionId: rx.PRESCRIPTION_ID,
          rxNo: rx.RX_NO,
          personId: rx.PERSON_ID,
          patientName: rx.person ? personName(rx.person) : `Person #${rx.PERSON_ID}`,
          drug: item?.DRUG_NAME ?? '—',
          dose: item?.DOSE ?? null,
          route: item?.ROUTE ?? null,
          urgency: rx.URGENCY,
          paymentStatus: rx.PAYMENT_STATUS,
          status: rx.STATUS,
          doctor: rx.PRESCRIBED_BY,
          createdAt: rx.CREATED_DATE?.toISOString() ?? null,
        })),
      ),
    };
  }
}
