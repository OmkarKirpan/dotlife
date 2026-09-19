import { memo, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { cellOf, computeLayout, nearestIndex, type Layout } from '../domain/grid';
import type { Resolved } from '../domain/time';
import { useSize } from '../hooks';

export interface Selection {
  lo: number;
  hi: number;
  /** false = a plain press that only inspects one dot. */
  creating: boolean;
}

interface Props {
  r: Resolved;
  preferredCols?: number;
  lens: 'left' | 'since';
  /** Day/week dots only: a drag maps to a date range. */
  draggable: boolean;
  /** Called while pressing: the dot under the finger, or the dragged range. */
  onPreview: (sel: Selection | null) => void;
  onCreate: (sel: Selection) => void;
}

const HOLD_MS = 450;

const DotLayer = memo(function DotLayer({ layout, r }: { layout: Layout; r: Resolved }) {
  const rad = layout.pitch * (layout.pitch < 12 ? 0.4 : 0.36);
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

export function Grid({ r, preferredCols, lens, draggable, onPreview, onCreate }: Props) {
  const [boxRef, size] = useSize<HTMLDivElement>();
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<Drag | null>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [sel, setSel] = useState<Selection | null>(null);

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
      ? { lo: Math.min(d.anchor, d.current), hi: Math.max(d.anchor, d.current), creating }
      : { lo: d.current, hi: d.current, creating };
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
      onCreate({ lo: Math.min(d.anchor, d.current), hi: Math.max(d.anchor, d.current), creating: true });
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

  return (
    <div className="grid-box" ref={boxRef}>
      {layout && (
        <svg
          ref={svgRef}
          className={`grid lens-${lens}${sel ? ' pressing' : ''}`}
          width={layout.width}
          height={layout.height}
          viewBox={`0 0 ${layout.width} ${layout.height}`}
          role="img"
          aria-label={`${r.total} dots, ${r.elapsed} elapsed, ${r.remaining} remaining`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={(e) => drag.current?.pointerId === e.pointerId && end(true)}
          onPointerCancel={() => end(false)}
          onLostPointerCapture={() => drag.current && end(false)}
        >
          <DotLayer layout={layout} r={r} />
          {sel && <SelectionLayer layout={layout} sel={sel} />}
        </svg>
      )}
    </div>
  );
}
