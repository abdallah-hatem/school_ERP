import { expect, test } from '@playwright/test';
import {
  expectErrorScreen,
  expectGlobalError,
  expectPageNotFound,
  FORCED_ERROR_PATH,
  MISSING_PATH,
  ROOT_ERROR_PATH,
  UNKNOWN_EMPLOYEE_ID,
  watchCsp,
} from './support/error-pages';
import { t } from './support/i18n';
import { settleStreams } from './support/stream';
import { signIn } from './support/ui';

// Every goto waits for the streamed page to settle (see support/stream.ts).
settleStreams();

/**
 * Runs in the `desktop-en` project. The not-found and error pages (design/mockups/error-pages.html,
 * option 2): a wrong address signed out and signed in (404 status, the right way out), one outside
 * `/<locale>`, the in-shell not-found, a forced server error (the smoke-only `page.e2e.tsx`)
 * showing Next's digest, and the standalone whole-app error — all under the CSP with no violation.
 */
const locale = 'en' as const;

test('a wrong address signed out: 404, "Page not found" and Sign in', async ({ page }) => {
  const violations = await watchCsp(page);

  const res = await page.goto(`/${locale}${MISSING_PATH}`);
  expect(res?.status()).toBe(404);
  expect(page.url()).toMatch(new RegExp(`/${locale}${MISSING_PATH}$`)); // not sent to sign in
  await expectPageNotFound(page, locale, false);

  // An address without a language lands on the same page, in the default language.
  const bare = await page.goto(MISSING_PATH);
  expect(bare?.status()).toBe(404);
  expect(new URL(page.url()).pathname).toBe(`/en${MISSING_PATH}`);
  await expectPageNotFound(page, 'en', false);

  // Sign in leads to the sign-in page.
  await page.getByRole('link', { name: t(locale, 'ui.errorPages.signIn') }).click();
  await expect(page).toHaveURL(new RegExp(`/${locale}/login$`));

  // The whole app failing (the root error screen): standalone, under the same CSP, and its retry
  // reloads the page.
  const failed = await page.goto(`/${locale}${ROOT_ERROR_PATH}`);
  expect(failed?.status()).toBe(500);
  await expectGlobalError(page, locale);
  const reload = page.waitForEvent('load');
  await page.getByRole('button', { name: t(locale, 'ui.errorPages.retry') }).click();
  await reload;
  await expectGlobalError(page, locale);

  expect(violations, 'CSP violations').toEqual([]);
});

test('signed in: a wrong address, a missing record and a server error', async ({ page, context }) => {
  test.setTimeout(120_000);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const violations = await watchCsp(page);
  await signIn(page, locale);

  // A wrong address: outside the shell, Back to the dashboard.
  const res = await page.goto(`/${locale}${MISSING_PATH}`);
  expect(res?.status()).toBe(404);
  await expectPageNotFound(page, locale, true);
  await page.getByRole('link', { name: t(locale, 'ui.errorPages.backToDashboard') }).click();
  await expect(page).toHaveURL(new RegExp(`/${locale}$`));

  // A missing record: inside the shell, the same words as for a forbidden one.
  await page.goto(`/${locale}/employees/${UNKNOWN_EMPLOYEE_ID}`);
  const main = page.locator('#main');
  await expect(main.getByRole('heading', { level: 1, name: t(locale, 'ui.states.notFoundTitle') })).toBeVisible();
  await expect(main.getByText(t(locale, 'ui.states.notFoundBody'))).toBeVisible();
  await expect(main.getByRole('link', { name: t(locale, 'ui.errorPages.backToDashboard') })).toHaveAttribute('href', `/${locale}`);

  // A server error: inside the shell, the digest as the reference code, Copy copies it.
  await page.goto(`/${locale}${FORCED_ERROR_PATH}`);
  const code = await expectErrorScreen(page, locale);
  await expect(page.locator('#main')).toBeVisible();
  await page.getByRole('button', { name: t(locale, 'ui.errorPages.copyLabel') }).click();
  await expect(page.getByText(t(locale, 'ui.errorPages.copied'))).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(code);

  // Try again re-renders (it fails again here, and stays on the error screen).
  await page.getByRole('button', { name: t(locale, 'ui.errorPages.retry') }).click();
  await expect(page.getByRole('heading', { level: 1, name: t(locale, 'ui.errorPages.errorTitle') })).toBeVisible();

  expect(violations, 'CSP violations').toEqual([]);
});
