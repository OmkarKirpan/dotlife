import type { ReactNode } from 'react';
import { useLongPress } from '../hooks';

/** A list row: tap selects, long-press (or right-click) edits. */
export function SpanRow({
  title,
  meta,
  active,
  onTap,
  onLongPress,
}: {
  title: string;
  meta?: ReactNode;
  active?: boolean;
  onTap: () => void;
  onLongPress?: () => void;
}) {
  const press = useLongPress(onLongPress ?? onTap, onTap);
  return (
    <button
      type="button"
      className={`row${active ? ' active' : ''}`}
      {...press}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onTap();
        } else if ((e.key === 'F2' || e.key === 'e') && onLongPress) {
          e.preventDefault();
          onLongPress();
        }
      }}
    >
      <span className="row-title">{title}</span>
      {meta && <span className="row-meta">{meta}</span>}
    </button>
  );
}
