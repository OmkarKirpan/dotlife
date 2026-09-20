import { memo, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { cellOf, computeLayout, dotRadius, nearestIndex, rowRuns, type Layout } from '../domain/grid';
import type { Overlay } from '../domain/overlay';
import type { Resolved } from '../domain/time';
import { useSize } from '../hooks';

export interface Selection {
  lo: number;
  hi: number;
  /** false = a plain press that only inspects one dot. */
  creating: boolean;
  /** Which input is driving this, so the hint can name the right gesture. */
  via: 'pointer' | 'key';
}

interface Props {
  r: Resolved;
  preferredCols?: number;
  lens: 'left' | 'since';
  /** Day/week dots only: a drag maps to a date range. */
  draggable: boolean;
  /** Your fixed spans, drawn behind the dots. */
  overlays?: Overlay[];
  /** Called while pressing: the dot under the finger, or the dragged range. */
  onPreview: (sel: Selection | null) => void;
  onCreate: (sel: Selection) => void;
}

const HOLD_MS = 450;

const OverlayLayer = memo(function OverlayLayer({ layout, overlays }: { layout: Layout; overlays: Overlay[] }) {
  const pitch = layout.pitch;
  const inset = pitch * 0.08;
  const caps = [];
  for (const o of overlays) {
    // Deeper lanes sit inside shallower ones, so overlapping spans stay countable.
    const pad = inset + o.lane * pitch * 0.11;
    const h = pitch - 2 * pad;
    if (h <= 0) continue;
    for (const run of rowRuns(layout, o.lo, o.hi)) {
      caps.push(
        <rect
          key={`${o.id}-${run.row}`}
          x={run.col * pitch + inset}
          y={run.row * pitch + pad}
          width={run.len * pitch - 2 * inset}
          height={h}
          rx={h / 2}
          fill={o.color}
        />,
      );
    }
  }
  return <g className="ov">{caps}</g>;
});

const DotLayer = memo(function DotLayer({ layout, r }: { layout: Layout; r: Resolved }) {
  const rad = dotRadius(layout.pitch);
  const dots = [];
  for (let i = 0; i < r.total; i++) {
    const { col, row } = cellOf(layout, i);
    const cls = i < r.elapsed ? 'dot e' : i === r.elapsed ? 'dot c' : 'dot r';
    dots.push(
      <circle key={i} className={cls} cx={(col + 0.5) * layout.pitch} cy={(row + 0.5) * layout.pitch} r={rad} />,
    );
  }
  return <g>{dots}</g>;
});

function SelectionLayer({ layout, sel }: { layout: Layout; sel: Selection }) {
  const rad = layout.pitch * (layout.pitch < 12 ? 0.46 : 0.4);
  const dots = [];
  for (let i = sel.lo; i <= sel.hi; i++) {
    const { col, row } = cellOf(layout, i);
    dots.push(<circle key={i} cx={(col + 0.5) * layout.pitch} cy={(row + 0.5) * layout.pitch} r={rad} />);
  }
  return <g className="sel">{dots}</g>;
}

interface Drag {
  pointerId: number;
  anchor: number;
  current: number;
  moved: boolean;
  held: boolean;
}

export function Grid({ r, preferredCols, lens, draggable, overlays, onPreview, onCreate }: Props) {
  const [boxRef, size] = useSize<HTMLDivElement>();
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<Drag | null>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [sel, setSel] = useState<Selection | null>(null);
  /** Keyboard equivalent of a drag: anchor stays put, cursor moves. */
  const [kb, setKb] = useState<{ anchor: number; cursor: number } | null>(null);

  const layout = useMemo(
    () => (size.width > 0 ? computeLayout(r.total, size.width, size.height, preferredCols) : null),
    [r.total, size.width, size.height, preferredCols],
  );

  const indexFromEvent = (e: RPointerEvent): number => {
    const rect = svgRef.current!.getBoundingClientRect();
    const scale = layout!.width / rect.width;
    return nearestIndex(layout!, (e.clientX - rect.left) * scale, (e.clientY - rect.top) * scale);
  };

  const show = (d: Drag) => {
    const creating = draggable && (d.moved || d.held);
    const s: Selection = creating
      ? { lo: Math.min(d.anchor, d.current), hi: Math.max(d.anchor, d.current), creating, via: 'pointer' }
      : { lo: d.current, hi: d.current, creating, via: 'pointer' };
    setSel(s);
    onPreview(s);
  };

  const end = (commit: boolean) => {
    clearTimeout(holdTimer.current);
    const d = drag.current;
    drag.current = null;
    setSel(null);
    onPreview(null);
    if (commit && d && draggable && (d.moved || d.held)) {
      onCreate({ lo: Math.min(d.anchor, d.current), hi: Math.max(d.anchor, d.current), creating: true, via: 'pointer' });
    }
  };

  const onPointerDown = (e: RPointerEvent<SVGSVGElement>) => {
    if (!layout || drag.current || e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const i = indexFromEvent(e);
    const d: Drag = { pointerId: e.pointerId, anchor: i, current: i, moved: false, held: false };
    drag.current = d;
    show(d);
    if (draggable) {
      // Press and hold on one dot = a single-day span. A plain tap only inspects.
      holdTimer.current = setTimeout(() => {
        if (drag.current === d && !d.moved) {
          d.held = true;
          navigator.vibrate?.(10);
          show(d);
        }
      }, HOLD_MS);
    }
  };

  const onPointerMove = (e: RPointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.pointerId) return;
    const i = indexFromEvent(e);
    if (i === d.current) return;
    d.current = i;
    if (i !== d.anchor) {
      d.moved = true;
      clearTimeout(holdTimer.current);
    }
    show(d);
  };

  const showKb = (next: { anchor: number; cursor: number } | null) => {
    setKb(next);
    if (!next) return onPreview(null);
    const lo = Math.min(next.anchor, next.cursor);
    const hi = Math.max(next.anchor, next.cursor);
    onPreview({ lo, hi, creating: draggable && lo !== hi, via: 'key' });
  };

  const onKeyDown = (e: React.KeyboardEvent<SVGSVGElement>) => {
    if (!layout) return;
    const cur = kb ?? { anchor: Math.min(r.elapsed, r.total - 1), cursor: Math.min(r.elapsed, r.total - 1) };
    // Time runs bottom-up, so visually up is later: a whole row forward.
    const delta = { ArrowLeft: -1, ArrowRight: 1, ArrowDown: -layout.cols, ArrowUp: layout.cols }[e.key];

    if (delta !== undefined) {
      e.preventDefault();
      const cursor = Math.min(r.total - 1, Math.max(0, cur.cursor + delta));
      // Shift keeps the anchor, which is how a range gets selected.
      showKb({ anchor: e.shiftKey ? cur.anchor : cursor, cursor });
      return;
    }
    if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      const cursor = e.key === 'Home' ? 0 : r.total - 1;
      showKb({ anchor: e.shiftKey ? cur.anchor : cursor, cursor });
      return;
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (!draggable) return;
      onCreate({ lo: Math.min(cur.anchor, cur.cursor), hi: Math.max(cur.anchor, cur.cursor), creating: true, via: 'key' });
      showKb({ anchor: cur.cursor, cursor: cur.cursor });
      return;
    }
    if (e.key === 'Escape' && kb) {
      e.preventDefault();
      showKb({ anchor: cur.cursor, cursor: cur.cursor });
    }
  };

  // A pointer press wins while it is happening; otherwise the keyboard shows.
  const shown =
    sel ??
    (kb
      ? {
          lo: Math.min(kb.anchor, kb.cursor),
          hi: Math.max(kb.anchor, kb.cursor),
          creating: draggable && kb.anchor !== kb.cursor,
          via: 'key' as const,
        }
      : null);

  return (
    <div className="grid-box" ref={boxRef}>
      {layout && (
        <svg
          ref={svgRef}
          className={`grid lens-${lens}${shown ? ' pressing' : ''}`}
          width={layout.width}
          height={layout.height}
          viewBox={`0 0 ${layout.width} ${layout.height}`}
          role="img"
          tabIndex={0}
          aria-label={
            `${r.total} dots, ${r.elapsed} elapsed, ${r.remaining} remaining.` +
            (draggable
              ? ' Arrow keys move through the dots, shift and arrow selects a range, Enter creates a span.'
              : ' Arrow keys move through the dots.')
          }
          onKeyDown={onKeyDown}
          onFocus={() => !kb && showKb({ anchor: Math.min(r.elapsed, r.total - 1), cursor: Math.min(r.elapsed, r.total - 1) })}
          onBlur={() => showKb(null)}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={(e) => drag.current?.pointerId === e.pointerId && end(true)}
          onPointerCancel={() => end(false)}
          onLostPointerCapture={() => drag.current && end(false)}
        >
          {overlays && overlays.length > 0 && <OverlayLayer layout={layout} overlays={overlays} />}
          <DotLayer layout={layout} r={r} />
          {shown && <SelectionLayer layout={layout} sel={shown} />}
        </svg>
      )}
    </div>
  );
}
