import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../auth/types/auth-user.type';

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setUTCHours(23, 59, 59, 999);
  return x;
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d;
}

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function personName(p: {
  FIRST_NAME: string | null;
  LAST_NAME: string | null;
  MIDDLE_NAME: string | null;
}): string {
  return [p.FIRST_NAME, p.MIDDLE_NAME, p.LAST_NAME].filter(Boolean).join(' ');
}

function ageYears(dob: Date | null | undefined): number | null {
  if (!dob) return null;
  return Math.max(
    0,
    Math.floor(
      (Date.now() - dob.getTime()) / (1000 * 60 * 60 * 24 * 365.25),
    ),
  );
}

function ageBand(age: number | null): string {
  if (age == null) return 'Unknown';
  if (age < 18) return '0-17';
  if (age < 30) return '18-29';
  if (age < 45) return '30-44';
  if (age < 60) return '45-59';
  return '60+';
}

@Injectable()
export class DoctorAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async analytics(
    params: {
      from?: string;
      to?: string;
      clinic?: string;
      timezoneOffsetMinutes?: number;
    },
    user: AuthUser,
  ) {
    const doctorId = user.id;
    const offsetMin = params.timezoneOffsetMinutes ?? 60;
    const from = params.from ? new Date(params.from) : startOfDay(daysAgo(30));
    const to = params.to ? new Date(params.to) : endOfDay(new Date());
    const clinic =
      params.clinic && params.clinic !== 'all' ? params.clinic.trim() : null;

    const encounterWhere = {
      DOCTOR_ID: doctorId,
      STARTED_AT: { gte: from, lte: to },
      ...(clinic
        ? { triage: { CLINIC: { equals: clinic, mode: 'insensitive' as const } } }
        : {}),
    };

    const [
      encounters,
      encounterPersonIds,
      diagnoses,
      prescriptions,
      labRequests,
      imagingRequests,
      admissionRequests,
      dischargeDrafts,
      referralsSent,
      referralsReceived,
      followUps,
      pendingNotes,
      completedForAvg,
    ] = await Promise.all([
      this.prisma.encounters.findMany({
        where: encounterWhere,
        include: {
          person: {
            select: {
              PERSON_ID: true,
              HOSPITAL_NO: true,
              FIRST_NAME: true,
              LAST_NAME: true,
              MIDDLE_NAME: true,
              DATE_OF_BIRTH: true,
              SEX: true,
            },
          },
          triage: { select: { CLINIC: true, PATIENT_TYPE: true } },
        },
        orderBy: { STARTED_AT: 'desc' },
        take: 500,
      }),
      this.prisma.encounters.findMany({
        where: encounterWhere,
        select: { PERSON_ID: true },
        distinct: ['PERSON_ID'],
      }),
      this.prisma.patientDiagnoses.findMany({
        where: {
          CREATED_BY_ID: doctorId,
          CREATED_DATE: { gte: from, lte: to },
          ...(clinic
            ? { CLINIC: { equals: clinic, mode: 'insensitive' as const } }
            : {}),
        },
        select: {
          NAME: true,
          CODE: true,
          CLINIC: true,
          TYPE: true,
          STATUS: true,
          PERSON_ID: true,
        },
        take: 2000,
      }),
      this.prisma.prescriptions.findMany({
        where: {
          PRESCRIBED_BY_ID: doctorId,
          OR: [
            { SENT_AT: { gte: from, lte: to } },
            { CREATED_DATE: { gte: from, lte: to } },
          ],
          ...(clinic
            ? { CLINIC: { equals: clinic, mode: 'insensitive' as const } }
            : {}),
        },
        include: {
          items: { select: { DRUG_NAME: true, LINE_STATUS: true } },
          person: {
            select: {
              PERSON_ID: true,
              HOSPITAL_NO: true,
              FIRST_NAME: true,
              LAST_NAME: true,
            },
          },
        },
        take: 2000,
      }),
      this.prisma.labRequests.findMany({
        where: {
          OR: [{ DOCTOR_ID: doctorId }, { CREATED_BY_ID: doctorId }],
          CREATED_DATE: { gte: from, lte: to },
          STATUS: { not: 'Cancelled' },
        },
        include: {
          items: { select: { TEST_NAME: true, CATEGORY: true } },
        },
        take: 2000,
      }),
      this.prisma.imagingRequests.findMany({
        where: {
          OR: [{ DOCTOR_ID: doctorId }, { CREATED_BY_ID: doctorId }],
          CREATED_DATE: { gte: from, lte: to },
          STATUS: { not: 'Cancelled' },
        },
        include: {
          items: { select: { STUDY_NAME: true, MODALITY: true } },
        },
        take: 2000,
      }),
      this.prisma.admissionRequests.findMany({
        where: {
          REQUESTED_BY_USER_ID: doctorId,
          CREATED_DATE: { gte: from, lte: to },
          STATUS: { notIn: ['Cancelled', 'Rejected'] },
        },
        include: {
          ward: { select: { WARD_ID: true, CODE: true, NAME: true } },
        },
        take: 1000,
      }),
      this.prisma.dischargeDrafts.findMany({
        where: {
          REQUESTED_BY_USER_ID: doctorId,
          OR: [
            { FINALIZED_AT: { gte: from, lte: to } },
            { CREATED_DATE: { gte: from, lte: to } },
          ],
        },
        include: {
          admission: {
            include: {
              ward: { select: { WARD_ID: true, CODE: true, NAME: true } },
            },
          },
        },
        take: 1000,
      }),
      this.prisma.clinicalReferrals.findMany({
        where: {
          REQUESTED_BY_USER_ID: doctorId,
          CREATED_DATE: { gte: from, lte: to },
        },
        take: 1000,
      }),
      this.prisma.clinicalReferrals.findMany({
        where: {
          TO_DOCTOR_USER_ID: doctorId,
          CREATED_DATE: { gte: from, lte: to },
        },
        take: 1000,
      }),
      this.prisma.followUps.findMany({
        where: {
          DOCTOR_ID: doctorId,
          OR: [
            { SCHEDULED_DATE: { gte: from, lte: to } },
            { CREATED_DATE: { gte: from, lte: to } },
          ],
          ...(clinic
            ? { CLINIC: { equals: clinic, mode: 'insensitive' as const } }
            : {}),
        },
        take: 1000,
      }),
      this.prisma.clinicalNotes.count({
        where: {
          AUTHOR_ID: doctorId,
          STATUS: {
            in: [
              'Draft',
              'In Progress',
              'Awaiting Review',
              'Under Review',
              'Returned for Correction',
            ],
          },
        },
      }),
      this.prisma.encounters.findMany({
        where: {
          DOCTOR_ID: doctorId,
          STATUS: 'Completed',
          COMPLETED_AT: { not: null },
          STARTED_AT: { gte: from, lte: to },
          ...(clinic
            ? {
                triage: {
                  CLINIC: { equals: clinic, mode: 'insensitive' as const },
                },
              }
            : {}),
        },
        select: { STARTED_AT: true, COMPLETED_AT: true },
        take: 2000,
      }),
    ]);

    const uniquePatients = encounterPersonIds.length;
    const consultations = encounters.length;

    // New vs returning from triage PATIENT_TYPE when available
    let newCount = 0;
    let returningCount = 0;
    const ageBandMap = new Map<string, number>();
    const clinicCount = new Map<string, number>();
    const consultTrend = new Map<string, number>();
    const referralTrend = new Map<string, number>();

    for (const e of encounters) {
      const pt = e.triage?.PATIENT_TYPE?.toLowerCase() ?? '';
      if (pt.includes('new')) newCount += 1;
      else if (pt.includes('return')) returningCount += 1;
      else returningCount += 1;

      const band = ageBand(ageYears(e.person.DATE_OF_BIRTH));
      ageBandMap.set(band, (ageBandMap.get(band) ?? 0) + 1);

      const c = e.triage?.CLINIC?.trim() || 'Unspecified';
      clinicCount.set(c, (clinicCount.get(c) ?? 0) + 1);

      const dk = dayKey(e.STARTED_AT);
      consultTrend.set(dk, (consultTrend.get(dk) ?? 0) + 1);
    }

    // If PATIENT_TYPE was sparse, approximate new = distinct first-seen in range
    if (newCount + returningCount === 0 && uniquePatients > 0) {
      returningCount = uniquePatients;
    }

    // Payment mix from cards of seen patients
    const seenIds = encounterPersonIds.map((p) => p.PERSON_ID);
    const cards =
      seenIds.length === 0
        ? []
        : await this.prisma.patientCards.findMany({
            where: { PERSON_ID: { in: seenIds } },
            select: {
              PERSON_ID: true,
              PAYMENT_CHANNEL: true,
              CARD_TYPE: true,
              CREATED_DATE: true,
            },
            orderBy: { CREATED_DATE: 'desc' },
          });
    const latestCardByPerson = new Map<
      number,
      { PAYMENT_CHANNEL: string | null; CARD_TYPE: string }
    >();
    for (const c of cards) {
      if (!latestCardByPerson.has(c.PERSON_ID)) {
        latestCardByPerson.set(c.PERSON_ID, c);
      }
    }
    const paymentMixMap = new Map<string, number>();
    for (const c of latestCardByPerson.values()) {
      const key = c.PAYMENT_CHANNEL?.trim() || c.CARD_TYPE?.trim() || 'Unknown';
      paymentMixMap.set(key, (paymentMixMap.get(key) ?? 0) + 1);
    }
    if (paymentMixMap.size === 0 && uniquePatients > 0) {
      paymentMixMap.set('Unknown', uniquePatients);
    }

    // Diagnosis aggregation
    const dxMap = new Map<
      string,
      {
        diagnosis: string;
        code: string;
        count: number;
        newCases: number;
        followUp: number;
        clinic: string;
      }
    >();
    for (const d of diagnoses) {
      const key = d.CODE || d.NAME;
      const cur = dxMap.get(key) ?? {
        diagnosis: d.NAME,
        code: d.CODE,
        count: 0,
        newCases: 0,
        followUp: 0,
        clinic: d.CLINIC ?? '—',
      };
      cur.count += 1;
      if (d.TYPE === 'Primary' || d.STATUS === 'Active') cur.newCases += 1;
      else cur.followUp += 1;
      dxMap.set(key, cur);
    }
    const diagnosisRows = [...dxMap.values()]
      .sort((a, b) => b.count - a.count)
      .slice(0, 50)
      .map((r) => ({ ...r, trend: '—' }));

    // Prescription aggregation
    const rxMap = new Map<
      string,
      {
        drug: string;
        count: number;
        patients: Set<number>;
        clinic: string;
        alerts: number;
        stopped: number;
      }
    >();
    const rxVolumeByDay = new Map<string, number>();
    for (const rx of prescriptions) {
      const when = rx.SENT_AT ?? rx.CREATED_DATE ?? from;
      const dk = dayKey(when);
      rxVolumeByDay.set(dk, (rxVolumeByDay.get(dk) ?? 0) + 1);
      for (const item of rx.items) {
        const cur = rxMap.get(item.DRUG_NAME) ?? {
          drug: item.DRUG_NAME,
          count: 0,
          patients: new Set<number>(),
          clinic: rx.CLINIC ?? '—',
          alerts: 0,
          stopped: 0,
        };
        cur.count += 1;
        cur.patients.add(rx.PERSON_ID);
        if (
          item.LINE_STATUS === 'Stopped' ||
          item.LINE_STATUS === 'Cancelled'
        ) {
          cur.stopped += 1;
        }
        rxMap.set(item.DRUG_NAME, cur);
      }
    }
    const prescriptionRows = [...rxMap.values()]
      .sort((a, b) => b.count - a.count)
      .slice(0, 50)
      .map((r) => ({
        drug: r.drug,
        count: r.count,
        patients: r.patients.size,
        clinic: r.clinic,
        alerts: r.alerts,
        stopped: r.stopped,
      }));

    // Investigations (lab + imaging)
    const invMap = new Map<
      string,
      {
        name: string;
        type: string;
        count: number;
        completed: number;
        pending: number;
        critical: number;
      }
    >();
    let criticalTotal = 0;
    for (const lab of labRequests) {
      const isCritical =
        lab.PRIORITY === 'Stat' || lab.PRIORITY === 'Urgent' ? 1 : 0;
      criticalTotal += isCritical;
      const completed = lab.LAB_STATUS === 'Validated' ? 1 : 0;
      const pending = completed ? 0 : 1;
      for (const item of lab.items) {
        const key = `Lab:${item.TEST_NAME}`;
        const cur = invMap.get(key) ?? {
          name: item.TEST_NAME,
          type: 'Lab',
          count: 0,
          completed: 0,
          pending: 0,
          critical: 0,
        };
        cur.count += 1;
        cur.completed += completed;
        cur.pending += pending;
        cur.critical += isCritical;
        invMap.set(key, cur);
      }
    }
    for (const img of imagingRequests) {
      const isCritical =
        img.PRIORITY === 'Stat' ||
        img.PRIORITY === 'Urgent' ||
        img.PRIORITY === 'Emergency'
          ? 1
          : 0;
      criticalTotal += isCritical;
      const completed = img.STATUS === 'Completed' ? 1 : 0;
      const pending = completed ? 0 : 1;
      for (const item of img.items) {
        const key = `Imaging:${item.STUDY_NAME}`;
        const cur = invMap.get(key) ?? {
          name: item.STUDY_NAME,
          type: item.MODALITY || 'Imaging',
          count: 0,
          completed: 0,
          pending: 0,
          critical: 0,
        };
        cur.count += 1;
        cur.completed += completed;
        cur.pending += pending;
        cur.critical += isCritical;
        invMap.set(key, cur);
      }
    }
    const investigationRows = [...invMap.values()]
      .sort((a, b) => b.count - a.count)
      .slice(0, 50);

    // Admission / discharge
    const admissionsCount = admissionRequests.length;
    const dischargesCount = dischargeDrafts.filter(
      (d) => d.STATUS === 'Discharged',
    ).length;
    const pendingDrafts = dischargeDrafts.filter((d) =>
      ['Draft', 'Submitted', 'AwaitingPayment', 'PaymentCleared', 'Returned'].includes(
        d.STATUS,
      ),
    ).length;

    let losSum = 0;
    let losN = 0;
    for (const d of dischargeDrafts) {
      if (d.STATUS !== 'Discharged' || !d.FINALIZED_AT) continue;
      const admitted = d.admission?.ADMITTED_AT;
      if (!admitted) continue;
      const days =
        (d.FINALIZED_AT.getTime() - admitted.getTime()) /
        (1000 * 60 * 60 * 24);
      if (days >= 0) {
        losSum += days;
        losN += 1;
      }
    }
    const avgLosDays = losN === 0 ? 0 : Math.round((losSum / losN) * 10) / 10;

    const wardMap = new Map<string, { ward: string; count: number }>();
    for (const ar of admissionRequests) {
      const name = ar.ward?.NAME || ar.WARD_PREFERENCE || 'Unspecified';
      const cur = wardMap.get(name) ?? { ward: name, count: 0 };
      cur.count += 1;
      wardMap.set(name, cur);
    }
    for (const d of dischargeDrafts) {
      const name = d.admission?.ward?.NAME;
      if (!name) continue;
      const cur = wardMap.get(name) ?? { ward: name, count: 0 };
      cur.count += 1;
      wardMap.set(name, cur);
    }

    // Referrals
    const terminalReferral = new Set([
      'Completed',
      'ClearedExternal',
      'Rejected',
      'Cancelled',
      'Admitted',
    ]);
    const sent = referralsSent.length;
    const received = referralsReceived.length;
    const completed = referralsSent.filter((r) =>
      ['Completed', 'ClearedExternal', 'Admitted'].includes(r.STATUS),
    ).length;
    const pending = referralsSent.filter(
      (r) => !terminalReferral.has(r.STATUS),
    ).length;
    const external = referralsSent.filter(
      (r) => r.REFERRAL_KIND === 'External',
    ).length;

    for (const r of referralsSent) {
      const when = r.CREATED_DATE ?? from;
      const dk = dayKey(when);
      referralTrend.set(dk, (referralTrend.get(dk) ?? 0) + 1);
    }

    // Avg consult minutes
    let minutesSum = 0;
    let minutesN = 0;
    for (const e of completedForAvg) {
      if (!e.COMPLETED_AT) continue;
      const m =
        (e.COMPLETED_AT.getTime() - e.STARTED_AT.getTime()) / (1000 * 60);
      if (m > 0 && m < 24 * 60) {
        minutesSum += m;
        minutesN += 1;
      }
    }
    const avgConsultMinutes =
      minutesN === 0 ? 0 : Math.round(minutesSum / minutesN);

    const consultationRows = encounters.slice(0, 100).map((e) => {
      const start = e.STARTED_AT;
      const end = e.COMPLETED_AT;
      let duration = '—';
      if (end) {
        const mins = Math.round(
          (end.getTime() - start.getTime()) / (1000 * 60),
        );
        duration = `${mins} min`;
      }
      return {
        id: String(e.ENCOUNTER_ID),
        date: dayKey(start),
        patient: personName(e.person),
        hospitalId: e.person.HOSPITAL_NO ?? '',
        patientId: String(e.person.PERSON_ID),
        clinic: e.triage?.CLINIC ?? '—',
        visitType: e.triage?.PATIENT_TYPE ?? '—',
        start: start.toISOString().slice(11, 16),
        end: end ? end.toISOString().slice(11, 16) : '—',
        duration,
        outcome: e.OUTCOME ?? e.STATUS,
        payment: '—',
      };
    });

    const sortDays = (m: Map<string, number>) =>
      [...m.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, count]) => ({ date, count }));

    return {
      from: from.toISOString(),
      to: to.toISOString(),
      timezoneOffsetMinutes: offsetMin,
      clinic: clinic ?? 'all',
      doctorUserId: doctorId,
      kpis: {
        consultations,
        patients: uniquePatients,
        diagnoses: diagnoses.length,
        procedures: 0,
        admissions: admissionsCount,
        referrals: sent,
        prescriptions: prescriptions.length,
        investigations: labRequests.length + imagingRequests.length,
        discharges: dischargesCount,
        followUps: followUps.length,
        telemedicine: 0,
        critical: criticalTotal,
        avgConsultMinutes,
        pendingNotes,
      },
      charts: {
        consultationTrend: sortDays(consultTrend),
        patientsByClinic: [...clinicCount.entries()]
          .map(([clinicName, count]) => ({ clinic: clinicName, count }))
          .sort((a, b) => b.count - a.count),
        prescriptionVolume: sortDays(rxVolumeByDay),
        referralTrend: sortDays(referralTrend),
      },
      tables: {
        consultations: consultationRows,
        diagnoses: diagnosisRows,
        prescriptions: prescriptionRows,
        investigations: investigationRows,
      },
      patients: {
        newCount,
        returningCount,
        ageBands: [...ageBandMap.entries()].map(([band, count]) => ({
          band,
          count,
        })),
        paymentMix: [...paymentMixMap.entries()].map(([channel, count]) => ({
          channel,
          count,
        })),
      },
      admission: {
        admissions: admissionsCount,
        discharges: dischargesCount,
        avgLosDays,
        pendingDrafts,
        wardDistribution: [...wardMap.values()].sort(
          (a, b) => b.count - a.count,
        ),
      },
      referrals: {
        sent,
        received,
        completed,
        pending,
        external,
      },
    };
  }
}
