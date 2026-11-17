'use client';

import { useCallback, useState } from 'react';

/**
 * Server data a screen also replaces with its mutations' responses, kept to the newest version.
 *
 * Each version carries `asOf`: the server's clock (`Date.now()` on the Next server) before it read
 * the data for a render, or after the API answered a mutation. A navigation started before a
 * mutation (a debounced search, "Clear filters") can land after it, with props read before the
 * write — e.g. the run back at Draft after Approve. Props older than what the screen holds are
 * ignored, and `staleCount` goes up so the screen can re-read the current URL (`router.refresh()`).
 * Both stamps come from the same server, so they compare; the browser's clock never takes part.
 */
export function useNewestServerState<T>(serverValue: T, serverAsOf: number) {
  const [current, setCurrent] = useState({ value: serverValue, asOf: serverAsOf });
  const [seen, setSeen] = useState(serverValue);
  const [staleCount, setStaleCount] = useState(0);

  if (seen !== serverValue) {
    setSeen(serverValue);
    if (serverAsOf >= current.asOf) setCurrent({ value: serverValue, asOf: serverAsOf });
    else setStaleCount((n) => n + 1);
  }

  /** A mutation's result, stamped by the server action; an older one never replaces a newer one. */
  const apply = useCallback((value: T, asOf: number) => {
    setCurrent((prev) => (asOf >= prev.asOf ? { value, asOf } : prev));
  }, []);

  return { value: current.value, asOf: current.asOf, apply, staleCount };
}
