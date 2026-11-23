'use client';

import { useEffect, useState } from 'react';

const CODE_ALPHABET = '0123456789ABCDEFGHJKLMNPQRSTUVWXYZ';

/** A short code for an error that has no server digest (it was thrown in the browser): `C-7F3A2C`. */
export function clientErrorCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return `C-${Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('')}`;
}

/**
 * The reference a person quotes to support when a page fails: Next's `error.digest` when the error
 * came from the server — the id the web server logged with the error (docs/ARCHITECTURE.md → Error
 * pages) — else a short random code. Either way it is logged to the browser console with the
 * error, so a screenshot of the console matches the screen.
 */
export function useErrorReference(error: Error & { digest?: string }): string {
  const [code] = useState(() => error.digest || clientErrorCode());
  useEffect(() => {
    console.error(`[error-ref ${code}]`, error);
  }, [code, error]);
  return code;
}
