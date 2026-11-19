import { expect, type Page } from '@playwright/test';
import type { Language, PermissionModule, Role, UserAccount } from '@school-erp/shared';
import { Api } from './api';
import { t } from './i18n';

/*
 * Users, Roles and My account (spec roles-permissions, P3): signing in as someone other than the
 * seeded admin, and the accounts and roles the specs set up through the API.
 */

let counter = 0;
/** An email no other run or spec has used. */
export function uniqueEmail(prefix: string): string {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}-${counter}@smoke.test`;
}

/** A module's fold button on a role page (its header: name and "n of total"). */
export function permissionModule(page: Page, locale: Language, module: PermissionModule) {
  const name = t(locale, `permissions.modules.${module}`).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Inside the Permissions card: the sidebar has an "HR" group button too.
  return page
    .getByRole('region', { name: t(locale, 'access.roleForm.permissions'), exact: true })
    .getByRole('button', { name: new RegExp(`^${name}`) });
}

/** Opens a module on a role page — they start closed — and waits for its permissions. */
export async function openPermissionModule(page: Page, locale: Language, module: PermissionModule): Promise<void> {
  const button = permissionModule(page, locale, module);
  await expect(button).toHaveAttribute('aria-expanded', 'false');
  await button.click();
  await expect(button).toHaveAttribute('aria-expanded', 'true');
}

/** Signs in through the login page as anyone; does not wait for where it lands. */
export async function signInAs(page: Page, locale: Language, email: string, password: string): Promise<void> {
  await page.goto(`/${locale}/login`);
  await page.getByLabel(t(locale, 'auth.login.email')).fill(email);
  await page.getByLabel(t(locale, 'auth.login.password')).fill(password);
  await page.getByRole('button', { name: t(locale, 'auth.login.submit') }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

export async function rolesByKey(api: Api): Promise<Map<string, Role>> {
  const roles = await api.get<Role[]>('/roles', { limit: 100 });
  return new Map(roles.map((r) => [r.key, r]));
}

/** A user made through the API with a temporary password (they must choose their own). */
export async function makeUser(
  api: Api,
  opts: { name: string; roleIds: string[]; password?: string },
): Promise<UserAccount & { password: string }> {
  const password = opts.password ?? `Temp-${Date.now()}-Pass`;
  const user = await api.post<UserAccount>('/users', {
    name: opts.name,
    email: uniqueEmail('p3'),
    password,
    roleIds: opts.roleIds,
  });
  return { ...user, password };
}

/** The sidebar's links (by accessible name). */
export function sidebarLink(page: Page, locale: Language, key: string) {
  return page.getByRole('navigation').getByRole('link', { name: t(locale, `common.nav.${key}`), exact: true });
}

/** The seeded admin's account (the only System admin in a fresh smoke database). */
export async function adminAccount(api: Api): Promise<UserAccount> {
  const roles = await rolesByKey(api);
  const admins = await api.get<UserAccount[]>('/users', { roleId: roles.get('system_admin')?.id, status: 'active' });
  const admin = admins.find((u) => u.email === 'admin@school.local') ?? admins[0];
  if (!admin) throw new Error('smoke: no System admin');
  return admin;
}

export { Api };
