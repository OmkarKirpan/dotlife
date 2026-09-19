import {
  addDays,
  addHours,
  addMinutes,
  addYears,
  differenceInCalendarDays,
  differenceInHours,
  differenceInMinutes,
  format,
  getDaysInMonth,
  startOfDay,
  startOfHour,
  startOfMonth,
  startOfWeek,
  startOfYear,
} from 'date-fns';
import { DEFAULT_LIFE_YEARS, type DotUnit, type Span } from './span';

/**
 * Local wall-clock throughout. Boundaries at local midnight.
 * Day counts are calendar-day differences — never ms / 86_400_000.
 */

export const WEEK_STARTS_ON = 1 as const; // Monday
/** Fixed spans longer than this (in days) switch to week dots. */
export const WEEK_DOT_THRESHOLD_DAYS = 730;

export interface ResolveContext {
  lifeStart?: string;
  lifeYears?: number;
}

export interface Resolved {
  start: Date;
  /** Exclusive end instant. */
  end: Date;
  unit: DotUnit;
  /** In the scope's unit. */
  total: number;
  elapsed: number;
  remaining: number;
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Parse 'YYYY-MM-DD' as local midnight. `new Date('YYYY-MM-DD')` would be UTC. */
export function parseLocalDate(s: string): Date {
  const m = DATE_RE.exec(s);
  if (!m) throw new Error(`Invalid date: ${s}`);
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(y, mo - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) {
    throw new Error(`Invalid date: ${s}`);
  }
  return date;
}

export function isValidDateString(s: unknown): s is string {
  if (typeof s !== 'string') return false;
  try {
    parseLocalDate(s);
    return true;
  } catch {
    return false;
  }
}

export function toDateString(d: Date): string {
  return format(d, 'yyyy-MM-dd');
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

function build(start: Date, end: Date, unit: DotUnit, total: number, elapsedRaw: number): Resolved {
  const elapsed = clamp(elapsedRaw, 0, total);
  return { start, end, unit, total, elapsed, remaining: total - elapsed };
}

/** Day-dotted range [start, endExclusive) in local calendar days. */
function dayRange(start: Date, endExclusive: Date, now: Date): Resolved {
  const total = differenceInCalendarDays(endExclusive, start);
  return build(start, endExclusive, 'day', total, differenceInCalendarDays(now, start));
}

/** Week-dotted range. The final week may be partial; it still counts as one dot. */
function weekRange(start: Date, endExclusive: Date, now: Date): Resolved {
  const days = differenceInCalendarDays(endExclusive, start);
  const total = Math.ceil(days / 7);
  const elapsedDays = differenceInCalendarDays(now, start);
  const elapsed = elapsedDays >= days ? total : Math.floor(elapsedDays / 7);
  return build(start, endExclusive, 'week', total, elapsed);
}

/**
 * The whole domain layer. Returns null only when the span cannot be resolved
 * yet (Life scope with no birth date configured).
 *
 * `elapsed` counts fully-passed dots; the dot containing `now` is the first
 * remaining one. So on Dec 31 the year has 1 day left, not 0.
 */
export function resolve(span: Span, now: Date, ctx: ResolveContext = {}): Resolved | null {
  if (span.kind === 'fixed') {
    const start = parseLocalDate(span.start);
    const endExclusive = addDays(parseLocalDate(span.end), 1);
    const days = differenceInCalendarDays(endExclusive, start);
    return days > WEEK_DOT_THRESHOLD_DAYS
      ? weekRange(start, endExclusive, now)
      : dayRange(start, endExclusive, now);
  }

  switch (span.unit) {
    case 'now': {
      const start = startOfHour(now);
      const end = addHours(start, 1);
      return build(start, end, 'minute', differenceInMinutes(end, start), differenceInMinutes(now, start));
    }
    case 'today': {
      const start = startOfDay(now);
      const end = startOfDay(addDays(start, 1));
      // 23 or 25 on DST transition days — those hours really do (not) exist.
      // Ceil so half-hour shifts (Lord Howe) keep the last partial hour as a dot.
      const total = Math.ceil(differenceInMinutes(end, start) / 60);
      return build(start, end, 'hour', total, differenceInHours(now, start));
    }
    case 'week': {
      const start = startOfWeek(now, { weekStartsOn: WEEK_STARTS_ON });
      return dayRange(start, addDays(start, 7), now);
    }
    case 'month': {
      const start = startOfMonth(now);
      return dayRange(start, addDays(start, getDaysInMonth(start)), now);
    }
    case 'year': {
      const start = startOfYear(now);
      return dayRange(start, addYears(start, 1), now);
    }
    case 'life': {
      if (!ctx.lifeStart || !isValidDateString(ctx.lifeStart)) return null;
      const start = parseLocalDate(ctx.lifeStart);
      return weekRange(start, addYears(start, ctx.lifeYears ?? DEFAULT_LIFE_YEARS), now);
    }
  }
}

/** Start instant of dot `i`. */
export function dotStart(r: Resolved, i: number): Date {
  switch (r.unit) {
    case 'minute':
      return addMinutes(r.start, i);
    case 'hour':
      return addHours(r.start, i);
    case 'day':
      return addDays(r.start, i);
    case 'week':
      return addDays(r.start, i * 7);
  }
}

/** Last calendar day covered by dot `i` (inclusive). Only meaningful for day/week dots. */
export function dotLastDay(r: Resolved, i: number): Date {
  const last = addDays(r.end, -1);
  const d = r.unit === 'week' ? addDays(r.start, i * 7 + 6) : dotStart(r, i);
  return d > last ? last : d;
}

/** Scopes where a dot is at least a day, so a drag maps to a date range. */
export function isDateDotted(r: Resolved): boolean {
  return r.unit === 'day' || r.unit === 'week';
}

export function daysLeftInCurrentYear(now: Date): number {
  return resolve({ id: 'badge', kind: 'derived', unit: 'year', label: '' }, now)!.remaining;
}

/** Next local midnight after `now`. */
export function nextLocalMidnight(now: Date): Date {
  return startOfDay(addDays(now, 1));
}

/**
 * Chronological dot index containing `date`, or null when the scope is not
 * date-dotted or the date falls outside it. The inverse of `dotStart`.
 */
export function dotIndexOfDate(r: Resolved, date: Date): number | null {
  if (!isDateDotted(r)) return null;
  const days = differenceInCalendarDays(date, r.start);
  if (days < 0) return null;
  const i = r.unit === 'week' ? Math.floor(days / 7) : days;
  return i > r.total - 1 ? null : i;
}
