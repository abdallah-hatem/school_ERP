/**
 * The first path segment of every page under `/<locale>/` — the folders of `app/[locale]/(dashboard)`
 * and `app/[locale]/(auth)` (`routes.test.ts` keeps the two equal). A signed-out visitor on any
 * other segment is shown the "Page not found" screen (with Sign in) instead of being sent to sign
 * in, since no sign-in could open it. Known sections still send them to sign in, so a deeper wrong
 * address there (`/en/employees/x/y`) reveals nothing until they have.
 */
export const APP_SECTIONS: ReadonlySet<string> = new Set([
  'account',
  'accounting',
  'activity',
  'e2e',
  'employees',
  'lateness',
  'login',
  'payroll',
  'penalties',
  'roles',
  'set-password',
  'settings',
  'users',
]);

/** `page` is the path after the locale (`/`, `/employees/12`). True when no section of the app starts it. */
export function isUnknownSection(page: string): boolean {
  if (page === '/') return false;
  const section = page.split('/')[1] ?? '';
  return !APP_SECTIONS.has(section);
}
