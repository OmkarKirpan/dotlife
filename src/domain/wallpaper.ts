import { cellOf, computeLayout, dotRadius, rowRuns, type Layout } from './grid';
import type { Overlay } from './overlay';
import { toDateString, type Resolved } from './time';

/**
 * The grid as a phone wallpaper. The badge is the only thing this app puts in
 * front of you when it is closed, and it goes stale; a wallpaper does not.
 *
 * Everything here is pure: it builds a display list, which the browser adapter
 * in src/wallpaper.ts draws onto a canvas. Geometry stays testable in node.
 */

export interface Palette {
  bg: string;
  accent: string;
  muted: string;
  text: string;
  dim: string;
}

export interface WallpaperSize {
  /** Layout and drawing coordinates, CSS px. */
  width: number;
  height: number;
  /** Integer device-pixel multiplier; the PNG is width*scale x height*scale. */
  scale: number;
}

export type Shape =
  | { kind: 'rect'; x: number; y: number; w: number; h: number; rx: number; fill: string; alpha?: number }
  | { kind: 'circle'; cx: number; cy: number; r: number; fill: string }
  | { kind: 'text'; x: number; y: number; text: string; size: number; weight: number; fill: string };

export interface WallpaperScene {
  width: number;
  height: number;
  scale: number;
  background: string;
  shapes: Shape[];
  /** Echoed so tests and the renderer can reason about the grid that was laid out. */
  layout: Layout;
}

export interface WallpaperInput {
  r: Resolved;
  /** The scope's name, as the header shows it. */
  title: string;
  /** Already formatted by format.ts — this module never re-derives it. */
  headline: string;
  lens: 'left' | 'since';
  preferredCols?: number;
  overlays?: readonly Overlay[];
  size: WallpaperSize;
  palette: Palette;
  /** Fraction of the height kept clear at the top, for the lock-screen clock. */
  safeTop?: number;
}

/** A phone-shaped default, for exports from a desktop browser. */
export const DEFAULT_LOGICAL = { width: 393, height: 852 } as const;
/** iOS Safari stops producing bitmaps somewhere above this canvas area. */
export const MAX_CANVAS_AREA = 16_777_216;

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/**
 * Logical size and pixel scale for the export. A wallpaper should be phone
 * shaped even when exported from a laptop, so a non-phone viewport falls back
 * to a portrait default rather than producing a letterboxed desktop image.
 */
export function pickWallpaperSize(screen: { width: number; height: number; dpr: number }): WallpaperSize {
  const phoneLike = screen.width > 0 && screen.height / screen.width >= 1.6 && screen.width <= 600;
  const width = Math.round(phoneLike ? screen.width : DEFAULT_LOGICAL.width);
  const height = Math.round(phoneLike ? screen.height : DEFAULT_LOGICAL.height);
  // A non-phone export is a synthesised phone wallpaper, so its own dpr says
  // nothing useful — always render it at 3x. Honouring dpr exactly would also
  // make a 1x export a useless 393x852 PNG, hence the floor of 2.
  let scale = phoneLike ? clamp(Math.round(screen.dpr) || 3, 2, 3) : 3;
  while (scale > 1 && width * scale * height * scale > MAX_CANVAS_AREA) scale--;
  return { width, height, scale };
}

/**
 * The grid is laid out at logical size and the whole scene is scaled up, rather
 * than laid out at device pixels: MAX_PITCH is a CSS-pixel constant, so laying
 * out at 3x would strand small scopes in a sea of background while Life filled
 * the frame. This way the wallpaper is what the app shows, pixel-doubled.
 */
