import { differenceInCalendarDays, format } from 'date-fns';
import type { DotUnit, FixedSpan } from './span';
import { parseLocalDate, type Resolved } from './time';

export type Lens = 'left' | 'since' | 'ahead';

const UNIT_WORDS: Record<DotUnit, [string, string]> = {
  minute: ['minute', 'minutes'],
  hour: ['hour', 'hours'],
  day: ['day', 'days'],
  week: ['week', 'weeks'],
};

export function plural(n: number, unit: DotUnit): string {
  const [one, many] = UNIT_WORDS[unit];
  return `${n.toLocaleString()} ${n === 1 ? one : many}`;
}

/** Percent that never rounds a non-empty remainder to 0 or a partial one to 100. */
export function percent(part: number, total: number): number {
  if (total <= 0) return 0;
  if (part <= 0) return 0;
  if (part >= total) return 100;
  return Math.min(99, Math.max(1, Math.round((part / total) * 100)));
}

export function headline(r: Resolved, lens: Exclude<Lens, 'ahead'>, asPercent: boolean): string {
  if (lens === 'left') {
    return asPercent ? `${percent(r.remaining, r.total)}% left` : `${plural(r.remaining, r.unit)} left`;
  }
  return asPercent ? `${percent(r.elapsed, r.total)}% gone` : `${plural(r.elapsed, r.unit)} since`;
}

/** Auto-name for a drag-created span: "Mar 3 – Apr 18". Years added only when needed. */
export function rangeLabel(start: string, end: string, now: Date): string {
  const s = parseLocalDate(start);
  const e = parseLocalDate(end);
  const sameYear = s.getFullYear() === e.getFullYear();
  const thisYear = sameYear && s.getFullYear() === now.getFullYear();
  if (start === end) return format(s, thisYear ? 'MMM d' : 'MMM d, yyyy');
  if (thisYear) return `${format(s, 'MMM d')} – ${format(e, 'MMM d')}`;
  if (sameYear) return `${format(s, 'MMM d')} – ${format(e, 'MMM d, yyyy')}`;
  return `${format(s, 'MMM d, yyyy')} – ${format(e, 'MMM d, yyyy')}`;
}

export function dotLabel(unit: DotUnit, d: Date): string {
  switch (unit) {
    case 'minute':
      return format(d, 'HH:mm');
    case 'hour':
      return format(d, 'HH:00');
    case 'day':
      return format(d, 'EEE, MMM d, yyyy');
    case 'week':
      return `Week of ${format(d, 'MMM d, yyyy')}`;
  }
}

/** "in 12 days" / "tomorrow" / "today" for the Ahead lens. */
export function startsIn(span: FixedSpan, now: Date): string {
  const d = differenceInCalendarDays(parseLocalDate(span.start), now);
  if (d <= 0) return 'today';
  if (d === 1) return 'tomorrow';
  return `in ${d.toLocaleString()} days`;
}

export function spanLength(span: FixedSpan): string {
  const days = differenceInCalendarDays(parseLocalDate(span.end), parseLocalDate(span.start)) + 1;
  return plural(days, 'day');
}
