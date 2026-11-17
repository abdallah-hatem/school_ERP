'use client';

import { createContext, useContext, useEffect } from 'react';
import { setLeaveGuard } from '@/shared/lib/leave-guard';

/**
 * Unsaved-changes tracking for the Settings screen. A section reports whether its form has edits
 * (`useReportDirty`); the screen asks before switching section, following a link or closing the
 * tab while it does (`useLeaveGuard`).
 */
const DirtyContext = createContext<(source: string, dirty: boolean) => void>(() => {});

export const DirtyReporterProvider = DirtyContext.Provider;

/**
 * Call from a form with its `isDirty`; `source` tells forms of one section apart (the school form
 * and the logo card). Unmounting clears it.
 */
export function useReportDirty(source: string, dirty: boolean) {
  const report = useContext(DirtyContext);
  useEffect(() => {
    report(source, dirty);
    return () => report(source, false);
  }, [source, dirty, report]);
}

/**
 * While `dirty`: the browser's own prompt on reload / close, and in-app link clicks are held and
 * handed to `onLeaveAttempt(href)` so the screen can ask first. Navigations from buttons that go
 * through `requestLeave` (the language switch) are handed over as a function to run instead.
 * `onLeaveAttempt` must be stable.
 */
export function useLeaveGuard(dirty: boolean, onLeaveAttempt: (target: string | (() => void)) => void) {
  useEffect(() => {
    if (!dirty) return;
    const unregister = setLeaveGuard((proceed) => onLeaveAttempt(proceed));

    function beforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      // Older browsers need a value to show their prompt.
      e.returnValue = '';
    }

    function click(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const anchor = (e.target as Element | null)?.closest?.('a[href]');
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (anchor.target === '_blank' || anchor.hasAttribute('download')) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      // Capture phase on the document runs before Next's <Link> handler; stop it there.
      e.preventDefault();
      e.stopPropagation();
      onLeaveAttempt(`${url.pathname}${url.search}${url.hash}`);
    }

    window.addEventListener('beforeunload', beforeUnload);
    document.addEventListener('click', click, true);
    return () => {
      unregister();
      window.removeEventListener('beforeunload', beforeUnload);
      document.removeEventListener('click', click, true);
    };
  }, [dirty, onLeaveAttempt]);
}
