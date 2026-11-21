'use client';

import { useLayoutEffect, useRef, type RefObject } from 'react';

/**
 * Brings `el`'s top into view when the page is scrolled past it — at once, never smoothly (a
 * smooth scroll would sweep past the content, and reduced motion asks for none). The phone's
 * sticky top bar is left clear. When the top is already on screen nothing moves, so a switch made
 * near the top of the page never jumps (owner, 2026-11-21: a new tab or section starts from its
 * top, not at the old one's scroll position).
 */
export function revealTop(el: HTMLElement | null): void {
  if (!el) return;
  const bar = document.querySelector<HTMLElement>('[data-app-topbar]');
  const barHeight = bar && getComputedStyle(bar).display !== 'none' ? bar.getBoundingClientRect().height : 0;
  const offset = barHeight + 16;
  const top = el.getBoundingClientRect().top;
  if (top >= offset) return;
  window.scrollTo({ top: Math.max(0, window.scrollY + top - offset), behavior: 'instant' });
}

/**
 * Calls `revealTop(ref.current)` (then `after`) whenever `key` changes — a tab or section switch —
 * before the browser paints, so the new content never shows at the old scroll position first.
 * Not on mount: opening a page keeps the browser's own scroll handling.
 */
export function useRevealTopOnChange(
  ref: RefObject<HTMLElement | null>,
  key: string | undefined,
  after?: (el: HTMLElement) => void,
): void {
  const last = useRef(key);
  useLayoutEffect(() => {
    if (last.current === key) return;
    last.current = key;
    revealTop(ref.current);
    if (ref.current) after?.(ref.current);
    // `after` is a fresh closure each render; only a change of `key` should run this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, ref]);
}
