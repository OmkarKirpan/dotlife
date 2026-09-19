import { describe, expect, it } from 'vitest';
import { OVERLAY_COLORS, overlayColor, overlaysAt, packLanes, spanDotRange, spanOverlays } from './overlay';
import type { FixedSpan, Span } from './span';
import { dotStart, parseLocalDate, resolve, type Resolved } from './time';

const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h);
const derived = (unit: Extract<Span, { kind: 'derived' }>['unit']): Span => ({ id: unit, kind: 'derived', unit, label: unit });
const fixed = (id: string, start: string, end: string): FixedSpan => ({ id, kind: 'fixed', start, end, label: id });

const year: Resolved = resolve(derived('year'), at(2026, 6, 15))!;
const life: Resolved = resolve(derived('life'), at(2026, 6, 15), { lifeStart: '1990-06-15', lifeYears: 80 })!;

describe('spanDotRange', () => {
  it('maps a span inside the scope to its calendar-day offsets', () => {
    expect(spanDotRange(year, fixed('a', '2026-03-01', '2026-03-10'))).toEqual({ lo: 59, hi: 68 });
  });

  it('agrees with dotStart for both ends', () => {
    const range = spanDotRange(year, fixed('a', '2026-03-01', '2026-03-10'))!;
    expect(dotStart(year, range.lo)).toEqual(parseLocalDate('2026-03-01'));
    expect(dotStart(year, range.hi)).toEqual(parseLocalDate('2026-03-10'));
  });

  it('clamps a span that straddles either edge rather than dropping it', () => {
    expect(spanDotRange(year, fixed('a', '2025-12-20', '2026-01-05'))).toEqual({ lo: 0, hi: 4 });
    expect(spanDotRange(year, fixed('b', '2026-12-28', '2027-01-09'))).toEqual({ lo: 361, hi: 364 });
    expect(spanDotRange(year, fixed('c', '2020-01-01', '2030-01-01'))).toEqual({ lo: 0, hi: year.total - 1 });
  });

  it('is null when the span misses the scope', () => {
    expect(spanDotRange(year, fixed('a', '2025-01-01', '2025-12-31'))).toBeNull();
    expect(spanDotRange(year, fixed('b', '2027-01-01', '2027-12-31'))).toBeNull();
  });

  it('is null where a dot is not a date', () => {
    const hour = resolve(derived('now'), at(2026, 6, 15))!;
    const today = resolve(derived('today'), at(2026, 6, 15))!;
    expect(spanDotRange(hour, fixed('a', '2026-06-15', '2026-06-15'))).toBeNull();
    expect(spanDotRange(today, fixed('a', '2026-06-15', '2026-06-15'))).toBeNull();
  });

  it('floors to whole weeks on week-dotted scopes', () => {
    expect(life.unit).toBe('week');
    // A three-day trip still occupies the whole week dot that holds it.
    expect(spanDotRange(life, fixed('a', '1990-06-18', '1990-06-20'))).toEqual({ lo: 0, hi: 0 });
    expect(spanDotRange(life, fixed('b', '1990-06-21', '1990-06-22'))).toEqual({ lo: 0, hi: 1 });
  });

  it('keeps a single-day span to one dot', () => {
    const r = spanDotRange(year, fixed('a', '2026-07-04', '2026-07-04'))!;
    expect(r.lo).toBe(r.hi);
  });
});

describe('packLanes', () => {
  it('keeps disjoint ranges on one lane', () => {
    expect(packLanes([{ lo: 0, hi: 3 }, { lo: 5, hi: 8 }, { lo: 10, hi: 12 }])).toEqual([0, 0, 0]);
  });

  it('stacks overlapping ranges', () => {
    expect(packLanes([{ lo: 0, hi: 10 }, { lo: 5, hi: 15 }, { lo: 6, hi: 8 }])).toEqual([0, 1, 2]);
  });

  it('treats a shared endpoint as an overlap', () => {
    expect(packLanes([{ lo: 0, hi: 5 }, { lo: 5, hi: 9 }])).toEqual([0, 1]);
  });

  it('reuses a lane once its occupant has ended', () => {
    expect(packLanes([{ lo: 0, hi: 3 }, { lo: 1, hi: 9 }, { lo: 5, hi: 7 }])).toEqual([0, 1, 0]);
  });
});

describe('spanOverlays', () => {
  const spans: Span[] = [
    derived('year'),
    fixed('trip', '2026-03-01', '2026-03-10'),
    fixed('sprint', '2026-03-05', '2026-03-20'),
    fixed('elsewhere', '2024-01-01', '2024-02-01'),
  ];

  it('returns intersecting fixed spans in chronological order', () => {
    expect(spanOverlays(year, spans).map((o) => o.id)).toEqual(['trip', 'sprint']);
  });

  it('excludes the span that is the current scope', () => {
    expect(spanOverlays(year, spans, 'trip').map((o) => o.id)).toEqual(['sprint']);
  });

  it('lanes overlapping spans apart', () => {
    expect(spanOverlays(year, spans).map((o) => o.lane)).toEqual([0, 1]);
  });

  it('is empty on a scope with no date dots', () => {
    expect(spanOverlays(resolve(derived('today'), at(2026, 6, 15))!, spans)).toEqual([]);
  });
});

describe('overlayColor', () => {
  it('is stable for an id', () => {
    expect(overlayColor('abc')).toBe(overlayColor('abc'));
  });

  it('is always from the palette', () => {
    for (let i = 0; i < 50; i++) expect(OVERLAY_COLORS).toContain(overlayColor(`span-${i}`));
  });

  it('spreads across the palette', () => {
    const used = new Set(Array.from({ length: 50 }, (_, i) => overlayColor(`span-${i}`)));
    expect(used.size).toBeGreaterThan(1);
  });
});

describe('overlaysAt', () => {
  const overlays = spanOverlays(year, [fixed('trip', '2026-03-01', '2026-03-10'), fixed('sprint', '2026-03-05', '2026-03-20')]);

  it('finds every overlay covering a dot, innermost first', () => {
    // 59 = Mar 1, 63 = Mar 5 where the sprint joins, 70 = Mar 12 where the trip has ended.
    expect(overlaysAt(overlays, 64).map((o) => o.id)).toEqual(['sprint', 'trip']);
    expect(overlaysAt(overlays, 59).map((o) => o.id)).toEqual(['trip']);
    expect(overlaysAt(overlays, 70).map((o) => o.id)).toEqual(['sprint']);
  });

  it('is empty off the spans', () => {
    expect(overlaysAt(overlays, 0)).toEqual([]);
  });
});
