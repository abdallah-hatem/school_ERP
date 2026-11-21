'use client';

import { useLayoutEffect, type RefObject } from 'react';

/** The menu's current entry: a page link, or the rail's tile for the current module. */
const CURRENT = '[aria-current="page"], [data-nav-current]';
/** Room left between the entry and the panel's edge, so it never sits flush against it. */
const MARGIN = 8;

/**
 * Brings the menu's current entry into view by scrolling `panel` — the menu's own scroller — and
 * nothing else: never the window or another ancestor (`scrollIntoView` would scroll those too).
 * At once, never smoothly. When the entry is already fully visible nothing moves, so clicking an
 * entry on screen never jumps the menu. A hidden panel (the other variant) is left alone.
 */
export function revealCurrentItem(panel: HTMLElement | null): void {
  if (!panel || panel.clientHeight === 0) return;
  const item = panel.querySelector<HTMLElement>(CURRENT);
  if (!item) return;
  const box = panel.getBoundingClientRect();
  const rect = item.getBoundingClientRect();
  if (rect.top < box.top) {
    panel.scrollTop = Math.max(0, panel.scrollTop + rect.top - box.top - MARGIN);
  } else if (rect.bottom > box.bottom) {
    panel.scrollTop = panel.scrollTop + rect.bottom - box.bottom + MARGIN;
  }
}

/**
 * Keeps the current entry in view: on mount (a page load, or the phone drawer opening) and on
 * every navigation (`pathname`), before paint. Otherwise the panel keeps its scroll position.
 * On mount it checks once more on the next frame: remembered closed groups apply just after
 * hydration and can move the entry.
 */
export function useCurrentItemInView(panel: RefObject<HTMLElement | null>, pathname: string): void {
  useLayoutEffect(() => {
    revealCurrentItem(panel.current);
  }, [panel, pathname]);
  useLayoutEffect(() => {
    const frame = requestAnimationFrame(() => revealCurrentItem(panel.current));
    return () => cancelAnimationFrame(frame);
  }, [panel]);
}
