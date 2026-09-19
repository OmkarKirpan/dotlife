import { describe, expect, it } from 'vitest';
import { defaultSpans, type Span } from './span';
import { buildExport, mergeSpans, parseImport, replaceSpans } from './io';
import { headline, percent, rangeLabel } from './format';
import { resolve } from './time';

const trip: Span = { id: 'a', kind: 'fixed', start: '2026-03-03', end: '2026-04-18', label: 'Trip' };

describe('export / import', () => {
  it('round-trips', () => {
    const file = buildExport([...defaultSpans(), trip], new Date(2026, 8, 7, 13, 42));
    expect(file.exportedAt).toMatch(/^2026-09-07T13:42:00[+-]\d{2}:\d{2}$/);
    const r = parseImport(JSON.stringify(file));
    expect(r).toEqual({ ok: true, spans: file.spans });
  });

  it('rejects unknown versions instead of half-loading', () => {
    expect(parseImport(JSON.stringify({ version: 2, spans: [] })).ok).toBe(false);
    expect(parseImport(JSON.stringify({ spans: [] })).ok).toBe(false);
    expect(parseImport('not json').ok).toBe(false);
  });

  it('rejects the whole file on one bad span', () => {
    const bad = [trip, { id: 'b', kind: 'fixed', start: '2026-02-30', end: '2026-03-01', label: '' }];
    const r = parseImport(JSON.stringify({ version: 1, spans: bad }));
    expect(r.ok).toBe(false);
    expect(parseImport(JSON.stringify({ version: 1, spans: [{ ...trip, end: '2026-01-01' }] })).ok).toBe(false);
    expect(parseImport(JSON.stringify({ version: 1, spans: [trip, trip] })).ok).toBe(false);
    expect(parseImport(JSON.stringify({ version: 1, spans: [{ id: 'x', kind: 'derived', unit: 'decade', label: '' }] })).ok).toBe(false);
  });

  it('merge keeps existing order, overwrites by id, appends new', () => {
    const existing = [...defaultSpans(), trip];
    const incoming: Span[] = [{ ...trip, label: 'Renamed' }, { ...trip, id: 'c', label: 'New' }];
    const m = mergeSpans(existing, incoming);
    expect(m).toHaveLength(existing.length + 1);
    expect(m.find((s) => s.id === 'a')!.label).toBe('Renamed');
    expect(m.at(-1)!.id).toBe('c');
  });

  it('replace never loses the built-in scopes', () => {
    const r = replaceSpans([trip], defaultSpans());
    expect(r.filter((s) => s.kind === 'derived')).toHaveLength(6);
    expect(r).toContainEqual(trip);
  });
});

describe('format', () => {
  const now = new Date(2026, 8, 19);
  it('auto-names ranges from their endpoints', () => {
    expect(rangeLabel('2026-03-03', '2026-04-18', now)).toBe('Mar 3 – Apr 18');
    expect(rangeLabel('2027-03-03', '2027-04-18', now)).toBe('Mar 3 – Apr 18, 2027');
    expect(rangeLabel('2026-12-20', '2027-01-05', now)).toBe('Dec 20, 2026 – Jan 5, 2027');
    expect(rangeLabel('2026-09-19', '2026-09-19', now)).toBe('Sep 19');
  });

  it('percent never lies at the edges', () => {
    expect(percent(1, 365)).toBe(1);
    expect(percent(364, 365)).toBe(99);
    expect(percent(0, 365)).toBe(0);
    expect(percent(365, 365)).toBe(100);
  });

  it('headlines', () => {
    const r = resolve({ id: 'y', kind: 'derived', unit: 'year', label: '' }, new Date(2026, 8, 19, 13))!;
    expect(headline(r, 'left', false)).toBe('104 days left');
    expect(headline(r, 'left', true)).toBe('28% left');
    expect(headline(r, 'since', false)).toBe('261 days since');
  });
});
