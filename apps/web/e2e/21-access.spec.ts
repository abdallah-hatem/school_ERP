import { expect, test } from '@playwright/test';
import type { Role } from '@school-erp/shared';
import { Api, adminAccount, makeUser, rolesByKey, sidebarLink, signInAs, uniqueEmail } from './support/access';
import { t } from './support/i18n';
import { expectNoHorizontalScroll, settle, shoot, signIn } from './support/ui';

/** Runs in the `desktop-en` project (1440×900). Users, Roles and My account (spec P3, option A). */

test('a new HR officer: created on Add user, forced to set a password, sees no Users / Roles / Activity', async ({
  page,
  browser,
}, info) => {
  const locale = 'en';
  await signIn(page, locale);
  await sidebarLink(page, locale, 'users').click();
  await expect(page).toHaveURL(/\/en\/users$/);
  await page.getByRole('link', { name: t(locale, 'access.users.add') }).first().click();
  await expect(page).toHaveURL(/\/en\/users\/new$/);

  const email = uniqueEmail('officer');
  await page.getByLabel(t(locale, 'access.userForm.name')).fill('Rana Mostafa');
  await page.getByLabel(t(locale, 'access.userForm.email')).fill(email);
  await page.getByRole('group', { name: t(locale, 'access.userForm.roles') }).getByLabel(/HR officer/).check();
  const password = (await page.getByTestId('temp-password').textContent())?.trim() ?? '';
  expect(password.length).toBeGreaterThanOrEqual(10);
  await settle(page);
  await shoot(page, info, `user-add-${locale}-desktop`);
  await page.getByRole('button', { name: t(locale, 'access.userForm.create') }).click();
  await expect(page).toHaveURL(/\/en\/users$/);
  const row = page.getByRole('row', { name: /Rana Mostafa/ });
  await expect(row).toBeVisible();
  await expect(row.getByText(t(locale, 'access.users.mustChange'))).toBeVisible();

  // Signed in with the temporary password → straight to "Set a new password", nothing else.
  const context = await browser.newContext({ locale: 'en-US', viewport: { width: 1440, height: 900 } });
  const officer = await context.newPage();
  await signInAs(officer, locale, email, password);
  await expect(officer).toHaveURL(/\/en\/set-password/);
  await expect(officer.getByRole('heading', { name: t(locale, 'auth.setPassword.title') })).toBeVisible();
  // Any other page sends them back.
  await officer.goto('/en/employees');
  await expect(officer).toHaveURL(/\/en\/set-password\?next=%2Fen%2Femployees/);
  await settle(officer);
  await shoot(officer, info, `set-password-${locale}-desktop`);

  // The temporary one can't be reused.
  await officer.getByRole('textbox', { name: t(locale, 'auth.password.new'), exact: true }).fill(password);
  await officer.getByRole('textbox', { name: t(locale, 'auth.password.confirm'), exact: true }).fill(password);
  await officer.getByRole('button', { name: t(locale, 'auth.setPassword.submit') }).click();
  await expect(officer.getByText(t(locale, 'errors.SAME_PASSWORD'))).toBeVisible();

  const own = 'my-own-strong-password-1';
  await officer.getByRole('textbox', { name: t(locale, 'auth.password.new'), exact: true }).fill(own);
  await officer.getByRole('textbox', { name: t(locale, 'auth.password.confirm'), exact: true }).fill(own);
  await officer.getByRole('button', { name: t(locale, 'auth.setPassword.submit') }).click();
  // On to where they were going.
  await expect(officer).toHaveURL(/\/en\/employees$/);
  await expect(sidebarLink(officer, locale, 'employees')).toBeVisible();
  for (const hidden of ['users', 'roles', 'activity']) await expect(sidebarLink(officer, locale, hidden)).toHaveCount(0);
  // The user chip names their role and opens My account.
  await officer.getByRole('link', { name: /Rana Mostafa/ }).first().click();
  await expect(officer).toHaveURL(/\/en\/account$/);
  await expect(officer.getByRole('heading', { name: t(locale, 'access.account.title') })).toBeVisible();
  await context.close();
});

test('as admin, editing a custom role’s permission applies to its holder on their next click', async ({
  page,
  browser,
}, info) => {
  const locale = 'en';
  const api = await Api.asAdmin();
  const role = await api.post<Role>('/roles', {
    nameEn: `Desk ${Date.now().toString(36)}`,
    nameAr: 'مكتب الاستقبال',
    permissions: [
      { key: 'core.audit.view', scope: 'all' },
      { key: 'hr.employees.view', scope: 'all' },
    ],
  });
  const holder = await makeUser(api, { name: 'Desk Holder', roleIds: [role.id] });
  await api.dispose();

  // The holder chooses their password, then sees Activity.
  const context = await browser.newContext({ locale: 'en-US', viewport: { width: 1440, height: 900 } });
  const them = await context.newPage();
  await signInAs(them, locale, holder.email, holder.password);
  await them.getByRole('textbox', { name: t(locale, 'auth.password.new'), exact: true }).fill('holder-own-password-1');
  await them.getByRole('textbox', { name: t(locale, 'auth.password.confirm'), exact: true }).fill('holder-own-password-1');
  await them.getByRole('button', { name: t(locale, 'auth.setPassword.submit') }).click();
  await expect(sidebarLink(them, locale, 'activity')).toBeVisible();

  // The admin switches "View the activity log" off on the role page.
  await signIn(page, locale);
  await page.goto(`/${locale}/roles/${role.id}`);
  const rowFor = page.locator('[data-permission="core.audit.view"]');
  const save = page.getByRole('button', { name: t(locale, 'access.roleForm.save') });
  await expect(save).toBeDisabled();
  await rowFor.getByRole('switch').click();
  await expect(page.getByText(t(locale, 'access.userForm.unsaved', { count: 1 }))).toBeVisible();
  await expect(save).toBeEnabled();
  await settle(page);
  await shoot(page, info, `role-custom-${locale}-desktop`);
  await save.click();
  await expect(page).toHaveURL(/\/en\/roles$/);

  // No new sign-in: the next page they open has no Activity.
  await them.reload();
  await expect(sidebarLink(them, locale, 'employees')).toBeVisible();
  await expect(sidebarLink(them, locale, 'activity')).toHaveCount(0);
  await context.close();
});

