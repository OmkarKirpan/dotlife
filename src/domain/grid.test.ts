import { describe, expect, it } from 'vitest';
import { cellOf, computeLayout, dotRadius, indexAt, MAX_PITCH, nearestIndex, rowIndexRange, rowRuns } from './grid';

describe('grid layout', () => {
  it('always fits the box', () => {
    for (const [n, w, h] of [
      [365, 360, 560],
      [4175, 360, 560],
      [4175, 1200, 700],
      [7, 360, 560],
      [60, 1000, 300],
      [1, 50, 50],
    ]) {
      const l = computeLayout(n, w, h);
      expect(l.cols * l.rows).toBeGreaterThanOrEqual(n);
      expect(l.width).toBeLessThanOrEqual(w + 0.01);
      expect(l.height).toBeLessThanOrEqual(h + 0.01);
      expect(l.pitch).toBeLessThanOrEqual(MAX_PITCH);
    }
  });

  it('life stays legible on a phone', () => {
    expect(computeLayout(4175, 360, 560).pitch).toBeGreaterThanOrEqual(6);
  });

  it('honours preferred columns', () => {
    expect(computeLayout(7, 360, 560, 7)).toMatchObject({ cols: 7, rows: 1, partial: 0 });
  });

  it('first dots sit in the partial bottom row; time stacks upward', () => {
    const l = computeLayout(365, 300, 480);
    const partial = 365 % l.cols;
    expect(l.partial).toBe(partial);
    expect(cellOf(l, 0)).toEqual({ col: 0, row: l.rows - 1 });
    expect(cellOf(l, 364).row).toBe(0);
    expect(cellOf(l, 364).col).toBe(l.cols - 1);
    if (partial > 0) expect(cellOf(l, partial)).toEqual({ col: 0, row: l.rows - 2 });
  });

  it('cellOf and indexAt are inverses', () => {
    for (const [n, cols] of [
      [365, 15],
      [366, 14],
      [60, 10],
      [24, 6],
      [31, 7],
      [4175, 52],
    ]) {
      const l = computeLayout(n, 1000, 1000, cols);
      const seen = new Set<string>();
      for (let i = 0; i < n; i++) {
        const { col, row } = cellOf(l, i);
        expect(indexAt(l, col, row)).toBe(i);
        seen.add(`${col},${row}`);
      }
      expect(seen.size).toBe(n);
    }
  });

  it('nearestIndex clamps and snaps empty cells', () => {
    const l = computeLayout(31, 700, 500, 7); // 3 in bottom row
    expect(l.partial).toBe(3);
    expect(nearestIndex(l, -50, 1e6)).toBe(0);
    expect(nearestIndex(l, 1e6, -50)).toBe(30);
    expect(nearestIndex(l, l.pitch * 6.5, l.pitch * (l.rows - 0.5))).toBe(2);
  });
});

const LAYOUTS = [
  computeLayout(365, 360, 560),
  computeLayout(4175, 360, 560),
  computeLayout(31, 360, 560, 7),
  computeLayout(7, 360, 560, 7),
  computeLayout(24, 360, 560, 6),
  computeLayout(1, 50, 50),
];

describe('row ranges', () => {
  it('agrees with indexAt on every row', () => {
    for (const l of LAYOUTS) {
      for (let row = 0; row < l.rows; row++) {
        const range = rowIndexRange(l, row)!;
        expect(indexAt(l, 0, row)).toBe(range.lo);
        expect(indexAt(l, range.hi - range.lo, row)).toBe(range.hi);
        // One past the end of the row is either the next row or empty.
        expect(indexAt(l, range.hi - range.lo + 1, row)).not.toBe(range.hi);
      }
    }
  });

  it('is null outside the grid', () => {
    const l = LAYOUTS[0];
    expect(rowIndexRange(l, -1)).toBeNull();
    expect(rowIndexRange(l, l.rows)).toBeNull();
  });

  it('covers every index exactly once', () => {
    for (const l of LAYOUTS) {
      const seen = new Set<number>();
      for (let row = 0; row < l.rows; row++) {
        const { lo, hi } = rowIndexRange(l, row)!;
        for (let i = lo; i <= hi; i++) {
          expect(seen.has(i)).toBe(false);
          seen.add(i);
        }
      }
      expect(seen.size).toBe(l.count);
    }
  });
});

describe('row runs', () => {
  it('covers exactly the requested range, in chronological order', () => {
    for (const l of LAYOUTS) {
      for (const [lo, hi] of [
        [0, l.count - 1],
        [0, 0],
        [l.count - 1, l.count - 1],
        [Math.floor(l.count / 3), Math.floor((2 * l.count) / 3)],
        [Math.max(0, l.partial - 2), Math.min(l.count - 1, l.partial + 2)],
      ]) {
        const runs = rowRuns(l, lo, hi);
        const covered: number[] = [];
        for (const run of runs) {
          const base = rowIndexRange(l, run.row)!.lo;
          for (let k = 0; k < run.len; k++) covered.push(base + run.col + k);
        }
        // Union is the range, with nothing repeated and nothing missing.
        expect(covered).toEqual(Array.from({ length: hi - lo + 1 }, (_, k) => lo + k));
        // One run per row at most, and rows come out bottom-up.
        expect(new Set(runs.map((r) => r.row)).size).toBe(runs.length);
        expect(runs.map((r) => r.row)).toEqual([...runs.map((r) => r.row)].sort((a, b) => b - a));
      }
    }
  });

  it('splits at the partial bottom row', () => {
    const l = computeLayout(365, 360, 560);
    expect(l.partial).toBeGreaterThan(0);
    expect(rowRuns(l, 0, l.partial - 1)).toHaveLength(1);
    expect(rowRuns(l, 0, l.partial)).toHaveLength(2);
  });

  it('is empty for an inverted range', () => {
    expect(rowRuns(LAYOUTS[0], 5, 4)).toEqual([]);
  });
});

describe('dot radius', () => {
  it('never lets neighbouring dots touch', () => {
    for (const l of LAYOUTS) expect(2 * dotRadius(l.pitch)).toBeLessThanOrEqual(l.pitch);
  });
});
