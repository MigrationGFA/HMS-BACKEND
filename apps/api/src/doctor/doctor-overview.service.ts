import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../auth/types/auth-user.type';

const QUEUE_STATUSES = ['Triage Completed', 'Sent to Consultation'] as const;
const OPEN_ADMISSION_REQUEST = [
  'Draft',
  'Submitted',
  'UnderReview',
  'Approved',
] as const;
const OPEN_DISCHARGE = [
  'Draft',
  'Submitted',
  'AwaitingPayment',
  'PaymentCleared',
  'Returned',
] as const;
const OPEN_REFERRAL = [
  'Draft',
  'Submitted',
  'UnderReview',
  'QueuedForDept',
  'AwaitingBed',
  'BedAllocated',
  'Accepted',
  'InAttendance',
] as const;
const PENDING_LAB_STATUS = [
  'AwaitingCollection',
  'Collected',
  'ResultDraft',
  'AwaitingValidation',
  'PendingRevalidation',
] as const;
const PENDING_IMAGING_STATUS = [
  'Sent',
  'Accepted',
  'Scheduled',
  'InProgress',
] as const;

function dayBounds(offsetMin: number) {
  const now = new Date();
  const localMs = now.getTime() + offsetMin * 60_000;
  const local = new Date(localMs);
  const startLocal = new Date(
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()),
  );
  const startOfDay = new Date(startLocal.getTime() - offsetMin * 60_000);
  const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);
  return { startOfDay, endOfDay };
}

function weekBounds(offsetMin: number) {
  const { startOfDay } = dayBounds(offsetMin);
  const localMs = startOfDay.getTime() + offsetMin * 60_000;
  const local = new Date(localMs);
  const dow = local.getUTCDay(); // 0 = Sun
  const daysFromMonday = dow === 0 ? 6 : dow - 1;
  const weekStart = new Date(
    startOfDay.getTime() - daysFromMonday * 24 * 60 * 60 * 1000,
  );
  const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);
  return { weekStart, weekEnd };
}

