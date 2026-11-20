import { expect, test } from '@playwright/test';
import { Api, adminAccount, makeUser, openPermissionModule, rolesByKey, signInAs } from './support/access';
import { t } from './support/i18n';
import { expectNoHorizontalScroll, settle, shoot, signIn } from './support/ui';

/** Runs in the `phone-ar` project only (390×844, touch). Users, Roles and My account on a phone (P3). */

for (const locale of ['ar', 'en'] as const) {
  test(`access screens on a phone (${locale}): no sideways scroll, every screen shot`, async ({ page, browser }, info) => {
    // Eight full-page phone screenshots (3× pixels) and a second session: more than the default.
    test.setTimeout(240_000);
    const api = await Api.asAdmin();
    const admin = await adminAccount(api);
    const roles = await rolesByKey(api);
    const fresh = await makeUser(api, { name: 'Phone Person', roleIds: [roles.get('hr_officer')?.id ?? ''] });
    await api.dispose();

    await signIn(page, locale);
    const screens: [string, string][] = [
      ['users', `/${locale}/users`],
      ['user-add', `/${locale}/users/new`],
      ['user-edit', `/${locale}/users/${admin.id}`],
      ['roles', `/${locale}/roles`],
      ['role', `/${locale}/roles/${roles.get('direct_manager')?.id}`],
      ['role-system-admin', `/${locale}/roles/${roles.get('system_admin')?.id}`],
      ['account', `/${locale}/account`],
    ];
    for (const [name, path] of screens) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expectNoHorizontalScroll(page);
      await settle(page);
      await shoot(page, info, `${name}-${locale}-phone`);
    }

    // The sticky Save bar stays on screen on a long role page.
    await page.goto(`/${locale}/roles/${roles.get('direct_manager')?.id}`);
    await openPermissionModule(page, locale, 'hr');
    await page.locator('[data-permission="hr.lateness.view"]').getByRole('switch').tap();
    const bar = page.locator('[data-slot="form-action-bar"]');
    await expect(bar).toBeInViewport();
    await expect(bar.getByRole('button', { name: t(locale, 'access.roleForm.save') })).toBeEnabled();

    // The forced "Set a new password" page.
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
    });
    const them = await context.newPage();
    await signInAs(them, locale, fresh.email, fresh.password);
    await expect(them).toHaveURL(new RegExp(`/${locale}/set-password`));
    await expectNoHorizontalScroll(them);
    await settle(them);
    await shoot(them, info, `set-password-${locale}-phone`);
    await context.close();
  });
}
