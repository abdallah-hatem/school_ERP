'use client';

import { useSyncExternalStore } from 'react';

/**
 * Whether a media query matches, kept in sync as the window changes. The server (and the first
 * client render, so hydration matches) answers `serverValue`; use it for what CSS can't switch —
 * a placeholder, which edge a sheet opens from — never to hide content.
 */
export function useMediaQuery(query: string, serverValue = false): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window.matchMedia !== 'function') return () => undefined;
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    // No matchMedia (jsdom in tests): the server's answer.
    () => (typeof window.matchMedia === 'function' ? window.matchMedia(query).matches : serverValue),
    () => serverValue,
  );
}

/** Tablet and up (768px): the breakpoint where sheets come from the side instead of the bottom. */
export const TABLET_UP = '(min-width: 48rem)';
