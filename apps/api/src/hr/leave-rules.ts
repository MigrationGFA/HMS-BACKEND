/**
 * Pure leave-day / overlap helpers for HR Self-Service Phase 2.
 * Working days = Mon–Fri excluding public holidays (D3 = yes).
 */

export function toDateOnlyIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function parseDateOnlyUtc(iso: string): Date {
  return new Date(`${iso.slice(0, 10)}T00:00:00.000Z`);
}

/** Count Mon–Fri days in [start, end] inclusive, minus holiday ISO dates. */
export function countWorkingDays(
  start: Date,
  end: Date,
  holidayIsos: Iterable<string> = [],
): number {
  if (end.getTime() < start.getTime()) return 0;
  const holidays = new Set(
    [...holidayIsos].map((h) => h.slice(0, 10)),
  );
  let count = 0;
  const cur = new Date(start.getTime());
  while (cur.getTime() <= end.getTime()) {
    const dow = cur.getUTCDay(); // 0 Sun … 6 Sat
    const key = toDateOnlyIso(cur);
    if (dow !== 0 && dow !== 6 && !holidays.has(key)) {
      count += 1;
    }
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return count;
}

/** Inclusive date ranges overlap on at least one calendar day. */
export function datesOverlap(
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date,
): boolean {
  return aStart.getTime() <= bEnd.getTime() && bStart.getTime() <= aEnd.getTime();
}

export const ACTIVE_LEAVE_STATUSES = ['PendingHod', 'PendingHr', 'Approved'] as const;

export function leaveYearBounds(forDate: Date): { yearStart: Date; yearEnd: Date } {
  const year = forDate.getUTCFullYear();
  return {
    yearStart: new Date(Date.UTC(year, 0, 1)),
    yearEnd: new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999)),
  };
}

/**
 * Remaining entitlement after approved + pending (HOD/HR) days in the leave year.
 * Types with daysPerYear === 0 skip balance (caller should not enforce).
 */
export function remainingBalance(
  daysPerYear: number,
  usedDays: number,
): number {
  return daysPerYear - usedDays;
}

/** List each working day in range (for OnLeave attendance upserts). */
export function eachWorkingDay(
  start: Date,
  end: Date,
  holidayIsos: Iterable<string> = [],
): Date[] {
  if (end.getTime() < start.getTime()) return [];
  const holidays = new Set(
    [...holidayIsos].map((h) => h.slice(0, 10)),
  );
  const days: Date[] = [];
  const cur = new Date(start.getTime());
  while (cur.getTime() <= end.getTime()) {
    const dow = cur.getUTCDay();
    const key = toDateOnlyIso(cur);
    if (dow !== 0 && dow !== 6 && !holidays.has(key)) {
      days.push(new Date(cur.getTime()));
    }
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return days;
}