function ageYears(dob: Date | null): number | null {
  if (!dob) return null;
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age -= 1;
  return age >= 0 ? age : null;
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

function clinicMode(clinic: string | null): string {
  const c = (clinic ?? '').toLowerCase();
  if (
    c.includes('psych') ||
    c.includes('opc') ||
    c.includes('mental') ||
    c.includes('addiction')
  ) {
    return 'OPC';
  }
  if (c.includes('gmpc') || c.includes('general')) return 'GMPC';
  return clinic?.trim() || 'OPD';
}

function queueStatusTone(params: {
  priority: string;
  vitalsPending: boolean;
  paymentCleared: boolean;
  triageStatus: string;
}): { status: string; statusTone: string } {
  const pr = params.priority.toLowerCase();
  if (pr.includes('emergency') || pr.includes('stat')) {
    return { status: 'Emergency', statusTone: 'purple' };
  }
  if (pr.includes('urgent')) {
    return { status: 'Urgent', statusTone: 'orange' };
  }
  if (!params.paymentCleared) {
    return { status: 'Payment Pending', statusTone: 'amber' };
  }
  if (params.vitalsPending) {
    return { status: 'Awaiting Vitals', statusTone: 'sky' };
  }
  if (params.triageStatus === 'Sent to Consultation') {
    return { status: 'Ready', statusTone: 'green' };
  }
  return { status: 'Waiting', statusTone: 'blue' };
}

@Injectable()
export class DoctorOverviewService {
  constructor(private readonly prisma: PrismaService) {}

  private async safeCount(fn: () => Promise<number>): Promise<number> {
    try {
      return await fn();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (
        /(does not exist|Unknown column|column .* does not exist)/i.test(message)
      ) {
        return 0;
      }
      throw err;
    }
  }

  async overview(
    user: AuthUser,
    params?: { timezoneOffsetMinutes?: number; queueLimit?: number },
  ) {
    const offsetMin = params?.timezoneOffsetMinutes ?? 60;
    const queueLimit = Math.min(Math.max(params?.queueLimit ?? 12, 1), 50);
    const { startOfDay, endOfDay } = dayBounds(offsetMin);
    const { weekStart, weekEnd } = weekBounds(offsetMin);
    const doctorId = user.id;

    const triageToday = {
      ARRIVAL_AT: { gte: startOfDay, lt: endOfDay },
    };

    const [
      patientsWaiting,
      gmpcWaiting,
      opcWaiting,
      activeConsultations,
      pendingLabResults,
      pendingImaging,
      admissionRequests,
      urgentAdmissions,
      wardRoundPatients,
      wardGroups,
      referralsReceived,
      referralsReceivedPending,
      referralsSent,
      referralsSentAccepted,
      dischargesPending,
      emergencyTriage,
      criticalAlerts,
      followUpThisWeek,
      queueRows,
    ] = await Promise.all([
      this.prisma.triage.count({
        where: { ...triageToday, STATUS: { in: [...QUEUE_STATUSES] } },
      }),
      this.prisma.triage.count({
        where: {
          ...triageToday,
          STATUS: { in: [...QUEUE_STATUSES] },
          CLINIC: { contains: 'GMPC', mode: 'insensitive' },
        },
      }),
      this.prisma.triage.count({
        where: {
          ...triageToday,
          STATUS: { in: [...QUEUE_STATUSES] },
          OR: [
            { CLINIC: { contains: 'OPC', mode: 'insensitive' } },
            { CLINIC: { contains: 'Psych', mode: 'insensitive' } },
          ],
        },
      }),
      this.prisma.encounters.count({
        where: { DOCTOR_ID: doctorId, STATUS: 'In Consultation' },
      }),
      this.prisma.labRequests.count({
        where: {
          OR: [{ DOCTOR_ID: doctorId }, { CREATED_BY_ID: doctorId }],
          STATUS: { not: 'Cancelled' },
          LAB_STATUS: { in: [...PENDING_LAB_STATUS] },
        },
      }),
      this.prisma.imagingRequests.count({
        where: {
          OR: [{ DOCTOR_ID: doctorId }, { CREATED_BY_ID: doctorId }],
          STATUS: { in: [...PENDING_IMAGING_STATUS] },
        },
      }),
      this.prisma.admissionRequests.count({
        where: {
          REQUESTED_BY_USER_ID: doctorId,
          STATUS: { in: [...OPEN_ADMISSION_REQUEST] },
        },
      }),
      this.prisma.admissionRequests.count({
        where: {
          REQUESTED_BY_USER_ID: doctorId,
          STATUS: { in: [...OPEN_ADMISSION_REQUEST] },
          PRIORITY: { in: ['Urgent', 'Emergency'] },
        },
      }),
      this.prisma.admissions.count({
        where: {
          STATUS: { in: ['ADMITTED', 'ON_LEAVE', 'DISCHARGE_ORDERED'] },
        },
      }),
      this.prisma.admissions.groupBy({
        by: ['WARD_ID'],
        where: {
          STATUS: { in: ['ADMITTED', 'ON_LEAVE', 'DISCHARGE_ORDERED'] },
          WARD_ID: { not: null },
        },
        _count: { ADMISSION_ID: true },
      }),
      this.prisma.clinicalReferrals.count({
        where: {
          TO_DOCTOR_USER_ID: doctorId,
          STATUS: { in: [...OPEN_REFERRAL] },
        },
      }),
      this.prisma.clinicalReferrals.count({
        where: {
          TO_DOCTOR_USER_ID: doctorId,
          STATUS: { in: ['Submitted', 'UnderReview', 'QueuedForDept'] },
        },
      }),
      this.prisma.clinicalReferrals.count({
        where: {
          REQUESTED_BY_USER_ID: doctorId,
          STATUS: { notIn: ['Cancelled', 'Rejected'] },
        },
      }),
      this.prisma.clinicalReferrals.count({
        where: {
          REQUESTED_BY_USER_ID: doctorId,
          STATUS: { in: ['Accepted', 'InAttendance', 'Completed'] },
        },
      }),
      this.prisma.dischargeDrafts.count({
        where: {
          REQUESTED_BY_USER_ID: doctorId,
          STATUS: { in: [...OPEN_DISCHARGE] },
        },
      }),
      this.prisma.triage.count({
        where: {
          ...triageToday,
          PRIORITY: { in: ['Emergency', 'Urgent'] },
          STATUS: { notIn: ['Cancelled'] },
        },
      }),
      this.safeCount(() =>
        this.prisma.emergencyCriticalAlerts.count({
          where: { ACKNOWLEDGED_AT: null, NOT: { DELETED_FLAG: 'Y' } },
        }),
      ),
      this.prisma.followUps.count({
        where: {
          DOCTOR_ID: doctorId,
          STATUS: 'Scheduled',
          SCHEDULED_DATE: { gte: weekStart, lt: weekEnd },
        },
      }),
      this.prisma.triage.findMany({
        where: { ...triageToday, STATUS: { in: [...QUEUE_STATUSES] } },
        orderBy: [{ PRIORITY: 'asc' }, { ARRIVAL_AT: 'asc' }],
        take: queueLimit,
        include: {
          person: {
            include: {
              cards: { orderBy: { CREATED_DATE: 'desc' }, take: 1 },
            },
          },
        },
      }),
    ]);

    const queue = queueRows.map((t) => {
      const person = t.person;
      const card = person.cards[0] ?? null;
      const paymentCleared = !card || card.PAYMENT_STATUS !== 'Pending';
      const vitalsPending =
        t.BLOOD_PRESSURE == null &&
        t.TEMPERATURE_C == null &&
        t.PULSE_BPM == null;
      const sex = (person.SEX || '').toUpperCase().startsWith('F')
        ? 'F'
        : (person.SEX || '').toUpperCase().startsWith('M')
          ? 'M'
          : person.SEX || '—';
      const age = ageYears(person.DATE_OF_BIRTH);
      const displayName = personName(person);
      const label =
        age != null ? `${displayName} (${sex}, ${age})` : `${displayName} (${sex})`;
      const { status, statusTone } = queueStatusTone({
        priority: t.PRIORITY,
        vitalsPending,
        paymentCleared,
        triageStatus: t.STATUS,
      });
      return {
        triageId: t.TRIAGE_ID,
        personId: t.PERSON_ID,
        name: label,
        patientName: displayName,
        hospitalNo: person.HOSPITAL_NO,
        sex,
        age,
        status,
        statusTone,
        mode: clinicMode(t.CLINIC),
        clinic: t.CLINIC,
        priority: t.PRIORITY,
        canStart: paymentCleared,
        arrivalAt: t.ARRIVAL_AT.toISOString(),
      };
    });

    const waitingSubtitleParts: string[] = [];
    if (gmpcWaiting > 0) waitingSubtitleParts.push(`${gmpcWaiting} GMPC`);
    if (opcWaiting > 0) waitingSubtitleParts.push(`${opcWaiting} OPC`);
    const patientsWaitingSubtitle =
      waitingSubtitleParts.length > 0
        ? waitingSubtitleParts.join(' + ')
        : patientsWaiting > 0
          ? 'Consultation queue'
          : 'No patients waiting';

    const wardCount = wardGroups.length;

    return {
      asOf: new Date().toISOString(),
      doctorUserId: doctorId,
      kpis: {
        patientsWaiting,
        patientsWaitingSubtitle,
        activeConsultations,
        pendingLabResults,
        pendingImaging,
        admissionRequests,
        urgentAdmissionRequests: urgentAdmissions,
        wardRoundPatients,
        wardCount,
        referralsReceived,
        referralsReceivedPending,
        referralsSent,
        referralsSentAccepted,
        dischargesPending,
        emergencyCases: emergencyTriage,
        criticalAlerts,
      },
      queue,
      tabHints: {
        activeCount: activeConsultations,
        followUpCount: followUpThisWeek,
        admittedCount: wardRoundPatients,
        referralsReceived,
        referralsSent,
        pendingLab: pendingLabResults,
        pendingImaging,
        dischargesPending,
      },
    };
  }
}
