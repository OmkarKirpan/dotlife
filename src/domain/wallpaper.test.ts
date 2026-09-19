import { describe, expect, it } from 'vitest';
import { headline } from './format';
import { PREFERRED_COLS } from './grid';
import { spanOverlays } from './overlay';
import type { FixedSpan, Span } from './span';
import { resolve } from './time';
import {
  buildWallpaperScene,
  DEFAULT_LOGICAL,
  MAX_CANVAS_AREA,
  pickWallpaperSize,
  sceneToSvg,
  wallpaperFilename,
  type Palette,
  type WallpaperScene,
} from './wallpaper';

const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h);
const derived = (unit: Extract<Span, { kind: 'derived' }>['unit']): Span => ({ id: unit, kind: 'derived', unit, label: unit });
const fixed = (id: string, start: string, end: string, label = id): FixedSpan => ({ id, kind: 'fixed', start, end, label });

const palette: Palette = { bg: '#0c0c0e', accent: '#ff8a3d', muted: '#2b2b30', text: '#f3f1ec', dim: '#66656b' };
const size = { width: 393, height: 852, scale: 3 };

const scene = (unit: Parameters<typeof derived>[0], lens: 'left' | 'since' = 'left', overlays: Span[] = []): WallpaperScene => {
  const r = resolve(derived(unit), at(2026, 6, 15), { lifeStart: '1990-06-15', lifeYears: 80 })!;
  return buildWallpaperScene({
    r,
    title: unit,
    headline: headline(r, lens, false),
    lens,
    preferredCols: PREFERRED_COLS[unit],
    overlays: spanOverlays(r, overlays),
    size,
    palette,
  });
};

const circles = (s: WallpaperScene) => s.shapes.filter((x) => x.kind === 'circle');
const rects = (s: WallpaperScene) => s.shapes.filter((x) => x.kind === 'rect');
const texts = (s: WallpaperScene) => s.shapes.filter((x) => x.kind === 'text');

const UNITS = ['now', 'today', 'week', 'month', 'year', 'life'] as const;

describe('wallpaper scene', () => {
  it('draws one dot per unit of the scope', () => {
    for (const u of UNITS) {
      const r = resolve(derived(u), at(2026, 6, 15), { lifeStart: '1990-06-15', lifeYears: 80 })!;
      expect(circles(scene(u))).toHaveLength(r.total);
    }
  });

  it('keeps every shape on the canvas', () => {
    for (const u of UNITS) {
      const s = scene(u);
      for (const c of circles(s)) {
        expect(c.cx - c.r).toBeGreaterThanOrEqual(0);
        expect(c.cx + c.r).toBeLessThanOrEqual(s.width);
        expect(c.cy - c.r).toBeGreaterThanOrEqual(0);
        expect(c.cy + c.r).toBeLessThanOrEqual(s.height);
        expect(Number.isFinite(c.cx) && Number.isFinite(c.cy) && Number.isFinite(c.r)).toBe(true);
      }
    }
  });

  it('centres the grid, which computeLayout leaves smaller than its box', () => {
    for (const u of UNITS) {
      const s = scene(u);
      const xs = circles(s).map((c) => c.cx);
      const left = Math.min(...xs) - s.layout.pitch / 2;
      const right = s.width - (Math.max(...xs) + s.layout.pitch / 2);
      expect(Math.abs(left - right)).toBeLessThan(0.01);
    }
  });

  it('keeps the grid clear of the clock and the text', () => {
    for (const u of UNITS) {
      const s = scene(u);
      const top = Math.min(...circles(s).map((c) => c.cy - c.r));
      const bottom = Math.max(...circles(s).map((c) => c.cy + c.r));
      const titleBaseline = Math.min(...texts(s).map((t) => t.y));
      expect(top).toBeGreaterThanOrEqual(s.height * 0.28);
      expect(bottom).toBeLessThanOrEqual(titleBaseline);
    }
  });

  it('never lets dots touch', () => {
    for (const u of UNITS) {
      const s = scene(u);
      expect(2 * circles(s)[0].r).toBeLessThanOrEqual(s.layout.pitch);
    }
  });

  it('keeps Life legible at 3x', () => {
    const s = scene('life');
    expect(circles(s)[0].r * s.scale).toBeGreaterThanOrEqual(6);
  });

  it('fills a fair share of the frame even for a small scope', () => {
    // This week is 7 dots; the guard is that it spans the width rather than
    // sitting in a tiny cluster the way a device-pixel layout would leave it.
    const s = scene('week');
    const xs = circles(s).map((c) => c.cx);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(s.width * 0.6);
  });

  it('colours dots by lens, with the current dot always standing out', () => {
    const r = resolve(derived('year'), at(2026, 6, 15))!;
    const left = circles(scene('year', 'left'));
    const since = circles(scene('year', 'since'));
    expect(left.filter((c) => c.fill === palette.accent)).toHaveLength(r.remaining - 1);
    expect(since.filter((c) => c.fill === palette.accent)).toHaveLength(r.elapsed);
    expect(left.filter((c) => c.fill === palette.text)).toHaveLength(1);
    expect(left[r.elapsed].fill).toBe(palette.text);
  });

  it('carries the scope label and the headline', () => {
    const r = resolve(derived('year'), at(2026, 6, 15))!;
    const t = texts(scene('year')).map((x) => x.text);
    expect(t).toContain('year');
    expect(t).toContain(headline(r, 'left', false));
  });

  it('draws overlay capsules only for spans that intersect', () => {
    expect(rects(scene('year', 'left', [fixed('trip', '2026-03-01', '2026-03-10')])).length).toBeGreaterThan(0);
    expect(rects(scene('year', 'left', [fixed('old', '2024-03-01', '2024-03-10')]))).toHaveLength(0);
    expect(rects(scene('year'))).toHaveLength(0);
  });
});

