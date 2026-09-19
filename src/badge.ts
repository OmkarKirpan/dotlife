import { daysLeftInCurrentYear, nextLocalMidnight } from './domain/time';

type BadgeNavigator = Navigator & {
  setAppBadge?: (n?: number) => Promise<void>;
};

/** The badge always shows days left in the year, whatever scope is on screen. */
export function syncBadge(now = new Date()): number {
  const days = daysLeftInCurrentYear(now);
  (navigator as BadgeNavigator).setAppBadge?.(days)?.catch(() => {});
  return days;
}

/**
 * Update on launch, on becoming visible, and at each local midnight while open.
 * There is no background refresh on iOS — a week unopened means a badge stale by seven.
 */
export function startBadgeLifecycle(onSync?: (days: number) => void): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const run = () => onSync?.(syncBadge());

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
