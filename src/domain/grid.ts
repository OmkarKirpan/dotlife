import type { DerivedUnit } from './span';

/**
 * Grid layout. Chronology runs bottom-up: the earliest dots sit in the bottom
 * row and time stacks upward, left-to-right within a row. The orphaned partial
 * row is the bottom one, holding the first (total % cols) dots.
 */

export interface Layout {
  cols: number;
  rows: number;
  /** Centre-to-centre distance between dots, px. */
  pitch: number;
  width: number;
  height: number;
  /** Dots in the bottom (partial) row; 0 when all rows are full. */
  partial: number;
  count: number;
}

export const MAX_PITCH = 64;

/** Small derived scopes read better at a fixed width. Everything else is fitted. */
export const PREFERRED_COLS: Partial<Record<DerivedUnit, number>> = {
  now: 10,
  today: 6,
  week: 7,
  month: 7,
};

function shape(count: number, cols: number, w: number, h: number) {
  const rows = Math.max(1, Math.ceil(count / cols));
  return { cols, rows, pitch: Math.min(w / cols, h / rows) };
}

export function computeLayout(count: number, width: number, height: number, preferredCols?: number): Layout {
  const n = Math.max(1, count);
  let best = shape(n, 1, width, height);
  if (preferredCols && preferredCols <= n) {
    best = shape(n, preferredCols, width, height);
  } else {
    for (let c = 2; c <= n; c++) {
      const s = shape(n, c, width, height);
      // Prefer the larger dot; on a tie prefer the wider grid.
      if (s.pitch >= best.pitch - 1e-9) best = s;
      if (width / (c + 1) < best.pitch) break; // pitch can only shrink from here
    }
  }
  const pitch = Math.max(1, Math.min(MAX_PITCH, Math.floor(best.pitch * 100) / 100));
  const partial = n % best.cols;
  return {
    cols: best.cols,
    rows: best.rows,
    pitch,
    width: best.cols * pitch,
    height: best.rows * pitch,
    partial,
    count: n,
  };
}

/** Grid cell (column, row-from-top) for chronological dot index `i`. */
export function cellOf(l: Layout, i: number): { col: number; row: number } {
  let fromBottom: number;
  let col: number;
  if (l.partial > 0 && i < l.partial) {
    fromBottom = 0;
    col = i;
  } else {
    const k = i - l.partial;
    fromBottom = (l.partial > 0 ? 1 : 0) + Math.floor(k / l.cols);
    col = k % l.cols;
  }
  return { col, row: l.rows - 1 - fromBottom };
}

/** Inverse of cellOf. Returns null for empty cells in the partial row. */
export function indexAt(l: Layout, col: number, row: number): number | null {
  if (col < 0 || col >= l.cols || row < 0 || row >= l.rows) return null;
  const fromBottom = l.rows - 1 - row;
  if (l.partial > 0) {
    if (fromBottom === 0) return col < l.partial ? col : null;
    return l.partial + (fromBottom - 1) * l.cols + col;
  }
  const i = fromBottom * l.cols + col;
  return i < l.count ? i : null;
}

/**
 * Nearest dot to a point in grid coordinates. Clamps to the grid so a drag that
 * leaves the edge keeps tracking; snaps empty partial-row cells to the row's end.
 */
export function nearestIndex(l: Layout, x: number, y: number): number {
  const col = Math.min(l.cols - 1, Math.max(0, Math.floor(x / l.pitch)));
  const row = Math.min(l.rows - 1, Math.max(0, Math.floor(y / l.pitch)));
  const i = indexAt(l, col, row);
  if (i !== null) return i;
  return l.partial - 1; // empty cell in the bottom row
}

/** Dot radius for a given pitch. Shared so the grid and the wallpaper can't drift. */
export const dotRadius = (pitch: number) => pitch * (pitch < 12 ? 0.4 : 0.36);

/** Inclusive index range held by `row`, or null when the row is outside the grid. */
export function rowIndexRange(l: Layout, row: number): { lo: number; hi: number } | null {
  if (row < 0 || row >= l.rows) return null;
  const fromBottom = l.rows - 1 - row;
  if (l.partial > 0 && fromBottom === 0) return { lo: 0, hi: l.partial - 1 };
  const full = fromBottom - (l.partial > 0 ? 1 : 0);
  const lo = l.partial + full * l.cols;
  return { lo, hi: Math.min(lo + l.cols - 1, l.count - 1) };
}

/** A horizontal stretch of one row: `len` dots starting at `col`. */
export interface Run {
  row: number;
  col: number;
  len: number;
}

/**
 * Split the inclusive index range [lo, hi] into per-row runs, bottom-up so the
 * runs come out in chronological order. Iterates rows, not indices, so a span
 * covering the whole Life grid costs ~81 steps rather than 4,175.
 */
export function rowRuns(l: Layout, lo: number, hi: number): Run[] {
  const runs: Run[] = [];
  if (hi < lo) return runs;
  for (let fromBottom = 0; fromBottom < l.rows; fromBottom++) {
    const row = l.rows - 1 - fromBottom;
    const range = rowIndexRange(l, row);
    if (!range) continue;
    const a = Math.max(lo, range.lo);
    const b = Math.min(hi, range.hi);
    if (a > b) continue;
    runs.push({ row, col: a - range.lo, len: b - a + 1 });
  }
  return runs;
}
