import { describe, expect, it } from 'vitest';
import type { Span } from './span';
import {
  daysLeftInCurrentYear,
  dotIndexOfDate,
  isSteppable,
  stepAnchor,
  dotLastDay,
  dotStart,
  nextLocalMidnight,
  parseLocalDate,
  resolve,
  toDateString,
} from './time';

const TZ = process.env.TZ ?? Intl.DateTimeFormat().resolvedOptions().timeZone;

const derived = (unit: Extract<Span, { kind: 'derived' }>['unit']): Span => ({
  id: unit,
  kind: 'derived',
  unit,
  label: unit,
});
const fixed = (start: string, end: string): Span => ({ id: 'f', kind: 'fixed', start, end, label: '' });
const at = (y: number, mo: number, d: number, h = 0, mi = 0, s = 0) => new Date(y, mo - 1, d, h, mi, s);

describe(`time semantics (TZ=${TZ})`, () => {
  it('parses YYYY-MM-DD as local midnight, not UTC', () => {
    const d = parseLocalDate('2026-03-08');
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()]).toEqual([2026, 2, 8, 0, 0]);
    expect(toDateString(d)).toBe('2026-03-08');
  });

  it('rejects impossible dates', () => {
    expect(() => parseLocalDate('2026-02-29')).toThrow();
    expect(() => parseLocalDate('2026-13-01')).toThrow();
    expect(() => parseLocalDate('2026-3-1')).toThrow();
    expect(parseLocalDate('2028-02-29').getDate()).toBe(29);
  });

  describe('year', () => {
    it('365 days in a common year; today counts as remaining', () => {
      expect(resolve(derived('year'), at(2026, 1, 1, 0, 0))).toMatchObject({ total: 365, elapsed: 0, remaining: 365 });
      expect(resolve(derived('year'), at(2026, 12, 31, 23, 59))).toMatchObject({ elapsed: 364, remaining: 1 });
    });

    it('366 days in a leap year, Feb 29 is day 60', () => {
      expect(resolve(derived('year'), at(2028, 2, 29, 12))).toMatchObject({ total: 366, elapsed: 59 });
      expect(resolve(derived('year'), at(2028, 3, 1, 0, 0))).toMatchObject({ elapsed: 60, remaining: 306 });
      expect(resolve(derived('year'), at(2028, 12, 31, 12))).toMatchObject({ elapsed: 365, remaining: 1 });
    });

    it('badge value is days left in the year', () => {
      expect(daysLeftInCurrentYear(at(2026, 9, 19, 13, 25))).toBe(104);
      expect(daysLeftInCurrentYear(at(2026, 12, 31, 23, 59, 59))).toBe(1);
      expect(daysLeftInCurrentYear(at(2027, 1, 1, 0, 0, 0))).toBe(365);
    });
  });

  describe('month / week', () => {
    it('month length follows the calendar', () => {
      expect(resolve(derived('month'), at(2026, 2, 10))!.total).toBe(28);
      expect(resolve(derived('month'), at(2028, 2, 10))!.total).toBe(29);
      expect(resolve(derived('month'), at(2026, 9, 19, 13))).toMatchObject({ total: 30, elapsed: 18, remaining: 12 });
    });

    it('weeks start on Monday', () => {
      // 2026-09-19 is a Saturday
      const r = resolve(derived('week'), at(2026, 9, 19, 13))!;
      expect(toDateString(r.start)).toBe('2026-09-14');
      expect(r).toMatchObject({ total: 7, elapsed: 5, remaining: 2 });
      expect(resolve(derived('week'), at(2026, 9, 14, 0, 0))).toMatchObject({ elapsed: 0 });
      expect(resolve(derived('week'), at(2026, 9, 20, 23, 59))).toMatchObject({ elapsed: 6, remaining: 1 });
    });
  });

  describe('now / today', () => {
    it('the hour is 60 minute dots', () => {
      expect(resolve(derived('now'), at(2026, 9, 19, 14, 32, 40))).toMatchObject({
        unit: 'minute',
        total: 60,
        elapsed: 32,
        remaining: 28,
      });
    });

    it('an ordinary day is 24 hour dots', () => {
      expect(resolve(derived('today'), at(2026, 9, 19, 13, 25))).toMatchObject({
        unit: 'hour',
        total: 24,
        elapsed: 13,
        remaining: 11,
      });
    });
  });

  describe('fixed spans', () => {
    it('endpoints are inclusive and clamp outside the span', () => {
      const s = fixed('2026-03-03', '2026-04-18');
      expect(resolve(s, at(2026, 1, 1))).toMatchObject({ unit: 'day', total: 47, elapsed: 0, remaining: 47 });
      expect(resolve(s, at(2026, 3, 3, 23))).toMatchObject({ elapsed: 0, remaining: 47 });
      expect(resolve(s, at(2026, 4, 18, 12))).toMatchObject({ elapsed: 46, remaining: 1 });
      expect(resolve(s, at(2026, 4, 19))).toMatchObject({ elapsed: 47, remaining: 0 });
    });

    it('a single-day span is one dot', () => {
      expect(resolve(fixed('2026-09-19', '2026-09-19'), at(2026, 9, 19, 8))).toMatchObject({ total: 1, remaining: 1 });
    });

    it('switches to week dots past 730 days', () => {
      // 2026-01-01..2027-12-31 = 730 days → still days
      expect(resolve(fixed('2026-01-01', '2027-12-31'), at(2026, 1, 1))).toMatchObject({ unit: 'day', total: 730 });
      // 2026-01-01..2028-12-31 = 1096 days → 157 weeks (last one partial)
      const r = resolve(fixed('2026-01-01', '2028-12-31'), at(2026, 1, 8))!;
      expect(r).toMatchObject({ unit: 'week', total: 157, elapsed: 1 });
      expect(resolve(fixed('2026-01-01', '2028-12-31'), at(2028, 12, 31, 12))).toMatchObject({ elapsed: 156, remaining: 1 });
      expect(resolve(fixed('2026-01-01', '2028-12-31'), at(2029, 1, 1))).toMatchObject({ elapsed: 157, remaining: 0 });
      expect(toDateString(dotLastDay(r, 156))).toBe('2028-12-31');
    });
  });

  describe('life', () => {
    it('needs a birth date', () => {
      expect(resolve(derived('life'), at(2026, 9, 19))).toBeNull();
      expect(resolve(derived('life'), at(2026, 9, 19), { lifeStart: 'nope' })).toBeNull();
    });

    it('is ~4,200 week dots', () => {
      const r = resolve(derived('life'), at(2026, 9, 19, 13), { lifeStart: '1990-05-10', lifeYears: 80 })!;
      // 80 years incl. 20 leap days = 29,220 days → 4,174.3 → 4,175 dots
      expect(r).toMatchObject({ unit: 'week', total: 4175 });
      // 1990-05-10 → 2026-09-19 = 13,281 days → 1,897 full weeks
      expect(r.elapsed).toBe(1897);
    });
  });

  it('dot starts step by calendar unit', () => {
    const r = resolve(derived('year'), at(2026, 6, 1))!;
    expect(toDateString(dotStart(r, 0))).toBe('2026-01-01');
    expect(toDateString(dotStart(r, 364))).toBe('2026-12-31');
    for (let i = 0; i < 365; i++) expect(dotStart(r, i).getHours()).toBe(0);
  });

  it('next local midnight is always 00:00 the next calendar day', () => {
    const n = nextLocalMidnight(at(2026, 9, 19, 13, 25));
    expect(toDateString(n)).toBe('2026-09-20');
    expect([n.getHours(), n.getMinutes()]).toEqual([0, 0]);
  });
});

