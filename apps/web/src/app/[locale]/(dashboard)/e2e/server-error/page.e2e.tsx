/**
 * Smoke only: a dashboard page whose server render throws, so the error screen (with Next's digest
 * as the reference code) can be checked end to end (`e2e/35-error-pages.spec.ts`).
 *
 * The `.e2e.tsx` extension is the guard: `next.config.ts` adds it to `pageExtensions` only when the
 * build has `NEXT_PUBLIC_E2E_HOOKS=true` (scripts/smoke.sh, CI's smoke job). Every other build —
 * dev, testing, production, the schools' images — doesn't see this file as a page at all, so the
 * route doesn't exist there (the address is a plain 404).
 */
export const dynamic = 'force-dynamic';

export default function E2EServerErrorPage(): never {
  throw new Error('e2e: a forced server error for the error screen smoke spec');
}
