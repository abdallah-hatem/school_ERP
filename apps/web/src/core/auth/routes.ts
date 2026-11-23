/** Sections that need a session: the folders of `app/[locale]/(dashboard)` and `(auth)/set-password`. */
const SIGNED_IN_SECTIONS = [
  'account',
  'accounting',
  'activity',
  'employees',
  'lateness',
  'payroll',
  'penalties',
  'roles',
  'set-password',
  'settings',
  'users',
] as const;

/** Smoke-only dashboard sections (`page.e2e.tsx`): routes only in `NEXT_PUBLIC_E2E_HOOKS` builds. */
export const E2E_SECTIONS: readonly string[] = ['e2e'];

/**
 * The first path segment of every page under `/<locale>/` that a signed-out visitor is sent to sign
 * in for (`login` itself is guest-only). Any other segment is shown the "Page not found" screen
 * (with Sign in) instead, since no sign-in could open it. A deeper wrong address inside a known
 * section (`/en/employees/x/y`) still goes to sign in, so it reveals nothing.
 * `routes.test.ts` fails when a segment of any route group is in neither this list nor its public
 * allow-list, and when a route group appears that it doesn't know.
 */
export const APP_SECTIONS: ReadonlySet<string> = new Set([
  ...SIGNED_IN_SECTIONS,
  'login',
  ...(process.env.NEXT_PUBLIC_E2E_HOOKS === 'true' ? E2E_SECTIONS : []),
]);

/** `page` is the path after the locale (`/`, `/employees/12`). True when no section of the app starts it. */
export function isUnknownSection(page: string): boolean {
  if (page === '/') return false;
  const section = page.split('/')[1] ?? '';
  return !APP_SECTIONS.has(section);
}
