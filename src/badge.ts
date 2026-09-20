import type { Span } from './domain/span';
import { daysLeftInCurrentYear, isDateDotted, nextLocalMidnight, resolve, type ResolveContext } from './domain/time';

type BadgeNavigator = Navigator & {
  setAppBadge?: (n?: number) => Promise<void>;
};

/**
 * What the badge should read for a given scope.
 *
 * Minute and hour counts are excluded on purpose: they are wrong within the
 * hour, and there is no background refresh to correct them, so they would be
 * confidently stale all day. Those scopes fall back to days left in the year,
 * which is what the badge has always shown.
 */
export function badgeValue(span: Span | null, now: Date, ctx: ResolveContext = {}): number {
  const r = span ? resolve(span, now, ctx) : null;
  return r && isDateDotted(r) ? r.remaining : daysLeftInCurrentYear(now);
}

export function setBadge(value: number): void {
  (navigator as BadgeNavigator).setAppBadge?.(value)?.catch(() => {});
}

/**
 * Update on launch, on becoming visible, and at each local midnight while open.
 * There is no background refresh on iOS — a week unopened means a badge stale by seven.
 */
export function startBadgeLifecycle(compute: (now: Date) => number, onSync?: (value: number) => void): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const run = () => {
    const value = compute(new Date());
    setBadge(value);
    onSync?.(value);
  };

  const arm = () => {
    clearTimeout(timer);
    const now = new Date();
    // +1s so we land safely after midnight, not a hair before it.
    const ms = nextLocalMidnight(now).getTime() - now.getTime() + 1000;
    timer = setTimeout(() => {
      run();
      arm();
    }, ms);
  };

  const onVisible = () => {
    if (document.visibilityState === 'visible') {
      run();
      arm(); // timers are frozen in the background; re-arm from the real clock
    }
  };

  run();
  arm();
  document.addEventListener('visibilitychange', onVisible);
  return () => {
    clearTimeout(timer);
    document.removeEventListener('visibilitychange', onVisible);
  };
}
