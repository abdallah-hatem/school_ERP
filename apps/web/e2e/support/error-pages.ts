import { expect, type Page, type Response } from '@playwright/test';
import type { Language } from '@school-erp/shared';
import { t } from './i18n';

/** A path no page answers, and the smoke-only page whose server render throws (`page.e2e.tsx`). */
export const MISSING_PATH = '/no-such-page-404';
/** A missing address with an extension (the proxy sees it, so it gets the locale's 404). */
export const DOTTED_MISSING_PATH = '/no-such.php';
/** A missing route handler (`app/api/[...missing]/route.ts` answers a JSON 404). */
export const API_MISSING_PATH = '/api/no-such';
export const FORCED_ERROR_PATH = '/e2e/server-error';
/** Smoke-only too: a page outside every error boundary, so the root `global-error` renders. */
export const ROOT_ERROR_PATH = '/e2e-root-error';
/** A well-formed id no employee has. */
export const UNKNOWN_EMPLOYEE_ID = '00000000-0000-4000-8000-00000000e404';

/** Collects the page's CSP violations (`securitypolicyviolation`) from its first script on. */
export async function watchCsp(page: Page): Promise<string[]> {
  const violations: string[] = [];
  await page.exposeFunction('__cspViolation', (text: string) => violations.push(text));
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) => {
      const report = (window as unknown as { __cspViolation: (t: string) => void }).__cspViolation;
      report(`${e.violatedDirective} blocked ${e.blockedURI || 'inline'} on ${location.pathname}`);
    });
  });
  return violations;
}

/** Never cached anywhere: every page is per-user (CLAUDE.md rule 7). */
export function expectNoStore(res: Response | null): void {
  expect(res?.headers()['cache-control'], `cache-control of ${res?.url()}`).toContain('no-store');
}

/** The outside-the-shell "Page not found", with the way out for the signed-in state. */
export async function expectPageNotFound(page: Page, locale: Language, signedIn: boolean): Promise<void> {
  await expect(page.getByRole('heading', { level: 1, name: t(locale, 'ui.errorPages.notFoundTitle') })).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
  const back = page.getByRole('link', { name: t(locale, 'ui.errorPages.backToDashboard') });
  const signIn = page.getByRole('link', { name: t(locale, 'ui.errorPages.signIn') });
  if (signedIn) {
    await expect(back).toHaveAttribute('href', `/${locale}`);
    await expect(signIn).toHaveCount(0);
  } else {
    await expect(signIn).toHaveAttribute('href', `/${locale}/login`);
    await expect(back).toHaveCount(0);
  }
  // Outside the shell: no sidebar or menu.
  await expect(page.locator('#main')).toHaveCount(0);
  await expect(page).toHaveTitle(new RegExp(`^${t(locale, 'ui.errorPages.notFoundTitle')} · `));
}

/** The standalone whole-app error (`app/global-error.tsx`): its own document in the address's language. */
export async function expectGlobalError(page: Page, locale: Language): Promise<void> {
  await expect(page.locator('html')).toHaveAttribute('lang', locale);
  await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
  await expect(page.getByRole('heading', { level: 1, name: t(locale, 'ui.errorPages.errorTitle') })).toBeVisible();
  await expect(page.getByText(t(locale, 'ui.errorPages.globalBody'))).toBeVisible();
  await expect(page.getByRole('button', { name: t(locale, 'ui.errorPages.retry') })).toBeVisible();
  // Next's digest (the server logged it), not a browser-made `C-` code.
  await expect(page.locator('main code')).toHaveText(/^(?!C-)[0-9A-Za-z@_-]{4,}$/);
  await expect(page).toHaveTitle(t(locale, 'ui.errorPages.errorTitle'));
}

/** The shared error screen with a server digest as its reference code; returns the code. */
export async function expectErrorScreen(page: Page, locale: Language): Promise<string> {
  await expect(page.getByRole('heading', { level: 1, name: t(locale, 'ui.errorPages.errorTitle') })).toBeVisible();
  await expect(page.getByRole('button', { name: t(locale, 'ui.errorPages.retry') })).toBeVisible();
  await expect(page.getByRole('link', { name: t(locale, 'ui.errorPages.backToDashboard') })).toHaveAttribute('href', `/${locale}`);
  await expect(page.getByText(t(locale, 'ui.errorPages.referenceHelp'))).toBeVisible();
  const code = (await page.locator('[data-reference-code]').getAttribute('data-reference-code')) ?? '';
  // Next's digest (the server logged the error under it), not a browser-made `C-` code.
  expect(code).toMatch(/^[0-9A-Za-z@_-]{4,}$/);
  expect(code.startsWith('C-')).toBe(false);
  // Never the error's own text.
  await expect(page.getByText('forced server error')).toHaveCount(0);
  return code;
}