for (const locale of ['en', 'ar'] as const) {
  test(`users, roles and my account screens (${locale}); the last System admin can't be deactivated`, async ({
    page,
  }, info) => {
    const api = await Api.asAdmin();
    const admin = await adminAccount(api);
    const roles = await rolesByKey(api);
    await api.dispose();

    await signIn(page, locale);
    await page.goto(`/${locale}/users`);
    await expect(page.getByRole('heading', { name: t(locale, 'access.users.title'), level: 1 })).toBeVisible();
    await expectNoHorizontalScroll(page);
    // The only System admin's ⋯ has no Deactivate.
    await page.getByRole('button', { name: t(locale, 'ui.table.actionsFor', { name: admin.name }) }).click();
    const menu = page.getByRole('menu');
    await expect(menu.getByRole('menuitem', { name: t(locale, 'access.users.actions.setPassword') })).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: t(locale, 'access.users.actions.deactivate') })).toHaveCount(0);
    await settle(page);
    await shoot(page, info, `users-${locale}-desktop`);
    await page.keyboard.press('Escape');

    // Filters live in the URL: status Inactive → nobody yet.
    await page.goto(`/${locale}/users?status=inactive&search=nobody-matches-this`);
    await expect(page.getByText(t(locale, 'access.users.noResultsTitle'))).toBeVisible();

    // Their page: the role is locked with the reason, Deactivate is disabled with it, Save waits.
    await page.goto(`/${locale}/users/${admin.id}`);
    await expect(page.getByText(t(locale, 'access.userForm.lockedAdmin', { name: admin.name }))).toBeVisible();
    await expect(page.getByRole('button', { name: t(locale, 'access.userForm.deactivateAccount') })).toBeDisabled();
    await expect(page.getByText(t(locale, 'access.users.lastAdmin'))).toBeVisible();
    await expect(page.getByRole('button', { name: t(locale, 'access.userForm.save') })).toBeDisabled();
    await expect(page.getByText(t(locale, 'access.userForm.noChanges'))).toBeVisible();
    await expectNoHorizontalScroll(page);
    await settle(page);
    await shoot(page, info, `user-edit-${locale}-desktop`);

    // The linked-employee picker searches on the server.
    await page.getByRole('combobox', { name: t(locale, 'access.userForm.employeeField') }).click();
    await expect(page.getByRole('listbox', { name: t(locale, 'access.userForm.employeeField') })).toBeVisible();
    await settle(page);
    await shoot(page, info, `user-employee-picker-${locale}-desktop`);
    await page.keyboard.press('Escape');

    await page.goto(`/${locale}/roles`);
    await expect(page.getByRole('heading', { name: t(locale, 'access.roles.title'), level: 1 })).toBeVisible();
    await expectNoHorizontalScroll(page);
    await settle(page);
    await shoot(page, info, `roles-${locale}-desktop`);

    await page.goto(`/${locale}/roles/${roles.get('stage_head')?.id}`);
    await expect(page.locator('[data-permission="hr.employees.view"]').getByRole('radio', { checked: true })).toHaveText(
      t(locale, 'permissions.scopes.own_stage'),
    );
    // A whole-school permission has no scope control.
    await expect(page.locator('[data-permission="hr.payroll.approve"]').getByText(t(locale, 'access.roleForm.wholeSchool'))).toBeVisible();
    await expectNoHorizontalScroll(page);
    await settle(page);
    await shoot(page, info, `role-${locale}-desktop`);

    await page.goto(`/${locale}/roles/${roles.get('system_admin')?.id}`);
    await expect(page.getByText(t(locale, 'access.roleForm.systemAdminTitle'))).toBeVisible();
    await expect(page.getByRole('switch')).toHaveCount(0);
    await expect(page.getByRole('button', { name: t(locale, 'access.roleForm.save') })).toHaveCount(0);
    await settle(page);
    await shoot(page, info, `role-system-admin-${locale}-desktop`);

    await page.goto(`/${locale}/account`);
    await expect(page.getByRole('heading', { name: t(locale, 'access.account.title'), level: 1 })).toBeVisible();
    await expect(page.getByRole('button', { name: t(locale, 'access.account.changePassword') })).toBeDisabled();
    await expectNoHorizontalScroll(page);
    await settle(page);
    await shoot(page, info, `account-${locale}-desktop`);
  });
}