describe.runIf(TZ === 'America/New_York')('DST — America/New_York', () => {
  it('spring-forward day has 23 hours', () => {
    expect(resolve(derived('today'), at(2026, 3, 8, 12))).toMatchObject({ total: 23, elapsed: 11, remaining: 12 });
    expect(resolve(derived('today'), at(2026, 3, 8, 23, 30))).toMatchObject({ elapsed: 22, remaining: 1 });
  });

  it('fall-back day has 25 hours', () => {
    expect(resolve(derived('today'), at(2026, 11, 1, 12))).toMatchObject({ total: 25, elapsed: 13, remaining: 12 });
    expect(resolve(derived('today'), at(2026, 11, 1, 23, 30))).toMatchObject({ elapsed: 24, remaining: 1 });
  });

  it('day counts across spring-forward are calendar days, not ms/86.4M', () => {
    const s = fixed('2026-03-01', '2026-03-31');
    // 00:30 on Mar 9: only 7d 23.5h of wall time since Mar 1 — naive division says 7.
    const now = at(2026, 3, 9, 0, 30);
    expect(Math.floor((now.getTime() - parseLocalDate('2026-03-01').getTime()) / 86_400_000)).toBe(7);
    expect(resolve(s, now)).toMatchObject({ total: 31, elapsed: 8 });
  });

  it('dot indices are unaffected by the spring-forward day', () => {
    const r = resolve(derived('year'), at(2026, 6, 1, 12))!;
    // Mar 9 is the day after the shift; index is its calendar-day offset, 67.
    expect(dotIndexOfDate(r, parseLocalDate('2026-03-09'))).toBe(67);
    // A 10-day span either side of the shift spans the same number of dots.
    const across = dotIndexOfDate(r, parseLocalDate('2026-03-13'))! - dotIndexOfDate(r, parseLocalDate('2026-03-03'))!;
    const away = dotIndexOfDate(r, parseLocalDate('2026-07-13'))! - dotIndexOfDate(r, parseLocalDate('2026-07-03'))!;
    expect(across).toBe(away);
  });

  it('year still has 365 days and midnight stays midnight across DST', () => {
    expect(resolve(derived('year'), at(2026, 3, 9, 0, 30))).toMatchObject({ total: 365, elapsed: 67 });
    const n = nextLocalMidnight(at(2026, 3, 7, 22));
    expect(toDateString(n)).toBe('2026-03-08');
    expect(n.getHours()).toBe(0);
  });
});

