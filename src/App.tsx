import { differenceInCalendarDays, format } from 'date-fns';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { startBadgeLifecycle } from './badge';
import { AheadList } from './components/AheadList';
import { Grid, type Selection } from './components/Grid';
import { InstallNudge } from './components/InstallNudge';
import { ScopePopover } from './components/ScopePopover';
import { SettingsSheet } from './components/SettingsSheet';
import { SpanEditor } from './components/SpanEditor';
import { WallpaperSheet } from './components/WallpaperSheet';
import { dotLabel, headline, plural, rangeLabel, startsIn, type Lens } from './domain/format';
import { overlaysAt, spanOverlays } from './domain/overlay';
import { PREFERRED_COLS } from './domain/grid';
import { DEFAULT_SCOPE_ID, type FixedSpan, type Settings, type Span } from './domain/span';
import { dotLastDay, dotStart, isDateDotted, isSteppable, isValidDateString, parseLocalDate, resolve, stepAnchor, toDateString, type Resolved } from './domain/time';
import { isStandalone, useNow } from './hooks';
import { load, newId, requestPersistence, saveSettings, saveSpans } from './store';

interface Toast {
  id: number;
  msg: string;
  undo?: () => void;
  view?: () => void;
}

export function App() {
  const [spans, setSpansState] = useState<Span[] | null>(null);
  const [settings, setSettingsState] = useState<Settings>({});
  const [lens, setLens] = useState<Lens>('left');
  const [popover, setPopover] = useState(false);
  const [editing, setEditing] = useState<FixedSpan | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [wallpaperOpen, setWallpaperOpen] = useState(false);
  const [anchor, setAnchor] = useState<Date | null>(null);
  const [nudge, setNudge] = useState(false);
  const [preview, setPreview] = useState<Selection | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  // Holds the last state known to be on disk, so a failed write can roll back.
  const spansRef = useRef<Span[]>([]);
  const now = useNow();

  // ---- persistence -------------------------------------------------------
  useEffect(() => {
    load().then(async ({ spans, settings, firstRun }) => {
      spansRef.current = spans;
      setSpansState(spans);
      setSettingsState(settings);
      if (firstRun) await requestPersistence();
      if (!isStandalone() && !settings.nudgeDismissed) setNudge(true);
    });
  }, []);

  // ---- toast -------------------------------------------------------------
  const showToast = useCallback((msg: string, extra: Omit<Toast, 'id' | 'msg'> = {}) => {
    setToast({ id: Date.now(), msg, ...extra });
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast((c) => (c?.id === toast.id ? null : c)), toast.undo ? 5000 : 2500);
    return () => clearTimeout(t);
  }, [toast]);

  /**
   * A write can fail — quota, private mode, evicted storage — and there is no
   * server copy to fall back on. Roll the optimistic state back so the screen
   * never claims something was saved when it was not.
   */
  const setSpans = useCallback(
    (next: Span[]) => {
      const before = spansRef.current;
      spansRef.current = next;
      setSpansState(next);
      saveSpans(next).catch(() => {
        spansRef.current = before;
        setSpansState(before);
        showToast('Could not save — storage may be full. Export your spans.');
      });
    },
    [showToast],
  );

  const patchSettings = useCallback(
    (patch: Partial<Settings>) => {
      const before = settingsRef.current;
      const next = { ...before, ...patch };
      settingsRef.current = next;
      setSettingsState(next);
      saveSettings(next).catch(() => {
        settingsRef.current = before;
        setSettingsState(before);
        showToast('Could not save that setting.');
      });
    },
    [showToast],
  );

  // ---- badge -------------------------------------------------------------
  useEffect(
    () =>
      startBadgeLifecycle((days) => {
        if (settingsRef.current.lastBadge !== days) patchSettings({ lastBadge: days });
      }),
    [patchSettings],
  );

  // ---- derived view state -----------------------------------------------
  const active = useMemo(() => {
    if (!spans) return null;
    return spans.find((s) => s.id === settings.scopeId) ?? spans.find((s) => s.id === DEFAULT_SCOPE_ID) ?? spans[0];
  }, [spans, settings.scopeId]);

  // null means "wherever now is", so the window follows the clock instead of
  // freezing at the moment the scope was opened.
  const r = useMemo(
    () =>
      active
        ? resolve(active, now, { lifeStart: settings.lifeStart, lifeYears: settings.lifeYears }, anchor ?? now)
        : null,
    [active, now, anchor, settings.lifeStart, settings.lifeYears],
  );

  const showOverlays = settings.showOverlays ?? true;
  const overlays = useMemo(
    () => (r && spans && showOverlays ? spanOverlays(r, spans, active!.id) : []),
    [r, spans, active, showOverlays],
  );

  const selectScope = (id: string) => {
    patchSettings({ scopeId: id });
    setPopover(false);
    setAnchor(null); // a new scope starts at now, not wherever the last one was left
    if (lens === 'ahead') setLens('left');
  };

  const step = (delta: number) => {
    if (!active || active.kind !== 'derived') return;
    setAnchor((a) => stepAnchor(active.unit, a ?? now, delta));
  };

  /** A span you can place anywhere, rather than only where you can drag. */
  const newSpan = () => {
    const today = toDateString(now);
    setPopover(false);
    setEditing({ id: newId(), kind: 'fixed', start: today, end: today, label: rangeLabel(today, today, now) });
  };

  const createFromSelection = (sel: Selection) => {
    if (!r || !spans) return;
    const start = toDateString(dotStart(r, sel.lo));
    const end = toDateString(dotLastDay(r, sel.hi));
    const span: FixedSpan = { id: newId(), kind: 'fixed', start, end, label: rangeLabel(start, end, new Date()) };
    const before = spans;
    setSpans([...spans, span]);
    showToast(`Created “${span.label}”`, {
      undo: () => {
        setSpans(before);
        setToast(null);
      },
      view: () => {
        selectScope(span.id);
        setToast(null);
      },
    });
  };

  if (!spans || !active) return <div className="app loading" />;

  const upcoming = spans
    .filter((s): s is FixedSpan => s.kind === 'fixed' && parseLocalDate(s.start) > now)
    .sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end));

  const percentMode = settings.headlinePercent ?? false;

  let title: string;
  let line: string;
  let sub: string;
  if (lens === 'ahead') {
    title = 'Ahead';
    const next = upcoming[0];
    line = next ? capitalize(startsIn(next, now)) : 'Nothing ahead';
    sub = next ? `Next: ${next.label} · ${upcoming.length} upcoming` : 'Drag across a grid to add a span';
  } else {
    title = active.label;
    line = r ? headline(r, lens, percentMode) : 'Set your birth date';
    sub = r ? scopeSubline(r) : 'Life is drawn in weeks';
    if (preview && r) {
      if (preview.creating) {
        const s = toDateString(dotStart(r, preview.lo));
        const e = toDateString(dotLastDay(r, preview.hi));
        const days = differenceInCalendarDays(parseLocalDate(e), parseLocalDate(s)) + 1;
        line = rangeLabel(s, e, now);
        sub = `Release to create · ${plural(days, 'day')}`;
      } else {
        line = dotLabel(r.unit, dotStart(r, preview.lo));
        sub = preview.lo < r.elapsed ? 'Gone' : preview.lo === r.elapsed ? 'Now' : 'Ahead';
        const here = overlaysAt(overlays, preview.lo);
        if (here.length > 0) sub += ` · ${here.map((o) => o.label).join(' · ')}`;
        else if (isDateDotted(r)) sub += ' · hold or drag to create a span';
      }
    }
  }

  return (
    <div className="app">
      <header className="header">
        <div className="scope-row">
        <div className="scope-wrap">
          <button className="scope-btn" onClick={() => setPopover((p) => !p)} aria-haspopup="menu" aria-expanded={popover}>
            {title}
            <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
              <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          {popover && (
            <ScopePopover
              spans={spans}
              activeId={active.id}
              now={now}
              onSelect={selectScope}
              onEdit={(s) => {
                setPopover(false);
                setEditing(s);
              }}
              onNewSpan={newSpan}
              onWallpaper={() => {
                setPopover(false);
                if (!r) return showToast('Set your birth date first');
                // Ahead has no grid to draw; fall back to the scope's own.
                if (lens === 'ahead') setLens('left');
                setWallpaperOpen(true);
              }}
              onSettings={() => {
                setPopover(false);
                setSettingsOpen(true);
              }}
              onClose={() => setPopover(false)}
            />
          )}
        </div>
        {lens !== 'ahead' && isSteppable(active) && (
          <div className="stepper">
            <button onClick={() => step(-1)} aria-label={`Previous ${active.label.toLowerCase()}`}>
              <Chevron dir="left" />
            </button>
            {anchor && (
              <button className="now-btn" onClick={() => setAnchor(null)}>
                Now
              </button>
            )}
            <button onClick={() => step(1)} aria-label={`Next ${active.label.toLowerCase()}`}>
              <Chevron dir="right" />
            </button>
          </div>
        )}
        </div>
        <button
          className={`headline${preview?.creating ? ' creating' : ''}`}
          onClick={() => lens !== 'ahead' && patchSettings({ headlinePercent: !percentMode })}
          aria-label={`${line}. Tap to switch between count and percent.`}
        >
          {line}
        </button>
        <p className="subline" aria-live="polite">
          {sub}
        </p>
      </header>

      <main className="stage">
        {lens === 'ahead' ? (
          <AheadList
            spans={upcoming}
            now={now}
            onOpen={(s) => selectScope(s.id)}
            onEdit={setEditing}
          />
        ) : r ? (
          <Grid
            key={active.id}
            r={r}
            preferredCols={active.kind === 'derived' ? PREFERRED_COLS[active.unit] : undefined}
            lens={lens}
            draggable={isDateDotted(r)}
            overlays={overlays}
            onPreview={setPreview}
            onCreate={createFromSelection}
          />
        ) : (
          <LifeSetup onSet={(d) => patchSettings({ lifeStart: d })} />
        )}
      </main>

      <nav className="tabbar" aria-label="Lens">
        {(['left', 'since', 'ahead'] as const).map((l) => (
          <button key={l} className={lens === l ? 'on' : ''} aria-current={lens === l} onClick={() => setLens(l)}>
            <LensIcon lens={l} />
            <span>{l === 'left' ? 'Left' : l === 'since' ? 'Since' : 'Ahead'}</span>
          </button>
        ))}
      </nav>

      {toast && (
        <div className="toast" role="status" key={toast.id}>
          <span>{toast.msg}</span>
          {toast.view && <button onClick={toast.view}>View</button>}
          {toast.undo && <button onClick={toast.undo}>Undo</button>}
        </div>
      )}

      {nudge && (
        <InstallNudge
          onDismiss={() => {
            setNudge(false);
            patchSettings({ nudgeDismissed: true });
          }}
        />
      )}

      {editing && (
        <SpanEditor
          span={editing}
          isNew={!spans.some((x) => x.id === editing.id)}
          onClose={() => setEditing(null)}
          onSave={(s) =>
            setSpans(spans.some((x) => x.id === s.id) ? spans.map((x) => (x.id === s.id ? s : x)) : [...spans, s])
          }
          onDelete={(id) => {
            // A span that was never saved just goes away; nothing to undo.
            if (!spans.some((x) => x.id === id)) return;
            const before = spans;
            setSpans(spans.filter((x) => x.id !== id));
            if (settings.scopeId === id) patchSettings({ scopeId: DEFAULT_SCOPE_ID });
            showToast('Span deleted', { undo: () => { setSpans(before); setToast(null); } });
          }}
        />
      )}

      {wallpaperOpen && r && lens !== 'ahead' && (
        <WallpaperSheet
          span={active}
          r={r}
          headline={headline(r, lens, percentMode)}
          lens={lens}
          overlays={overlays}
          onClose={() => setWallpaperOpen(false)}
          onToast={(m) => showToast(m)}
        />
      )}

      {settingsOpen && (
        <SettingsSheet
          spans={spans}
          settings={settings}
          onSettings={patchSettings}
          onSpans={setSpans}
          onClose={() => setSettingsOpen(false)}
          onToast={(m) => showToast(m)}
        />
      )}
    </div>
  );
}

