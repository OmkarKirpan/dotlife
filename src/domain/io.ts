import { format } from 'date-fns';
import { DERIVED_UNITS, type DerivedUnit, type Span } from './span';
import { isValidDateString, parseLocalDate } from './time';

export const EXPORT_VERSION = 1;

export interface ExportFile {
  version: 1;
  exportedAt: string;
  spans: Span[];
}

export function buildExport(spans: Span[], now: Date): ExportFile {
  // ISO 8601 with local offset, e.g. 2026-09-07T13:42:00+05:30
  return { version: EXPORT_VERSION, exportedAt: format(now, "yyyy-MM-dd'T'HH:mm:ssxxx"), spans };
}

export type ImportResult = { ok: true; spans: Span[] } | { ok: false; error: string };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string';

function validateSpan(v: unknown, i: number): Span | string {
  if (!isObj(v)) return `spans[${i}] is not an object`;
  const { id, kind, label } = v;
  if (!isStr(id) || id.length === 0) return `spans[${i}].id missing`;
  if (!isStr(label)) return `spans[${i}].label missing`;
  if (kind === 'derived') {
    if (!DERIVED_UNITS.includes(v.unit as DerivedUnit)) return `spans[${i}].unit is not a known unit`;
    return { id, kind, unit: v.unit as DerivedUnit, label };
  }
  if (kind === 'fixed') {
    if (!isValidDateString(v.start)) return `spans[${i}].start is not YYYY-MM-DD`;
    if (!isValidDateString(v.end)) return `spans[${i}].end is not YYYY-MM-DD`;
    if (parseLocalDate(v.end) < parseLocalDate(v.start)) return `spans[${i}] ends before it starts`;
    return { id, kind, start: v.start, end: v.end, label };
  }
  return `spans[${i}].kind is not 'derived' or 'fixed'`;
}

/** All-or-nothing. Unknown versions and any malformed span reject the whole file. */
export function parseImport(text: string): ImportResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'Not valid JSON.' };
  }
  if (!isObj(raw)) return { ok: false, error: 'Expected a JSON object.' };
  if (raw.version !== EXPORT_VERSION) {
    return { ok: false, error: `Unsupported version: ${JSON.stringify(raw.version)}. Expected ${EXPORT_VERSION}.` };
  }
  if (!Array.isArray(raw.spans)) return { ok: false, error: 'Missing "spans" array.' };
  const spans: Span[] = [];
  const ids = new Set<string>();
  for (let i = 0; i < raw.spans.length; i++) {
    const r = validateSpan(raw.spans[i], i);
    if (typeof r === 'string') return { ok: false, error: r };
    if (ids.has(r.id)) return { ok: false, error: `Duplicate id: ${r.id}` };
    ids.add(r.id);
    spans.push(r);
  }
  return { ok: true, spans };
}

/**
 * Merge: existing spans keep their place; imported spans with a new id are
 * appended; imported spans with an existing id overwrite that span's fields.
 */
export function mergeSpans(existing: Span[], incoming: Span[]): Span[] {
  const byId = new Map(incoming.map((s) => [s.id, s]));
  const merged = existing.map((s) => byId.get(s.id) ?? s);
  const have = new Set(existing.map((s) => s.id));
  for (const s of incoming) if (!have.has(s.id)) merged.push(s);
  return merged;
}

/** Replace, but never lose the built-in derived scopes. */
export function replaceSpans(incoming: Span[], defaults: Span[]): Span[] {
  const have = new Set(incoming.map((s) => s.id));
  return [...defaults.filter((d) => !have.has(d.id)), ...incoming];
}
