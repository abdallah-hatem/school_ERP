import { expect, test, type Page } from '@playwright/test';
import { t } from './support/i18n';
import { settled } from './support/role-access';
import { expectNoHorizontalScroll, settle, shoot, signIn } from './support/ui';

/**
 * Runs in the `phone-ar` project only (390×844, touch). On a phone the bell in the top bar opens
 * the list as a full-screen sheet with ✕ and "Mark all read" in its header (option A); My account →
 * Notifications and Settings → Notifications are one card per type. Arabic, then English.
 */

const bell = (page: Page) => page.getByTestId('notification-bell').filter({ visible: true });

for (const locale of ['ar', 'en'] as const) {
  test(`notifications on a phone (${locale}): the sheet, My account → Notifications, Settings → Notifications`, async ({ page }, info) => {
    test.setTimeout(180_000);
    await signIn(page, locale);
    await settled(page);
    // In the top bar, beside the language switch.
    await expect(page.locator('[data-app-topbar]').getByTestId('notification-bell')).toBeVisible();

    await bell(page).tap();
    const sheet = page.getByRole('dialog', { name: t(locale, 'notifications.title') });
    await expect(sheet).toBeVisible();
    // The whole screen.
    const box = await sheet.boundingBox();
    expect(box && Math.round(box.width) === 390 && box.x === 0).toBe(true);
    await expect(sheet.getByRole('button', { name: t(locale, 'notifications.screen.markAllReadShort') })).toBeVisible();
    await expect(
      sheet.getByTestId('notification-row').first().or(sheet.getByText(t(locale, 'notifications.screen.empty.title'))),
    ).toBeVisible();
    await settle(page);
    await shoot(page, info, `notifications-sheet-${locale}-phone`);
    await sheet.getByRole('button', { name: t(locale, 'notifications.screen.close') }).tap();
    await expect(sheet).toBeHidden();

    await page.goto(`/${locale}/account/notifications`);
    await settled(page);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const required = page
      .getByRole('switch', { name: t(locale, 'notifications.types.hr.penalty.awaiting_approval.name'), exact: true })
      .filter({ visible: true });
    await expect(required).toBeDisabled();
    await expectNoHorizontalScroll(page);
    await settle(page);
    await shoot(page, info, `notifications-my-account-${locale}-phone`);

    await page.goto(`/${locale}/settings?section=notifications`);
    await settled(page);
    await expect(page.getByText(t(locale, 'notifications.settings.defaults.title'))).toBeVisible();
    await expectNoHorizontalScroll(page);
    await settle(page);
    await shoot(page, info, `notifications-settings-${locale}-phone`);
  });
}