function scopeSubline(r: Resolved): string {
  const last = new Date(r.end.getTime() - 1);
  const unit = `1 dot = 1 ${r.unit}`;
  if (r.unit === 'minute') return `${unit} · ${format(r.start, 'HH:mm')}–${format(r.end, 'HH:mm')}`;
  if (r.unit === 'hour') return `${unit} · ${format(r.start, 'EEE, MMM d')}`;
  return `${unit} · ${rangeLabel(toDateString(r.start), toDateString(last), new Date())}`;
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function Chevron({ dir }: { dir: 'left' | 'right' }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path
        d={dir === 'left' ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'}
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function LifeSetup({ onSet }: { onSet: (d: string) => void }) {
  const [v, setV] = useState('');
  return (
    <form
      className="life-setup"
      onSubmit={(e) => {
        e.preventDefault();
        if (isValidDateString(v)) onSet(v);
      }}
    >
      <p>Your life, one dot per week. Enter a birth date to draw it.</p>
      <input type="date" value={v} max={toDateString(new Date())} onChange={(e) => setV(e.target.value)} aria-label="Birth date" />
      <button className="btn primary" disabled={!isValidDateString(v)}>
        Draw it
      </button>
    </form>
  );
}

function LensIcon({ lens }: { lens: Lens }) {
  const p = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      {lens === 'left' && (
        <>
          <circle cx="7" cy="7" r="2" {...p} />
          <circle cx="17" cy="7" r="2" {...p} />
          <circle cx="7" cy="17" r="2" fill="currentColor" stroke="none" />
          <circle cx="17" cy="17" r="2" fill="currentColor" stroke="none" />
        </>
      )}
      {lens === 'since' && (
        <>
          <circle cx="7" cy="7" r="2" fill="currentColor" stroke="none" />
          <circle cx="17" cy="7" r="2" fill="currentColor" stroke="none" />
          <circle cx="7" cy="17" r="2" {...p} />
          <circle cx="17" cy="17" r="2" {...p} />
        </>
      )}
      {lens === 'ahead' && <path d="M4 12h14M13 6l6 6-6 6" {...p} />}
    </svg>
  );
}
