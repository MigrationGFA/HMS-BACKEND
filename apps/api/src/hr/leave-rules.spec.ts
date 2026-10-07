import {
  countWorkingDays,
  datesOverlap,
  eachWorkingDay,
  leaveYearBounds,
  parseDateOnlyUtc,
  remainingBalance,
} from './leave-rules';

describe('leave-rules (Phase 2)', () => {
  describe('countWorkingDays', () => {
    it('counts Mon–Fri only', () => {
      // 2026-10-05 Mon … 2026-10-09 Fri = 5
      const start = parseDateOnlyUtc('2026-10-05');
      const end = parseDateOnlyUtc('2026-10-09');
      expect(countWorkingDays(start, end)).toBe(5);
    });

    it('excludes weekends', () => {
      // Fri–Mon = Fri + Mon = 2
      const start = parseDateOnlyUtc('2026-10-09');
      const end = parseDateOnlyUtc('2026-10-12');
      expect(countWorkingDays(start, end)).toBe(2);
    });

    it('excludes public holidays (D3)', () => {
      const start = parseDateOnlyUtc('2026-10-05');
      const end = parseDateOnlyUtc('2026-10-09');
      expect(countWorkingDays(start, end, ['2026-10-07'])).toBe(4);
    });

    it('returns 0 when range is inverted', () => {
      expect(
        countWorkingDays(
          parseDateOnlyUtc('2026-10-10'),
          parseDateOnlyUtc('2026-10-01'),
        ),
      ).toBe(0);
    });
  });

  describe('datesOverlap', () => {
    it('detects overlapping ranges', () => {
      expect(
        datesOverlap(
          parseDateOnlyUtc('2026-10-01'),
          parseDateOnlyUtc('2026-10-05'),
          parseDateOnlyUtc('2026-10-05'),
          parseDateOnlyUtc('2026-10-10'),
        ),
      ).toBe(true);
    });

    it('allows adjacent non-overlapping ranges', () => {
      expect(
        datesOverlap(
          parseDateOnlyUtc('2026-10-01'),
          parseDateOnlyUtc('2026-10-04'),
          parseDateOnlyUtc('2026-10-05'),
          parseDateOnlyUtc('2026-10-10'),
        ),
      ).toBe(false);
    });
  });

  describe('remainingBalance', () => {
    it('subtracts used days from entitlement', () => {
      expect(remainingBalance(30, 12)).toBe(18);
    });
  });

  describe('leaveYearBounds', () => {
    it('uses calendar year (D2)', () => {
      const { yearStart, yearEnd } = leaveYearBounds(
        parseDateOnlyUtc('2026-06-15'),
      );
      expect(yearStart.toISOString().slice(0, 10)).toBe('2026-01-01');
      expect(yearEnd.toISOString().slice(0, 10)).toBe('2026-12-31');
    });
  });

  describe('eachWorkingDay', () => {
    it('lists working days for attendance OnLeave upserts', () => {
      const days = eachWorkingDay(
        parseDateOnlyUtc('2026-10-08'),
        parseDateOnlyUtc('2026-10-12'),
        ['2026-10-09'],
      );
      expect(days.map((d) => d.toISOString().slice(0, 10))).toEqual([
        '2026-10-08',
        '2026-10-12',
      ]);
    });
  });
});
