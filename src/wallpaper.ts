import { sceneToSvg, type Palette, type WallpaperScene } from './domain/wallpaper';

/**
 * Browser side of the wallpaper: paint a scene onto a canvas and get it out of
 * the app. Sibling of store.ts and badge.ts — all the decisions live in
 * domain/wallpaper.ts, so there is nothing here worth a unit test.
 *
 * Canvas 2D rather than serialising the SVG into an <img>: that path cannot see
 * the stylesheet, resolves system fonts differently from the document, breaks
 * on non-Latin-1 labels once base64 is involved, and fails silently in WebKit.
 */

const FONT_STACK = `-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Inter', 'Segoe UI', Roboto, sans-serif`;

const FALLBACK: Palette = {
  bg: '#0c0c0e',
  accent: '#ff8a3d',
  muted: '#2b2b30',
  text: '#f3f1ec',
  dim: '#66656b',
};

/** Read the live palette so styles.css stays the one source of truth. */
export function readPalette(): Palette {
  try {
    const s = getComputedStyle(document.documentElement);
    const v = (name: string, fallback: string) => s.getPropertyValue(name).trim() || fallback;
    return {
      bg: v('--bg', FALLBACK.bg),
      accent: v('--accent', FALLBACK.accent),
      muted: v('--dot-muted', FALLBACK.muted),
      text: v('--text', FALLBACK.text),
      dim: v('--text-3', FALLBACK.dim),
    };
  } catch {
    return FALLBACK;
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  if (typeof ctx.roundRect === 'function') {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    return;
  }
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

/** Synchronous by design: an await before navigator.share() can cost the tap. */
export function renderScene(scene: WallpaperScene): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(scene.width * scene.scale);
  canvas.height = Math.round(scene.height * scene.scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is unavailable');
  ctx.scale(scene.scale, scene.scale);

  // PNG keeps alpha, and a transparent wallpaper is a cosmetic hazard.
  ctx.fillStyle = scene.background;
  ctx.fillRect(0, 0, scene.width, scene.height);

  ctx.textBaseline = 'alphabetic';
  for (const s of scene.shapes) {
    ctx.globalAlpha = s.kind === 'rect' && s.alpha !== undefined ? s.alpha : 1;
    ctx.fillStyle = s.fill;
    if (s.kind === 'rect') {
      roundRect(ctx, s.x, s.y, s.w, s.h, s.rx);
      ctx.fill();
    } else if (s.kind === 'circle') {
      ctx.beginPath();
      ctx.arc(s.cx, s.cy, s.r, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.font = `${s.weight} ${s.size}px ${FONT_STACK}`;
      ctx.fillText(s.text, s.x, s.y);
    }
  }
  ctx.globalAlpha = 1;
  return canvas;
}

export function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode the image'))), 'image/png');
  });
}

export const svgBlob = (scene: WallpaperScene) => new Blob([sceneToSvg(scene)], { type: 'image/svg+xml' });

/**
 * Not `!!navigator.share` — desktop browsers advertise share without file
 * support, and the failure lands after the sheet has already flickered.
 */
export function canSharePng(): boolean {
  try {
    const probe = new File([new Blob([''])], 'probe.png', { type: 'image/png' });
    return navigator.canShare?.({ files: [probe] }) ?? false;
  } catch {
    return false;
  }
}

export async function sharePng(blob: Blob, filename: string): Promise<void> {
  await navigator.share({ files: [new File([blob], filename, { type: 'image/png' })] });
}

/** Mirrors the export download in SettingsSheet. */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