export function buildWallpaperScene(input: WallpaperInput): WallpaperScene {
  const { r, size, palette, lens, overlays = [] } = input;
  const { width: W, height: H } = size;
  const safeTop = input.safeTop ?? 0.28;

  const margin = Math.round(W * 0.085);
  const titleSize = clamp(W * 0.04, 13, 20);
  const headlineSize = clamp(W * 0.095, 30, 46);

  // Text sits along the bottom, clear of the clock; the grid takes what's left.
  const textBottom = H - H * 0.11;
  const headlineBaseline = textBottom;
  const titleBaseline = headlineBaseline - headlineSize * 1.18;
  const box = {
    x: margin,
    y: H * safeTop,
    w: W - 2 * margin,
    h: titleBaseline - titleSize * 1.6 - H * safeTop,
  };

  const layout = computeLayout(r.total, box.w, box.h, input.preferredCols);
  // computeLayout caps the pitch, so the grid is often smaller than the box it
  // was given. On screen flexbox centres it; a canvas has no such thing.
  const ox = box.x + (box.w - layout.width) / 2;
  const oy = box.y + (box.h - layout.height) / 2;

  const shapes: Shape[] = [];

  // Overlays first: they belong behind the dots.
  const pitch = layout.pitch;
  const inset = pitch * 0.08;
  for (const o of overlays) {
    const pad = inset + o.lane * pitch * 0.11;
    const h = pitch - 2 * pad;
    if (h <= 0) continue;
    for (const run of rowRuns(layout, o.lo, o.hi)) {
      shapes.push({
        kind: 'rect',
        x: ox + run.col * pitch + inset,
        y: oy + run.row * pitch + pad,
        w: run.len * pitch - 2 * inset,
        h,
        rx: h / 2,
        fill: o.color,
        alpha: 0.22,
      });
    }
  }

  // Dots, mirroring the lens rules in styles.css.
  const rad = dotRadius(pitch);
  const past = lens === 'left' ? palette.muted : palette.accent;
  const future = lens === 'left' ? palette.accent : palette.muted;
  for (let i = 0; i < r.total; i++) {
    const { col, row } = cellOf(layout, i);
    shapes.push({
      kind: 'circle',
      cx: ox + (col + 0.5) * pitch,
      cy: oy + (row + 0.5) * pitch,
      r: rad,
      fill: i < r.elapsed ? past : i === r.elapsed ? palette.text : future,
    });
  }

  shapes.push({ kind: 'text', x: margin, y: titleBaseline, text: input.title, size: titleSize, weight: 600, fill: palette.dim });
  shapes.push({ kind: 'text', x: margin, y: headlineBaseline, text: input.headline, size: headlineSize, weight: 700, fill: palette.text });

  return { width: W, height: H, scale: size.scale, background: palette.bg, shapes, layout };
}

const escapeXml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!);

const num = (n: number) => String(Math.round(n * 100) / 100);

/**
 * The same scene as SVG. Deterministic, so tests can assert on it, and it is
 * the escape hatch when canvas.toBlob returns null.
 */
export function sceneToSvg(scene: WallpaperScene): string {
  const w = scene.width * scene.scale;
  const h = scene.height * scene.scale;
  const body = scene.shapes
    .map((s) => {
      if (s.kind === 'rect') {
        const a = s.alpha === undefined ? '' : ` fill-opacity="${num(s.alpha)}"`;
        return `<rect x="${num(s.x)}" y="${num(s.y)}" width="${num(s.w)}" height="${num(s.h)}" rx="${num(s.rx)}" fill="${s.fill}"${a}/>`;
      }
      if (s.kind === 'circle') {
        return `<circle cx="${num(s.cx)}" cy="${num(s.cy)}" r="${num(s.r)}" fill="${s.fill}"/>`;
      }
      return `<text x="${num(s.x)}" y="${num(s.y)}" font-size="${num(s.size)}" font-weight="${s.weight}" fill="${s.fill}" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif">${escapeXml(s.text)}</text>`;
    })
    .join('');
  // Literal width/height, not just a viewBox: WebKit rasterises an SVG without
  // them at 300x150 when it is loaded as an image.
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${num(scene.width)} ${num(scene.height)}">` +
    `<rect width="100%" height="100%" fill="${scene.background}"/>${body}</svg>`
  );
}

export function wallpaperFilename(title: string, now: Date, ext = 'png'): string {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  return `dotlife-${slug || 'grid'}-${toDateString(now)}.${ext}`;
}
