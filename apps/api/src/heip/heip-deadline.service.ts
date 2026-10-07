import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  hospitalDayRangeUtc,
  parseDateOnlyUtc,
  toDateOnlyIso,
} from './heip-autofill.service';

/**
 * Marks drafts that passed deadline+grace as Missed, and Submitted/Returned
 * after deadline as Late. Triggered via executive run-deadlines (no Bull required).
 */
@Injectable()
export class HeipDeadlineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async markLateAndMissed(dateIso?: string): Promise<{
    date: string;
    markedLate: number;
    markedMissed: number;
  }> {
    const reportDate = dateIso
      ? parseDateOnlyUtc(dateIso)
      : parseDateOnlyUtc(toDateOnlyIso(new Date()));
    const dateStr = toDateOnlyIso(reportDate);
    const now = new Date();

    const templates = await this.prisma.heipReportTemplates.findMany({
      where: { IS_ACTIVE: true },
      select: {
        TEMPLATE_ID: true,
        DEADLINE_HOUR: true,
        DEADLINE_GRACE_HOURS: true,
        FREQUENCY: true,
      },
    });

    let markedLate = 0;
    let markedMissed = 0;

    for (const tpl of templates) {
      const deadline = this.deadlineInstant(
        reportDate,
        tpl.DEADLINE_HOUR,
        0,
      );
      const graceEnd = this.deadlineInstant(
        reportDate,
        tpl.DEADLINE_HOUR,
        tpl.DEADLINE_GRACE_HOURS,
      );

      if (now >= deadline) {
        const lateResult = await this.prisma.heipReports.updateMany({
          where: {
            TEMPLATE_ID: tpl.TEMPLATE_ID,
            REPORT_DATE: reportDate,
            STATUS: { in: ['Submitted', 'Returned'] },
            LATE: false,
            OR: [
              { SUBMITTED_AT: { gt: deadline } },
              { SUBMITTED_AT: null },
            ],
          },
          data: { LATE: true, UPDATED_DATE: now },
        });
        markedLate += lateResult.count;

        // Also mark already-approved that were submitted after deadline
        const lateApproved = await this.prisma.heipReports.updateMany({
          where: {
            TEMPLATE_ID: tpl.TEMPLATE_ID,
            REPORT_DATE: reportDate,
            STATUS: 'Approved',
            LATE: false,
            SUBMITTED_AT: { gt: deadline },
          },
          data: { LATE: true, UPDATED_DATE: now },
        });
        markedLate += lateApproved.count;
      }

      if (now >= graceEnd) {
        const openDrafts = await this.prisma.heipReports.findMany({
          where: {
            TEMPLATE_ID: tpl.TEMPLATE_ID,
            REPORT_DATE: reportDate,
            STATUS: 'Draft',
          },
          select: { REPORT_ID: true, STATUS: true },
        });
        for (const draft of openDrafts) {
          await this.prisma.heipReports.update({
            where: { REPORT_ID: draft.REPORT_ID },
            data: {
              STATUS: 'Missed',
              LATE: true,
              UPDATED_DATE: now,
              UPDATED_BY: 'SYSTEM',
            },
          });
          await this.prisma.heipReportEvents.create({
            data: {
              REPORT_ID: draft.REPORT_ID,
              EVENT_TYPE: 'miss',
              FROM_STATUS: 'Draft',
              TO_STATUS: 'Missed',
              COMMENT: `Missed after grace for ${dateStr}`,
              ACTOR_LABEL: 'SYSTEM',
            },
          });
          markedMissed += 1;
        }
      }
    }

    await this.audit.log({
      type: 'heip:deadline:run',
      entity: 'HEIP_REPORTS',
      createdBy: 'SYSTEM',
      newValue: { date: dateStr, markedLate, markedMissed },
    });

    return { date: dateStr, markedLate, markedMissed };
  }

  /** Deadline = next calendar day at DEADLINE_HOUR (UTC), plus grace hours. */
  private deadlineInstant(
    reportDate: Date,
    deadlineHour: number,
    graceHours: number,
  ): Date {
    const { end } = hospitalDayRangeUtc(reportDate);
    // end is start of next day; add deadline hour
    return new Date(
      end.getTime() + deadlineHour * 3600_000 + graceHours * 3600_000,
    );
  }
}
