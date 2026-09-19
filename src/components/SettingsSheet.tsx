import { useEffect, useRef, useState } from 'react';
import { buildExport, mergeSpans, parseImport, replaceSpans } from '../domain/io';
import { DEFAULT_LIFE_YEARS, defaultSpans, type Settings, type Span } from '../domain/span';
import { isValidDateString, toDateString } from '../domain/time';
import { isPersisted } from '../store';
import { Sheet } from './Sheet';

interface Props {
  spans: Span[];
  settings: Settings;
  onSettings: (patch: Partial<Settings>) => void;
  onSpans: (spans: Span[]) => void;
  onClose: () => void;
  onToast: (msg: string) => void;
}

type Mode = 'merge' | 'replace';

export function SettingsSheet({ spans, settings, onSettings, onSpans, onClose, onToast }: Props) {
  const [birth, setBirth] = useState(settings.lifeStart ?? '');
  const [years, setYears] = useState(String(settings.lifeYears ?? DEFAULT_LIFE_YEARS));
  const [importText, setImportText] = useState('');
  const [mode, setMode] = useState<Mode>('merge');
  const [error, setError] = useState<string | null>(null);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    isPersisted().then(setPersisted);
  }, []);

  const exportJson = () => JSON.stringify(buildExport(spans, new Date()), null, 2);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(exportJson());
      onToast('Copied to clipboard');
    } catch {
      onToast('Clipboard unavailable — use Download');
    }
  };

  const download = () => {
    const url = URL.createObjectURL(new Blob([exportJson()], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `dotlife-${toDateString(new Date())}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const pasteFromClipboard = async () => {
    try {
      setImportText(await navigator.clipboard.readText());
      setError(null);
    } catch {
      setError('Clipboard read was blocked. Paste into the box instead.');
    }
  };

  const runImport = () => {
    const r = parseImport(importText);
    if (!r.ok) return setError(r.error);
    const next = mode === 'merge' ? mergeSpans(spans, r.spans) : replaceSpans(r.spans, defaultSpans());
    onSpans(next);
    setImportText('');
    setError(null);
    onToast(`Imported ${r.spans.length} span${r.spans.length === 1 ? '' : 's'} (${mode})`);
  };

  const saveLife = () => {
    const y = Number(years);
    onSettings({
      lifeStart: isValidDateString(birth) ? birth : undefined,
      lifeYears: Number.isFinite(y) && y >= 1 && y <= 150 ? Math.round(y) : DEFAULT_LIFE_YEARS,
    });
  };

  return (
    <Sheet title="Settings" onClose={onClose}>
      <section className="form">
        <h3>Life</h3>
        <div className="field-row">
          <label className="field">
            <span>Birth date</span>
            <input type="date" value={birth} max={toDateString(new Date())} onChange={(e) => setBirth(e.target.value)} onBlur={saveLife} />
          </label>
          <label className="field narrow">
            <span>Years</span>
            <input type="number" inputMode="numeric" min={1} max={150} value={years} onChange={(e) => setYears(e.target.value)} onBlur={saveLife} />
          </label>
        </div>
      </section>

      <section className="form">
        <h3>Export</h3>
        <div className="actions">
          <button className="btn primary" onClick={copy}>Copy JSON</button>
          <button className="btn" onClick={download}>Download</button>
        </div>
      </section>

      <section className="form">
        <h3>Import</h3>
        <textarea
          rows={4}
          placeholder='{"version": 1, "spans": [...]}'
          value={importText}
          onChange={(e) => {
            setImportText(e.target.value);
            setError(null);
          }}
          spellCheck={false}
        />
        <div className="actions">
          <button className="btn" onClick={pasteFromClipboard}>Paste</button>
          <button className="btn" onClick={() => fileRef.current?.click()}>Choose file</button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f) setImportText(await f.text());
              e.target.value = '';
            }}
          />
        </div>
        <div className="segmented" role="radiogroup" aria-label="Import mode">
          {(['merge', 'replace'] as const).map((m) => (
            <button key={m} role="radio" aria-checked={mode === m} className={mode === m ? 'on' : ''} onClick={() => setMode(m)}>
              {m === 'merge' ? 'Merge with mine' : 'Replace mine'}
            </button>
          ))}
        </div>
        {error && <p className="error">{error}</p>}
        <button className="btn primary wide" disabled={!importText.trim()} onClick={runImport}>
          Import
        </button>
      </section>

      <section className="form">
        <h3>Storage</h3>
        <p className="muted">
          {persisted === null
            ? 'Checking…'
            : persisted
              ? 'Persistent storage granted. Data lives only on this device — export to back it up.'
              : 'Storage is best-effort. Add to Home Screen so Safari won’t clear it, and export now and then.'}
        </p>
      </section>
    </Sheet>
  );
}
