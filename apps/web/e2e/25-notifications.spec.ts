import { expect, test, type Page } from '@playwright/test';
import type { NotificationPreferences, NotificationSettings } from '@school-erp/shared';
import { Api } from './support/access';
import { t } from './support/i18n';
import { makeRoleUser, settled, signInAsRoleUser } from './support/role-access';
import { settle, shoot, signIn } from './support/ui';

/**
 * Runs in the `desktop-en` project (1440×900). Notifications, option A (§11, N4): the bell beside the
 * language switch and its list, My account → Notifications and Settings → Notifications. In-app
 * only: no other channel appears anywhere. The specs before this one may have left notifications
 * (penalties recorded in 03), so the list is checked for either rows or the empty state.
 */

const locale = 'en' as const;
const bell = (page: Page) => page.getByTestId('notification-bell').filter({ visible: true });
const firstSwitch = (page: Page, name: string) => page.getByRole('switch', { name, exact: true }).filter({ visible: true });

test('the bell opens the list over the page; Esc closes it and focus returns to the bell', async ({ page }, info) => {
  await signIn(page, locale);
  await settled(page);
  const languageSwitch = page.getByRole('group', { name: t(locale, 'ui.shell.language') }).filter({ visible: true });
  // Beside the language switch, before it.
  const [bellBox, switchBox] = await Promise.all([bell(page).boundingBox(), languageSwitch.boundingBox()]);
  expect(bellBox && switchBox && bellBox.x < switchBox.x).toBe(true);
  const before = await page.locator('main').boundingBox();

  await bell(page).click();
  const list = page.getByRole('dialog', { name: t(locale, 'notifications.title') });
  await expect(list).toBeVisible();
  await expect(list.getByRole('tab', { name: t(locale, 'notifications.screen.tabs.all') })).toHaveAttribute('aria-selected', 'true');
  await expect(
    list.getByTestId('notification-row').first().or(list.getByText(t(locale, 'notifications.screen.empty.title'))),
  ).toBeVisible();
  // Opening it doesn't move the page.
  expect(await page.locator('main').boundingBox()).toEqual(before);
  await expect(list).not.toContainText(/email|whatsapp|sms/i);
  await settle(page);
  await shoot(page, info, 'notifications-bell-en-desktop');

  await page.keyboard.press('Escape');
  await expect(list).toBeHidden();
  await expect(bell(page)).toBeFocused();
  // Enter opens it again from the keyboard; its footer leads to My account → Notifications.
  await page.keyboard.press('Enter');
  await expect(list).toBeVisible();
  await list.getByRole('link', { name: t(locale, 'notifications.screen.settingsLink') }).click();
  await expect(page).toHaveURL(/\/en\/account\/notifications$/);
  await expect(list).toBeHidden();
});

test('My account → Notifications: one switch per type, required ones locked; a change saves and can be reset', async ({ page }, info) => {
  const api = await Api.asAdmin();
  // Start from the school's default for the switch this test moves.
  await api.put('/notifications/preferences', { items: [{ type: 'hr.contract.ending_soon', channel: 'in_app', enabled: null }] });
  await signIn(page, locale);
  await page.goto(`/${locale}/account/notifications`);
  await settled(page);
  await expect(page.getByRole('link', { name: t(locale, 'access.account.tabs.notifications') })).toHaveAttribute('aria-current', 'page');

  const required = firstSwitch(page, t(locale, 'notifications.types.hr.penalty.awaiting_approval.name'));
  await expect(required).toBeChecked();
  await expect(required).toBeDisabled();
  await expect(page.locator('main')).not.toContainText(/email|whatsapp|sms/i);

  const contract = firstSwitch(page, t(locale, 'notifications.types.hr.contract.ending_soon.name'));
  await expect(contract).toBeChecked();
  await contract.click();
  await expect(contract).not.toBeChecked();
  await expect(page.getByText(t(locale, 'notifications.preferences.changed')).filter({ visible: true })).toBeVisible();
  await expect
    .poll(async () => {
      const prefs = await api.get<NotificationPreferences>('/notifications/preferences');
      return prefs.types.find((x) => x.type === 'hr.contract.ending_soon')?.channels[0]?.personal;
    })
    .toBe(false);
  await settle(page);
  await shoot(page, info, 'notifications-my-account-en-desktop');

  // Kept after a reload, then back to the school's default.
  await page.reload();
  await settled(page);
  await expect(contract).not.toBeChecked();
  await page.getByRole('button', { name: t(locale, 'notifications.preferences.reset') }).filter({ visible: true }).click();
  await expect(contract).toBeChecked();
  await expect(page.getByText(t(locale, 'notifications.preferences.changed')).filter({ visible: true })).toHaveCount(0);
  await api.dispose();
});

test('Settings → Notifications: the System admin changes a default; the HR manager sees it read-only', async ({ page, browser }, info) => {
  test.setTimeout(180_000);
  const api = await Api.asAdmin();
  await signIn(page, locale);
  await page.goto(`/${locale}/settings?section=notifications`);
  await settled(page);
  const menu = page.getByRole('navigation', { name: t(locale, 'settings.sectionsLabel') });
  await expect(menu.getByRole('button', { name: new RegExp(t(locale, 'settings.sections.notifications.title')) })).toHaveAttribute(
    'aria-current',
    'page',
  );
  const save = page.getByRole('button', { name: t(locale, 'common.actions.save') });
  await expect(save).toBeDisabled();
  await expect(firstSwitch(page, t(locale, 'notifications.types.hr.payroll.ready_to_approve.name'))).toBeDisabled();

  const probation = firstSwitch(page, t(locale, 'notifications.types.hr.probation.ending_soon.name'));
  const wasOn = await probation.isChecked();
  await probation.click();
  await expect(save).toBeEnabled();
  await save.click();
  await expect(page.getByText(t(locale, 'settings.save.saved'))).toBeVisible();
  const saved = await api.get<NotificationSettings>('/settings/notifications');
  expect(saved.defaults.find((d) => d.type === 'hr.probation.ending_soon')?.enabled).toBe(!wasOn);
  await settle(page);
  await shoot(page, info, 'notifications-settings-admin-en-desktop');
  // Put it back for the specs after this one.
  await api.put('/settings/notifications', { defaults: [{ type: 'hr.probation.ending_soon', channel: 'in_app', enabled: wasOn }] });
  await api.dispose();

  const hr = await makeRoleUser('hr_manager');
  const hrPage = await signInAsRoleUser(browser, hr, locale, { width: 1440, height: 900 });
  await hrPage.goto(`/${locale}/settings?section=notifications`);
  await settled(hrPage);
  await expect(hrPage.getByText(t(locale, 'notifications.settings.readOnly')).first()).toBeVisible();
  await expect(firstSwitch(hrPage, t(locale, 'notifications.types.hr.contract.ending_soon.name'))).toBeDisabled();
  await expect(hrPage.getByRole('textbox', { name: new RegExp(t(locale, 'notifications.settings.retention.readDays')) })).toBeDisabled();
  await settle(hrPage);
  await shoot(hrPage, info, 'notifications-settings-hr-manager-en-desktop');
  await hrPage.context().close();
});
