export type DerivedUnit = 'now' | 'today' | 'week' | 'month' | 'year' | 'life';

/** Dates are 'YYYY-MM-DD', local wall-clock. Fixed-span endpoints are inclusive. */
export type Span =
  | { id: string; kind: 'derived'; unit: DerivedUnit; label: string }
  | { id: string; kind: 'fixed'; start: string; end: string; label: string };

export type FixedSpan = Extract<Span, { kind: 'fixed' }>;
export type DerivedSpan = Extract<Span, { kind: 'derived' }>;

/** What a single dot means in a given scope. */
export type DotUnit = 'minute' | 'hour' | 'day' | 'week';

export interface Settings {
  /** Birth date, 'YYYY-MM-DD'. Required for the Life scope. */
  lifeStart?: string;
  /** Horizon for the Life scope, in years. */
  lifeYears?: number;
  /** Last value written to the app badge. */
  lastBadge?: number;
  /** Currently selected span id. */
  scopeId?: string;
  /** The one-time install nudge has been shown and dismissed. */
  nudgeDismissed?: boolean;
  /** Headline shows a percentage instead of a count. */
  headlinePercent?: boolean;
  /** Draw your spans on top of day- and week-dotted grids. Default on. */
  showOverlays?: boolean;
}

export const DERIVED_UNITS: readonly DerivedUnit[] = ['now', 'today', 'week', 'month', 'year', 'life'];

export const DERIVED_LABELS: Record<DerivedUnit, string> = {
  now: 'This hour',
  today: 'Today',
  week: 'This week',
  month: 'This month',
  year: 'This year',
  life: 'Life',
};

export function defaultSpans(): Span[] {
  return DERIVED_UNITS.map((unit) => ({
    id: `derived:${unit}`,
    kind: 'derived' as const,
    unit,
    label: DERIVED_LABELS[unit],
  }));
}

export const DEFAULT_SCOPE_ID = 'derived:year';
export const DEFAULT_LIFE_YEARS = 80;
