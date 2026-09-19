import { differenceInCalendarDays } from 'date-fns';
import type { FixedSpan, Span } from './span';
import { isDateDotted, parseLocalDate, type Resolved } from './time';

/**
 * Your spans, drawn onto whichever grid is on screen. A trip is a separate
 * scope today, so you can never see it inside your year; these map a span's
 * dates onto the current scope's dot indices so it can be drawn behind them.
 */

/** Inclusive dot indices. */
export interface DotRange {
  lo: number;
  hi: number;
}

export interface Overlay extends DotRange {
  id: string;
  label: string;
  color: string;
  /** Nesting depth among overlapping overlays; 0 is the outermost. */
  lane: number;
}

/**
 * Distinct from --accent, which already means elapsed or remaining depending on
 * the lens. An overlay must not make a claim about time.
 */
export const OVERLAY_COLORS = [
  '#4cc9f0',
  '#b388ff',
  '#5ddba4',
  '#ff7ab6',
  '#7aa2ff',
  '#e8d44d',
] as const;

/** Deepest lane rendered; anything beyond shares the last one. */
export const MAX_LANE = 2;

/** Stable per-span colour. Same span, same colour, on every device and export. */
export function overlayColor(id: string): string {
  let h = 5381;
  for (let i = 0; i < id.length; i++) h = ((h << 5) + h + id.charCodeAt(i)) >>> 0;
  return OVERLAY_COLORS[h % OVERLAY_COLORS.length];
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/**
 * The span's dates as dot indices in `r`, clamped to the grid. Null when the
 * scope has no date meaning (minute/hour dots) or the span misses it entirely.
 *
 * `span.end` is inclusive, so it is used as-is — `resolve` converts to an
 * exclusive end internally, but the dot wanted here is the one holding the
 * last day.
 */
export function spanDotRange(r: Resolved, span: FixedSpan): DotRange | null {
  if (!isDateDotted(r)) return null;
  const perDot = r.unit === 'week' ? 7 : 1;
  const toIndex = (d: Date) => Math.floor(differenceInCalendarDays(d, r.start) / perDot);
  const lo = toIndex(parseLocalDate(span.start));
  const hi = toIndex(parseLocalDate(span.end));
  if (hi < 0 || lo > r.total - 1) return null;
  return { lo: clamp(lo, 0, r.total - 1), hi: clamp(hi, 0, r.total - 1) };
}

/**
 * Greedy interval packing: each range takes the lowest lane whose previous
 * occupant has already ended. Ranges that merely touch still collide.
 */
export function packLanes(ranges: readonly DotRange[]): number[] {
  const lastHi: number[] = [];
  return ranges.map(({ lo, hi }) => {
    let lane = lastHi.findIndex((end) => end < lo);
    if (lane === -1) lane = lastHi.length;
    lastHi[lane] = hi;
    return lane;
  });
}

/**
 * Every fixed span intersecting `r`, in chronological order, with overlap lanes.
 *
 * `excludeId` drops the span that *is* the current scope — its overlay would
 * cover the whole grid and read as a rendering fault.
 */
export function spanOverlays(r: Resolved, spans: readonly Span[], excludeId?: string): Overlay[] {
  const found: (DotRange & { id: string; label: string })[] = [];
  for (const s of spans) {
    if (s.kind !== 'fixed' || s.id === excludeId) continue;
    const range = spanDotRange(r, s as FixedSpan);
    if (range) found.push({ ...range, id: s.id, label: s.label });
  }
  found.sort((a, b) => a.lo - b.lo || a.hi - b.hi);
  const lanes = packLanes(found);
  return found.map((f, i) => ({ ...f, color: overlayColor(f.id), lane: Math.min(lanes[i], MAX_LANE) }));
}

/** Overlays covering dot `i`, innermost lane first. */
export function overlaysAt(overlays: readonly Overlay[], i: number): Overlay[] {
  return overlays.filter((o) => i >= o.lo && i <= o.hi).sort((a, b) => b.lane - a.lane);
}
