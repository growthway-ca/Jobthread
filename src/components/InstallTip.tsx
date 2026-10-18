import { useEffect, useState } from 'react';

const DISMISS_KEY = 'jt-install-tip-dismissed';

/** Chrome on Android fires this when the app can be installed with one tap. */
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
}

let deferredPrompt: InstallPromptEvent | null = null;
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e as InstallPromptEvent;
  });
}

function isInstalled(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent);

function readDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * "Add JobThread to your home screen", until it's installed or dismissed.
 * `always` shows it regardless of dismissal (for Settings), still hidden once installed.
 */
export function InstallTip({ always = false }: { always?: boolean }) {
  const [hidden, setHidden] = useState(() => isInstalled() || (!always && readDismissed()));
  const [canPrompt, setCanPrompt] = useState(() => deferredPrompt !== null);

  useEffect(() => {
    const onPrompt = () => setCanPrompt(true);
    const onInstalled = () => setHidden(true);
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (hidden) return null;

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      // Private mode: it just shows again next time.
    }
    setHidden(true);
  }

  async function install() {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    deferredPrompt = null;
    setCanPrompt(false);
  }

  return (
    <aside className="install-tip" aria-label="Add JobThread to your home screen">
      <div className="install-tip-text">
        <p className="install-tip-title">Put JobThread on your home screen</p>
        <p className="small">
          {canPrompt
            ? 'Opens like an app, full screen, one tap from your texts.'
            : isIOS()
              ? 'In Safari, tap the Share button, then Add to Home Screen.'
              : 'In Chrome, tap the ⋮ menu, then Add to Home screen or Install app.'}
        </p>
      </div>
      <div className="install-tip-actions">
        {canPrompt && (
          <button type="button" className="btn small" onClick={() => void install()}>
            Install
          </button>
        )}
        {!always && (
          <button type="button" className="btn small plain" onClick={dismiss} aria-label="Hide this tip">
            Not now
          </button>
        )}
      </div>
    </aside>
  );
}
