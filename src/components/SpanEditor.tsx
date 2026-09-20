import { useState } from 'react';
import type { FixedSpan } from '../domain/span';
import { isValidDateString, parseLocalDate } from '../domain/time';
import { Sheet } from './Sheet';

interface Props {
  span: FixedSpan;
  /** A span that has never been saved: no delete, and the title says so. */
  isNew?: boolean;
  onSave: (span: FixedSpan) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

export function SpanEditor({ span, isNew, onSave, onDelete, onClose }: Props) {
  const [label, setLabel] = useState(span.label);
  const [start, setStart] = useState(span.start);
  const [end, setEnd] = useState(span.end);
  const [confirming, setConfirming] = useState(false);

  const datesOk = isValidDateString(start) && isValidDateString(end) && parseLocalDate(end) >= parseLocalDate(start);
  const canSave = label.trim().length > 0 && datesOk;

  const save = () => {
    if (!canSave) return;
    onSave({ ...span, label: label.trim(), start, end });
    onClose();
  };

  return (
    <Sheet title={isNew ? 'New span' : 'Edit span'} onClose={onClose}>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <label className="field">
          <span>Name</span>
          <input autoFocus value={label} onChange={(e) => setLabel(e.target.value)} onFocus={(e) => e.target.select()} />
        </label>
        <div className="field-row">
          <label className="field">
            <span>Start</span>
            <input type="date" value={start} max={end} onChange={(e) => setStart(e.target.value)} />
          </label>
          <label className="field">
            <span>End</span>
            <input type="date" value={end} min={start} onChange={(e) => setEnd(e.target.value)} />
          </label>
        </div>
        {!datesOk && <p className="error">End must be on or after start.</p>}
        <div className="actions">
          <button
            type="button"
            className={isNew ? 'btn' : `btn danger${confirming ? ' confirm' : ''}`}
            onClick={() => {
              if (isNew) return onClose();
              if (!confirming) return setConfirming(true);
              onDelete(span.id);
              onClose();
            }}
          >
            {isNew ? 'Cancel' : confirming ? 'Tap again to delete' : 'Delete'}
          </button>
          <button type="submit" className="btn primary" disabled={!canSave}>
            {isNew ? 'Create' : 'Save'}
          </button>
        </div>
      </form>
    </Sheet>
  );
}
