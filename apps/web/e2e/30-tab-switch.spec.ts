import { expect, test, type Page } from '@playwright/test';
import { activeEmployee } from './support/profile-tabs';
import { t } from './support/i18n';
import { expectTopInView, recordTabs, scrollToBottom, switchTab } from './support/tab-switch';
import { signIn } from './support/ui';

/*
 * Switching a tab moves its marker once, from the old tab straight to the clicked one — never back
 * to the old one, never two at once — and the page header stays the same node (support/tab-switch).
 * Settings switches section on the client: no server round trip, the address follows, and a deep
 * link, a reload and the browser's back button all land on the section in the address.
 * Runs in the `desktop-en` project (1440×900); the phone file walks the phone flows.
 */

/**
 * The server-component requests (Next's `RSC` header) for Settings itself from now on — the menu's
 * links prefetch their own pages meanwhile, which is fine.
 */
function settingsRenders(page: Page): () => string[] {
  const seen: string[] = [];
  page.on('request', (r) => {
    if (r.headers()['rsc'] && new URL(r.url()).pathname.endsWith('/settings')) seen.push(r.url());
  });
  return () => seen;
}

for (const locale of ['en', 'ar'] as const) {
  test(`settings (${locale}): the section marker moves once, on the client, and the address follows`, async ({ page }) => {
    await signIn(page, locale);
    await page.goto(`/${locale}/settings?section=lists`);
    const nav = page.getByRole('navigation', { name: t(locale, 'settings.sectionsLabel') });
    const section = (key: string) => nav.getByRole('button', { name: t(locale, `settings.sections.${key}.title`), exact: true });
    await expect(section('lists')).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('#main [aria-busy="true"]')).toHaveCount(0);
    const renders = settingsRenders(page);

    const steps = [
      ['lists', 'hrRules'],
      ['hrRules', 'catalogue'],
      ['catalogue', 'school'],
      ['school', 'lists'],
    ] as const;
    for (const [from, to] of steps) {
      await recordTabs(page, '#main nav', 'button');
      await switchTab(page, section(from), section(to));
      await expect(page).toHaveURL(new RegExp(`/${locale}/settings\\?section=${to}$`));
    }
    expect(renders(), 'a section switch never re-renders the server page').toEqual([]);

    // Scrolled to the bottom of a long section, the next one opens at its top, its heading focused.
    await section('hrRules').click();
    await expect(page.locator('#main [aria-busy="true"]')).toHaveCount(0);
    await scrollToBottom(page);
    await section('notifications').click();
    await expect(section('notifications')).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('#main [aria-busy="true"]')).toHaveCount(0);
    const heading = page.locator('#main h2[tabindex]').first();
    await expectTopInView(heading, 'the new section');
    await expect(heading).toBeFocused();

    // The address is the truth: a reload, and back from another page, open the section it names.
    await page.reload();
    await expect(section('notifications')).toHaveAttribute('aria-current', 'page');
    await section('hrRules').click();
    await expect(page).toHaveURL(/\?section=hrRules$/);
    await page.goto(`/${locale}/employees`);
    await page.goBack();
    await expect(page).toHaveURL(/\?section=hrRules$/);
    await expect(section('hrRules')).toHaveAttribute('aria-current', 'page');
    await expect(nav.locator('[aria-current="page"]')).toHaveCount(1);
  });
}

test('employee profile: the tab marker moves once and the header stays mounted', async ({ page }) => {
  const employee = await activeEmployee();
  await signIn(page, 'en');
  await page.goto(`/en/employees/${employee.id}`);
  const tabs = page.getByRole('navigation', { name: t('en', 'employees.profile.tabs') });
  const tab = (label: string) => tabs.getByRole('link', { name: label, exact: true });
  const [details, penalties, payroll, history] = [
    t('en', 'employees.profile.details'),
    t('en', 'common.nav.penalties'),
    t('en', 'common.nav.payroll'),
    t('en', 'employees.profile.history'),
  ];
  await expect(tab(details)).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('#main [aria-busy="true"]')).toHaveCount(0);
  for (const [from, to] of [
    [details, penalties],
    [penalties, payroll],
    [payroll, history],
    [history, details],
  ] as const) {
    await recordTabs(page, '#main nav[data-skeleton-block="tabs"]', 'a');
    await switchTab(page, tab(from), tab(to));
  }

  // Scrolled to the bottom of Details, a tab picked from the keyboard (no pointer scroll on the
  // way) shows the tab bar and the new tab from its top; the header stays.
  await scrollToBottom(page);
  await tab(history).evaluate((el: HTMLElement) => el.click());
  await expect(tab(history)).toHaveAttribute('aria-current', 'page');
  await expectTopInView(tabs, 'the tab bar and the new tab');
});

test('my account: Profile ↔ Notifications keeps the header, the marker moves once', async ({ page }) => {
  await signIn(page, 'en');
  await page.goto('/en/account');
  const tabs = page.getByRole('navigation', { name: t('en', 'access.account.tabs.label') });
  const profile = tabs.getByRole('link', { name: t('en', 'access.account.tabs.profile') });
  const notifications = tabs.getByRole('link', { name: t('en', 'access.account.tabs.notifications') });
  await expect(profile).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('#main [aria-busy="true"]')).toHaveCount(0);
  await recordTabs(page, '#main nav[data-skeleton-block="tabs"]', 'a');
  await switchTab(page, profile, notifications);
  await expect(page.getByText(t('en', 'access.account.notificationsDescription'))).toBeVisible();
  await recordTabs(page, '#main nav[data-skeleton-block="tabs"]', 'a');
  await switchTab(page, notifications, profile);
  await expect(page.getByText(t('en', 'access.account.description'))).toBeVisible();
});
