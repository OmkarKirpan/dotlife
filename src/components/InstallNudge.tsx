import { useEffect, useState } from 'react';
import { isIOS } from '../hooks';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: BeforeInstallPromptEvent | null = null;
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
  });
}

/** One-time nudge. Install is the durability story, so the copy says so. */
export function InstallNudge({ onDismiss }: { onDismiss: () => void }) {
  const [canPrompt, setCanPrompt] = useState(deferred !== null);

  useEffect(() => {
    const on = (e: Event) => {
      e.preventDefault();
      deferred = e as BeforeInstallPromptEvent;
      setCanPrompt(true);
    };
    window.addEventListener('beforeinstallprompt', on);
    return () => window.removeEventListener('beforeinstallprompt', on);
  }, []);

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    deferred = null;
    onDismiss();
  };

  return (
    <div className="nudge" role="dialog" aria-label="Add to Home Screen">
      <p className="nudge-title">Keep your spans</p>
      <p>
        Everything lives on this device, nowhere else. Safari clears data for sites you haven’t opened in a week —
        apps on your Home Screen are exempt.
      </p>
      {isIOS() ? (
        <p className="nudge-how">
          Tap <ShareIcon /> <b>Share</b>, then <b>Add to Home Screen</b>.
        </p>
      ) : !canPrompt ? (
        <p className="nudge-how">Use your browser’s menu to install this app.</p>
      ) : null}
      <div className="actions">
        <button className="btn" onClick={onDismiss}>
          Not now
        </button>
        {canPrompt && (
          <button className="btn primary" onClick={install}>
            Install
          </button>
        )}
      </div>
    </div>
  );
}

function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" style={{ verticalAlign: '-3px' }}>
      <path d="M12 3v12M8 7l4-4 4 4M6 11v9h12v-9" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
