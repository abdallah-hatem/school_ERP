import { expect, test, type Page } from '@playwright/test';
import { activeEmployee } from './support/profile-tabs';
import { t } from './support/i18n';
import { expectTopInView, recordTabs, scrollToBottom, switchTab } from './support/tab-switch';
import { signIn } from './support/ui';

/*
 * The phone flows of 30-tab-switch: the employee profile's tabs move their marker once with the
 * header mounted, and Settings' list → section → list runs on the client (no server round trip,
 * the address follows, the section list is the same element the whole time).
 * Runs in the `phone-ar` project only (390×844).
 */

/** Server-component requests for Settings itself (the menu's own prefetches don't count). */
function settingsRenders(page: Page): () => string[] {
  const seen: string[] = [];
  page.on('request', (r) => {
    if (r.headers()['rsc'] && new URL(r.url()).pathname.endsWith('/settings')) seen.push(r.url());
  });
  return () => seen;
}

test('employee profile (ar, phone): the tab marker moves once and the header stays mounted', async ({ page }) => {
  const employee = await activeEmployee();
  await signIn(page, 'ar');
  await page.goto(`/ar/employees/${employee.id}`);
  const tabs = page.getByRole('navigation', { name: t('ar', 'employees.profile.tabs') });
  const tab = (key: string) => tabs.getByRole('link', { name: t('ar', key), exact: true });
  await expect(tab('employees.profile.details')).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('#main [aria-busy="true"]')).toHaveCount(0);
  for (const [from, to] of [
    ['employees.profile.details', 'common.nav.penalties'],
    ['common.nav.penalties', 'employees.profile.history'],
    ['employees.profile.history', 'employees.profile.details'],
  ] as const) {
    await recordTabs(page, '#main nav[data-skeleton-block="tabs"]', 'a');
    await switchTab(page, tab(from), tab(to));
  }
});

test('settings (ar, phone): list → section → list stays on the client and the address follows', async ({ page }) => {
  await signIn(page, 'ar');
  await page.goto('/ar/settings');
  const nav = page.getByRole('navigation', { name: t('ar', 'settings.sectionsLabel') });
  await expect(nav).toBeVisible();
  const list = await nav.elementHandle();
  const renders = settingsRenders(page);

  const lists = nav.getByRole('button', { name: new RegExp(t('ar', 'settings.sections.lists.title')) });
  await lists.click();
  await expect(page).toHaveURL(/\/ar\/settings\?section=lists$/);
  await expect(nav).toBeHidden();
  const back = page.getByRole('button', { name: t('ar', 'settings.allSections') });
  await expect(back).toBeVisible();

  await back.click();
  await expect(page).toHaveURL(/\/ar\/settings$/);
  await expect(nav).toBeVisible();
  expect(await list!.evaluate((el) => el.isConnected), 'the section list is never re-mounted').toBe(true);
  expect(renders(), 'no server round trip for a section switch').toEqual([]);
});

test('settings (ar, phone): scrolled down the list, the chosen section opens at its top', async ({ page }) => {
  await signIn(page, 'ar');
  // A short phone, so the section list scrolls.
  await page.setViewportSize({ width: 390, height: 500 });
  await page.goto('/ar/settings');
  const nav = page.getByRole('navigation', { name: t('ar', 'settings.sectionsLabel') });
  await expect(nav).toBeVisible();
  await scrollToBottom(page);
  // The last section, tapped where it is (at the bottom of the scrolled list).
  await nav.getByRole('button', { name: new RegExp(t('ar', 'settings.sections.notifications.title')) }).click();
  await expect(page).toHaveURL(/\?section=notifications$/);
  await expect(page.locator('#main [aria-busy="true"]')).toHaveCount(0);
  const heading = page.locator('#main h2[tabindex]').first();
  await expectTopInView(page.getByRole('button', { name: t('ar', 'settings.allSections') }), 'the chosen section');
  await expect(heading).toBeFocused();
});
