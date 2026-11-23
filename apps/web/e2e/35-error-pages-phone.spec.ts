import { expect, test } from '@playwright/test';
import {
  expectErrorScreen,
  expectGlobalError,
  expectPageNotFound,
  FORCED_ERROR_PATH,
  MISSING_PATH,
  ROOT_ERROR_PATH,
  watchCsp,
} from './support/error-pages';
import { settleStreams } from './support/stream';
import { expectNoHorizontalScroll, signIn } from './support/ui';

// Every goto waits for the streamed page to settle (see support/stream.ts).
settleStreams();

/**
 * Runs in the `phone-ar` project (390 px, touch): the not-found and error pages in Arabic, right to
 * left, with no sideways scroll and no CSP violation.
 */
const locale = 'ar' as const;

test('Arabic on a phone: a wrong address signed out and signed in, and a server error', async ({ page }) => {
  test.setTimeout(120_000);
  const violations = await watchCsp(page);

  const res = await page.goto(`/${locale}${MISSING_PATH}`);
  expect(res?.status()).toBe(404);
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expectPageNotFound(page, locale, false);
  await expectNoHorizontalScroll(page);

  await page.goto(`/${locale}${ROOT_ERROR_PATH}`);
  await expectGlobalError(page, locale);
  await expectNoHorizontalScroll(page);

  await signIn(page, locale);
  const signedIn = await page.goto(`/${locale}${MISSING_PATH}`);
  expect(signedIn?.status()).toBe(404);
  await expectPageNotFound(page, locale, true);
  await expectNoHorizontalScroll(page);

  await page.goto(`/${locale}${FORCED_ERROR_PATH}`);
  await expectErrorScreen(page, locale);
  await expectNoHorizontalScroll(page);

  expect(violations, 'CSP violations').toEqual([]);
});