describe.runIf(TZ === 'Australia/Lord_Howe')('DST — Australia/Lord_Howe (30-minute shift)', () => {
  it('23.5-hour day keeps the partial hour as a dot', () => {
    // DST starts first Sunday of October: 2026-10-04, 02:00 → 02:30
    expect(resolve(derived('today'), at(2026, 10, 4, 12))!.total).toBe(24);
    expect(resolve(derived('today'), at(2026, 10, 4, 23, 45))!.remaining).toBeGreaterThanOrEqual(1);
  });

  it('calendar-day counts survive the half-hour shift', () => {
    expect(resolve(fixed('2026-10-01', '2026-10-31'), at(2026, 10, 5, 0, 15))).toMatchObject({ elapsed: 4 });
  });
});

describe('dotIndexOfDate', () => {
  const year = resolve(derived('year'), at(2026, 6, 15, 12))!;

  it('is the inverse of dotStart and dotLastDay', () => {
    for (const i of [0, 1, 58, 200, year.total - 1]) {
      expect(dotIndexOfDate(year, dotStart(year, i))).toBe(i);
      expect(dotIndexOfDate(year, dotLastDay(year, i))).toBe(i);
    }
  });

  it('maps a known date to its calendar-day offset', () => {
    expect(dotIndexOfDate(year, parseLocalDate('2026-01-01'))).toBe(0);
    expect(dotIndexOfDate(year, parseLocalDate('2026-03-01'))).toBe(59); // 31 + 28
    expect(dotIndexOfDate(year, parseLocalDate('2026-12-31'))).toBe(364);
  });

  it('counts the leap day', () => {
    const leap = resolve(derived('year'), at(2028, 6, 15, 12))!;
    expect(leap.total).toBe(366);
    expect(dotIndexOfDate(leap, parseLocalDate('2028-03-01'))).toBe(60);
  });

  it('is null outside the scope', () => {
    expect(dotIndexOfDate(year, parseLocalDate('2025-12-31'))).toBeNull();
    expect(dotIndexOfDate(year, parseLocalDate('2027-01-01'))).toBeNull();
  });

  it('is null where a dot is not a date', () => {
    expect(dotIndexOfDate(resolve(derived('now'), at(2026, 6, 15, 12))!, parseLocalDate('2026-06-15'))).toBeNull();
    expect(dotIndexOfDate(resolve(derived('today'), at(2026, 6, 15, 12))!, parseLocalDate('2026-06-15'))).toBeNull();
  });

  it('floors to the week on week-dotted scopes', () => {
    const life = resolve(derived('life'), at(2026, 6, 15, 12), { lifeStart: '1990-06-15', lifeYears: 80 })!;
    expect(life.unit).toBe('week');
    expect(dotIndexOfDate(life, parseLocalDate('1990-06-15'))).toBe(0);
    expect(dotIndexOfDate(life, parseLocalDate('1990-06-21'))).toBe(0);
    expect(dotIndexOfDate(life, parseLocalDate('1990-06-22'))).toBe(1);
  });
});

