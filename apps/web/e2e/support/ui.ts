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

/** Lets open animations finish, so a screenshot shows the settled popover or menu. */
export async function settle(page: Page): Promise<void> {
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'));
}

/** A search field by its accessible name, whether it is drawn as `type="search"` or a plain input. */
export function searchField(page: Page, name: string): Locator {
  return page.getByRole('searchbox', { name, exact: true }).or(page.getByRole('textbox', { name, exact: true }));
}

/**
 * Each control is at least 44 × 44px to a finger: its own box, or the invisible hit area the
 * `tap-target` utility draws around it (an absolutely placed ::after).
 */
export async function expectTapTargets(controls: Locator): Promise<void> {
  const sizes = await controls.evaluateAll((els) =>
    els.map((el) => {
      const box = el.getBoundingClientRect();
      const after = getComputedStyle(el, '::after');
      const hit = after.content !== 'none' && after.position === 'absolute';
      const width = hit ? Math.max(box.width, parseFloat(after.width) || 0) : box.width;
      const height = hit ? Math.max(box.height, parseFloat(after.height) || 0) : box.height;
      const name = el.getAttribute('aria-label') ?? el.textContent?.trim() ?? el.tagName;
      return { name, width: Math.round(width), height: Math.round(height) };
    }),
  );
  expect(sizes.length).toBeGreaterThan(0);
  expect(sizes.filter((s) => s.width < 44 || s.height < 44)).toEqual([]);
}

