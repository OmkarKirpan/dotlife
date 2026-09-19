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
