import { format } from 'date-fns';
import type { FixedSpan } from '../domain/span';
import { spanLength, startsIn } from '../domain/format';
import { parseLocalDate } from '../domain/time';
import { SpanRow } from './SpanRow';

interface Props {
  spans: FixedSpan[]; // already filtered to upcoming and sorted by start
  now: Date;
  onOpen: (s: FixedSpan) => void;
  onEdit: (s: FixedSpan) => void;
}

export function AheadList({ spans, now, onOpen, onEdit }: Props) {
  if (spans.length === 0) {
    return (
      <div className="empty">
        <p>Nothing ahead yet.</p>
        <p className="muted">
          On the Year or Month grid, drag across future days — or press and hold one — to make a span. It saves as soon
          as you let go.
        </p>
      </div>
    );
  }
  return (
    <div className="ahead">
      {spans.map((s) => (
        <SpanRow
          key={s.id}
          title={s.label}
          meta={
            <>
              <span className="accent">{startsIn(s, now)}</span> · {format(parseLocalDate(s.start), 'EEE, MMM d')} ·{' '}
              {spanLength(s)}
            </>
          }
          onTap={() => onOpen(s)}
          onLongPress={() => onEdit(s)}
        />
      ))}
      <p className="muted hint">Tap to open · hold to rename</p>
    </div>
  );
}
