import { expect, type Locator, type Page, type TestInfo } from '@playwright/test';
import { SEED_ADMIN_EMAIL, type Language } from '@school-erp/shared';
import { join } from 'node:path';
import { env } from './env';
import { t } from './i18n';

/** Signs in through the login page as the seeded HR admin and waits for the dashboard. */
export async function signIn(page: Page, locale: Language): Promise<void> {
  await page.goto(`/${locale}/login`);
  await page.getByLabel(t(locale, 'auth.login.email')).fill(SEED_ADMIN_EMAIL);
  await page.getByLabel(t(locale, 'auth.login.password')).fill(env.adminPassword);
  await page.getByRole('button', { name: t(locale, 'auth.login.submit') }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

const SCREENSHOTS_DIR = join(__dirname, '..', 'screenshots');

/** A full-page screenshot for the build log: `e2e/screenshots/<project>/<name>.png` (git-ignored). */
export async function shoot(page: Page, info: TestInfo, name: string): Promise<void> {
  await page.screenshot({
    path: join(SCREENSHOTS_DIR, info.project.name, `${name}.png`),
    fullPage: true,
  });
}

/** The page never scrolls sideways (phone layouts). */
export async function expectNoHorizontalScroll(page: Page): Promise<void> {
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth))
    .toBe(0);
}

/** A search field by its accessible name, whether it is drawn as `type="search"` or a plain input. */
export function searchField(page: Page, name: string): Locator {
  return page.getByRole('searchbox', { name, exact: true }).or(page.getByRole('textbox', { name, exact: true }));
}
