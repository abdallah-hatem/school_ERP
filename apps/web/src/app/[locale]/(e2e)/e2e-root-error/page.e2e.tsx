/**
 * Smoke only: a page outside every error boundary (no `error.tsx` above it but the root), whose
 * server render throws — so `app/global-error.tsx` renders, and the smoke spec checks it under the
 * CSP (`e2e/35-error-pages.spec.ts`). Like `(dashboard)/e2e/server-error`, the `.e2e.tsx`
 * extension keeps it out of every build but the smoke one (`next.config.ts` → `pageExtensions`).
 */
export const dynamic = 'force-dynamic';

export default function E2ERootErrorPage(): never {
  throw new Error('e2e: a forced error outside every boundary, for the global error smoke spec');
}