describe('pickWallpaperSize', () => {
  it('passes a phone through', () => {
    expect(pickWallpaperSize({ width: 393, height: 852, dpr: 3 })).toEqual({ width: 393, height: 852, scale: 3 });
  });

  it('falls back to a portrait default on a desktop', () => {
    expect(pickWallpaperSize({ width: 1920, height: 1080, dpr: 1 })).toEqual({ ...DEFAULT_LOGICAL, scale: 3 });
  });

  it('never returns a 1x export', () => {
    expect(pickWallpaperSize({ width: 390, height: 844, dpr: 1 }).scale).toBeGreaterThanOrEqual(2);
  });

  it('stays under the canvas area ceiling', () => {
    for (const d of [{ width: 393, height: 852, dpr: 3 }, { width: 430, height: 932, dpr: 3 }, { width: 1024, height: 1366, dpr: 2 }]) {
      const s = pickWallpaperSize(d);
      expect(s.width * s.scale * s.height * s.scale).toBeLessThanOrEqual(MAX_CANVAS_AREA);
    }
  });

  it('returns whole pixels', () => {
    const s = pickWallpaperSize({ width: 412.7, height: 915.3, dpr: 2.625 });
    expect(Number.isInteger(s.width) && Number.isInteger(s.height) && Number.isInteger(s.scale)).toBe(true);
  });
});

describe('sceneToSvg', () => {
  it('carries literal dimensions, which WebKit needs to rasterise it', () => {
    const svg = sceneToSvg(scene('year'));
    expect(svg).toContain(`width="${393 * 3}"`);
    expect(svg).toContain(`height="${852 * 3}"`);
    expect(svg).toContain('viewBox="0 0 393 852"');
  });

  it('emits one circle per dot', () => {
    const s = scene('year');
    expect(sceneToSvg(s).match(/<circle/g)).toHaveLength(circles(s).length);
  });

  it('escapes span labels, which are user text', () => {
    const r = resolve(derived('year'), at(2026, 6, 15))!;
    const svg = sceneToSvg(
      buildWallpaperScene({ r, title: 'Me & <you>', headline: '1 day left', lens: 'left', size, palette }),
    );
    expect(svg).toContain('Me &amp; &lt;you&gt;');
    expect(svg).not.toContain('<you>');
  });

  it('is deterministic', () => {
    expect(sceneToSvg(scene('month'))).toBe(sceneToSvg(scene('month')));
  });
});

describe('wallpaperFilename', () => {
  it('slugifies the scope name', () => {
    expect(wallpaperFilename('This year', at(2026, 6, 15))).toBe('dotlife-this-year-2026-06-15.png');
  });

  it('survives punctuation and emoji', () => {
    expect(wallpaperFilename('Trip: Rome/Paris 🎉', at(2026, 6, 15))).toBe('dotlife-trip-rome-paris-2026-06-15.png');
  });

  it('falls back when nothing survives', () => {
    expect(wallpaperFilename('🎉', at(2026, 6, 15))).toBe('dotlife-grid-2026-06-15.png');
  });
});
