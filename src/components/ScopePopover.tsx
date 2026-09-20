import { useEffect, useRef } from 'react';
import { parseLocalDate } from '../domain/time';
import type { FixedSpan, Span } from '../domain/span';
import { spanLength } from '../domain/format';
import { SpanRow } from './SpanRow';

interface Props {
  spans: Span[];
  activeId: string;
  now: Date;
  onSelect: (id: string) => void;
  onEdit: (span: FixedSpan) => void;
  onNewSpan: () => void;
  onWallpaper: () => void;
  onSettings: () => void;
  onClose: () => void;
}

export function ScopePopover({ spans, activeId, now, onSelect, onEdit, onNewSpan, onWallpaper, onSettings, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    // Defer so the opening tap doesn't immediately close it.
    const t = setTimeout(() => document.addEventListener('pointerdown', onDown), 0);
    window.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(t);
      document.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const derived = spans.filter((s) => s.kind === 'derived');
  const fixed = spans
    .filter((s): s is FixedSpan => s.kind === 'fixed')
    .sort((a, b) => a.start.localeCompare(b.start));

  const status = (s: FixedSpan) => {
    if (parseLocalDate(s.start) > now) return 'upcoming';
    const end = parseLocalDate(s.end);
    end.setDate(end.getDate() + 1);
    return end <= now ? 'done' : 'now';
  };

  return (
    <div className="popover" ref={ref} role="menu">
      <div className="pop-section">
        {derived.map((s) => (
          <SpanRow key={s.id} title={s.label} active={s.id === activeId} onTap={() => onSelect(s.id)} />
        ))}
      </div>
      {fixed.length > 0 && (
        <div className="pop-section">
          <div className="pop-label">Your spans · hold to edit</div>
          {fixed.map((s) => (
            <SpanRow
              key={s.id}
              title={s.label}
              meta={
                <>
                  {spanLength(s)}
                  <span className={`pill pill-${status(s)}`}>{status(s)}</span>
                </>
              }
              active={s.id === activeId}
              onTap={() => onSelect(s.id)}
              onLongPress={() => onEdit(s)}
            />
          ))}
        </div>
      )}
      <div className="pop-section">
        <button className="row subtle" onClick={onNewSpan}>
          <span className="row-title">New span…</span>
        </button>
        <button className="row subtle" onClick={onWallpaper}>
          <span className="row-title">Wallpaper…</span>
        </button>
        <button className="row subtle" onClick={onSettings}>
          <span className="row-title">Settings, export &amp; import</span>
        </button>
      </div>
    </div>
  );
}
