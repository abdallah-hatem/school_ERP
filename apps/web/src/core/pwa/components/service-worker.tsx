'use client';

import { useEffect } from 'react';
import { captureInstallPrompt } from '../install-prompt';

/** Whether this build registers the service worker: production builds only (dev chunks aren't hashed). */
export const SERVICE_WORKER_ENABLED = process.env.NODE_ENV === 'production';

/**
 * Registers `/sw.js` for the whole app (scope `/`) once the page has loaded, and starts listening
 * for the browser's install offer. Renders nothing. A browser without service workers (or an
 * insecure origin) simply runs without one.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    captureInstallPrompt();
    if (!SERVICE_WORKER_ENABLED || !('serviceWorker' in navigator)) return;
    const register = () => {
      // `updateViaCache: 'none'`: the browser always asks the server whether sw.js changed.
      navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).catch(() => undefined);
    };
    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });
  }, []);
  return null;
}
