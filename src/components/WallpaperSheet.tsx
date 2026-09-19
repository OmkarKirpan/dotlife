import { useEffect, useState } from 'react';
import { PREFERRED_COLS } from '../domain/grid';
import type { Overlay } from '../domain/overlay';
import type { Span } from '../domain/span';
import type { Resolved } from '../domain/time';
import {
  buildWallpaperScene,
  pickWallpaperSize,
  wallpaperFilename,
  type WallpaperScene,
} from '../domain/wallpaper';
import type { Lens } from '../domain/format';
import { canSharePng, canvasToPngBlob, readPalette, renderScene, saveBlob, sharePng, svgBlob } from '../wallpaper';
import { Sheet } from './Sheet';

interface Props {
  span: Span;
  r: Resolved;
  headline: string;
  lens: Exclude<Lens, 'ahead'>;
  overlays: Overlay[];
  onClose: () => void;
  onToast: (msg: string) => void;
}

interface Ready {
  scene: WallpaperScene;
  blob: Blob;
  url: string;
}

export function WallpaperSheet({ span, r, headline, lens, overlays, onClose, onToast }: Props) {
  const [ready, setReady] = useState<Ready | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Render as soon as the sheet opens, not on the Share tap: WebKit can drop
  // the transient activation across an await, and toBlob is async.
  useEffect(() => {
    let url: string | undefined;
    let live = true;
    (async () => {
      try {
        const scene = buildWallpaperScene({
          r,
          title: span.label,
          headline,
          lens,
          preferredCols: span.kind === 'derived' ? PREFERRED_COLS[span.unit] : undefined,
          overlays,
          size: pickWallpaperSize({ width: screen.width, height: screen.height, dpr: devicePixelRatio }),
          palette: readPalette(),
        });
        const blob = await canvasToPngBlob(renderScene(scene));
        url = URL.createObjectURL(blob);
        if (live) setReady({ scene, blob, url });
      } catch (e) {
        if (live) setError(e instanceof Error ? e.message : 'Could not draw the wallpaper.');
      }
    })();
    return () => {
      live = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [r, span, headline, lens, overlays]);

  const filename = (ext: string) => wallpaperFilename(span.label, new Date(), ext);

  const share = async () => {
    if (!ready) return;
    try {
      await sharePng(ready.blob, filename('png'));
    } catch (e) {
      // An abort is the user closing the share sheet, not a failure.
      if (e instanceof Error && e.name === 'AbortError') return;
      onToast('Sharing failed — use Download');
    }
  };

  return (
    <Sheet title="Wallpaper" onClose={onClose}>
      <section className="form">
        {error ? (
          <p className="error">{error}</p>
        ) : (
          <div className="wall-preview">
            {ready ? <img src={ready.url} alt="The current grid as a wallpaper" /> : <div className="wall-skeleton" />}
          </div>
        )}
        <p className="muted">
          {ready
            ? `${ready.scene.width * ready.scene.scale} × ${ready.scene.height * ready.scene.scale}. On iPhone, press and hold the image to save it to Photos, then set it from there.`
            : 'Drawing…'}
        </p>
        <div className="actions">
          {canSharePng() && (
            <button className="btn primary" disabled={!ready} onClick={share}>
              Share
            </button>
          )}
          <button className="btn" disabled={!ready} onClick={() => ready && saveBlob(ready.blob, filename('png'))}>
            Download PNG
          </button>
          <button className="btn" disabled={!ready} onClick={() => ready && saveBlob(svgBlob(ready.scene), filename('svg'))}>
            SVG
          </button>
        </div>
      </section>
    </Sheet>
  );
}
