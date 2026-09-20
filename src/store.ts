import { get, set } from 'idb-keyval';
import { defaultSpans, type Settings, type Span } from './domain/span';

const SPANS = 'spans';
const SETTINGS = 'settings';

export interface Loaded {
  spans: Span[];
  settings: Settings;
  firstRun: boolean;
}

export async function load(): Promise<Loaded> {
  const [spans, settings] = await Promise.all([get<Span[]>(SPANS), get<Settings>(SETTINGS)]);
  if (!spans) {
    const seeded = defaultSpans();
    await set(SPANS, seeded);
    return { spans: seeded, settings: settings ?? {}, firstRun: true };
  }
  return { spans, settings: settings ?? {}, firstRun: false };
}

/**
 * These reject when the write fails — quota exceeded, private mode, storage
 * evicted mid-session. There is no server copy, so a caller that drops the
 * rejection is telling the user their data is safe when it is gone. Handle it.
 */
export const saveSpans = (spans: Span[]) => set(SPANS, spans);
export const saveSettings = (settings: Settings) => set(SETTINGS, settings);

/** Ask the browser not to evict us. Home Screen install is the real guarantee on iOS. */
export async function requestPersistence(): Promise<boolean> {
  try {
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}

export async function isPersisted(): Promise<boolean> {
  try {
    return (await navigator.storage?.persisted?.()) ?? false;
  } catch {
    return false;
  }
}

export function newId(): string {
  return crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
