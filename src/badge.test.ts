import { describe, expect, it } from 'vitest';
import { badgeValue } from './badge';
import type { Span } from './domain/span';
import { daysLeftInCurrentYear, resolve } from './domain/time';

const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h);
const derived = (unit: Extract<Span, { kind: 'derived' }>['unit']): Span => ({ id: unit, kind: 'derived', unit, label: unit });
const fixed = (start: string, end: string): Span => ({ id: 'f', kind: 'fixed', start, end, label: 'f' });

describe('badgeValue', () => {
  const now = at(2026, 6, 15);

  it('counts down the active day-dotted scope', () => {
    expect(badgeValue(derived('year'), now)).toBe(resolve(derived('year'), now)!.remaining);
    expect(badgeValue(derived('month'), now)).toBe(16); // June has 30 days
    expect(badgeValue(fixed('2026-06-01', '2026-06-30'), now)).toBe(16);
  });

  it('counts weeks for a week-dotted scope', () => {
    const ctx = { lifeStart: '1990-06-15', lifeYears: 80 };
    expect(badgeValue(derived('life'), now, ctx)).toBe(resolve(derived('life'), now, ctx)!.remaining);
  });

  it('falls back to the year for scopes finer than a day', () => {
    // These would be stale within the hour and nothing refreshes them.
    expect(badgeValue(derived('now'), now)).toBe(daysLeftInCurrentYear(now));
    expect(badgeValue(derived('today'), now)).toBe(daysLeftInCurrentYear(now));
  });

  it('falls back when the scope cannot resolve or is missing', () => {
    expect(badgeValue(derived('life'), now)).toBe(daysLeftInCurrentYear(now)); // no birth date
    expect(badgeValue(null, now)).toBe(daysLeftInCurrentYear(now));
  });

  it('is never negative, even for a span that has ended', () => {
    expect(badgeValue(fixed('2020-01-01', '2020-12-31'), now)).toBe(0);
  });
});
