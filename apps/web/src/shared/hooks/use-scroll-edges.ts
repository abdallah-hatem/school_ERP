'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export interface ScrollEdges {
  /** More content hidden past the start edge (left in English, right in Arabic). */
  start: boolean;
  /** More content hidden past the end edge. */
  end: boolean;
}

const NONE: ScrollEdges = { start: false, end: false };

/**
 * Which sides of a horizontally scrolling container hide content, so a scroll cue is drawn only
 * there — and never on a container that fits. Works in both directions: RTL scroll positions run
 * from 0 to negative, so the distance from the start edge is `|scrollLeft|`.
 */
export function useScrollEdges<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [edges, setEdges] = useState<ScrollEdges>(NONE);

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    const fromStart = Math.abs(el.scrollLeft);
    const next = max <= 1 ? NONE : { start: fromStart > 1, end: fromStart < max - 1 };
    setEdges((prev) => (prev.start === next.start && prev.end === next.end ? prev : next));
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    measure();
    el.addEventListener('scroll', measure, { passive: true });
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(el);
    if (el.firstElementChild) observer?.observe(el.firstElementChild);
    return () => {
      el.removeEventListener('scroll', measure);
      observer?.disconnect();
    };
  }, [measure]);

  return { ref, edges };
}