describe('anchor', () => {
  const now = at(2026, 6, 15, 12);

  it('defaults to now, changing nothing', () => {
    expect(resolve(derived('year'), now)).toEqual(resolve(derived('year'), now, {}, now));
  });

  it('shows a past window fully elapsed', () => {
    const last = resolve(derived('year'), now, {}, at(2025, 6, 15, 12))!;
    expect(last.total).toBe(365);
    expect(last.elapsed).toBe(365);
    expect(last.remaining).toBe(0);
    expect(toDateString(last.start)).toBe('2025-01-01');
  });

  it('shows a future window empty', () => {
    const next = resolve(derived('year'), now, {}, at(2027, 6, 15, 12))!;
    expect(next.total).toBe(365);
    expect(next.elapsed).toBe(0);
    expect(next.remaining).toBe(365);
    expect(toDateString(next.start)).toBe('2027-01-01');
  });

  it('keeps the window true to the anchored period, not to now', () => {
    // February 2028 is a leap month; anchoring there must not borrow June's length.
    const feb = resolve(derived('month'), now, {}, at(2028, 2, 10, 12))!;
    expect(feb.total).toBe(29);
    expect(toDateString(feb.start)).toBe('2028-02-01');
  });

  it('anchors every steppable scope', () => {
    const anchor = at(2027, 3, 10, 9);
    expect(toDateString(resolve(derived('today'), now, {}, anchor)!.start)).toBe('2027-03-10');
    expect(toDateString(resolve(derived('week'), now, {}, anchor)!.start)).toBe('2027-03-08'); // Monday
    expect(resolve(derived('now'), now, {}, anchor)!.start.getHours()).toBe(9);
  });

  it('ignores the anchor for Life and for fixed spans', () => {
    const ctx = { lifeStart: '1990-06-15', lifeYears: 80 };
    const a = resolve(derived('life'), now, ctx)!;
    const b = resolve(derived('life'), now, ctx, at(2040, 1, 1))!;
    expect(a).toEqual(b);
    expect(resolve(fixed('2026-03-01', '2026-03-31'), now)).toEqual(
      resolve(fixed('2026-03-01', '2026-03-31'), now, {}, at(2030, 1, 1)),
    );
  });
});

describe('stepAnchor', () => {
  const anchor = at(2026, 3, 15, 10);

  it('moves by one window of the scope', () => {
    expect(toDateString(stepAnchor('year', anchor, 1))).toBe('2027-03-15');
    expect(toDateString(stepAnchor('month', anchor, -1))).toBe('2026-02-15');
    expect(toDateString(stepAnchor('week', anchor, 1))).toBe('2026-03-22');
    expect(toDateString(stepAnchor('today', anchor, -1))).toBe('2026-03-14');
    expect(stepAnchor('now', anchor, 2).getHours()).toBe(12);
  });

  it('clamps a month step to the shorter month', () => {
    // date-fns keeps Jan 31 from overflowing into March.
    expect(toDateString(stepAnchor('month', at(2026, 1, 31, 10), 1))).toBe('2026-02-28');
  });

  it('round-trips', () => {
    for (const u of ['now', 'today', 'week', 'month', 'year'] as const) {
      expect(stepAnchor(u, stepAnchor(u, anchor, 3), -3)).toEqual(anchor);
    }
  });

  it('leaves Life alone, because its window comes from a birth date', () => {
    expect(stepAnchor('life', anchor, 5)).toEqual(anchor);
    expect(isSteppable(derived('life'))).toBe(false);
    expect(isSteppable(derived('year'))).toBe(true);
    expect(isSteppable(fixed('2026-01-01', '2026-01-31'))).toBe(false);
  });
});
