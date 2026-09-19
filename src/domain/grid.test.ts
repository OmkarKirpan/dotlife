import { describe, expect, it } from 'vitest';
import { cellOf, computeLayout, indexAt, MAX_PITCH, nearestIndex } from './grid';

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
