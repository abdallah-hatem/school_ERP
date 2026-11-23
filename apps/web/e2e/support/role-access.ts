import { expect, type Browser, type Page } from '@playwright/test';
import {
  BUILT_IN_ROLES,
  actsOnPay,
  PayrollStatus,
  PermissionScope,
  SCREENS,
  type BuiltInRole,
  type Employee,
  type EmployeeOption,
  type EmployeeSummary,
  type Language,
  type PayrollRun,
  type PayrollRunSummary,
  type PermissionKey,
  type ScreenId,
  type UserAccount,
} from '@school-erp/shared';
import { Api, rolesByKey, signInAs, uniqueEmail } from './access';
import { t } from './i18n';

/*
 * The role-access smoke (24-role-access): a user holding exactly one built-in role, the records
 * the screens with an id open (each inside that role's scope), and a signed-in browser for them.
 * What each role may open comes from `SCREENS` + `BUILT_IN_ROLES` (@school-erp/shared), never from
 * a list kept here.
 */

const PAGE = 100;

async function allPages<T>(api: Api, path: string): Promise<T[]> {
  const out: T[] = [];
  for (let page = 1; ; page++) {
    const rows = await api.get<T[]>(path, { page, limit: PAGE });
    out.push(...rows);
    if (rows.length < PAGE) return out;
  }
}

/** The ids a screen's path needs (`:id`, `:lineId`, `:month`), or null when the database has no such record. */
export type ScreenUrls = Partial<Record<ScreenId, string>>;

export interface RoleUser {
  role: BuiltInRole;
  email: string;
  password: string;
  /** The keys the role grants (BUILT_IN_ROLES — what it is meant to hold). */
  keys: string[];
  /** A URL for each screen; a screen whose record the database lacks is left out (and noted). */
  urls: ScreenUrls;
}

const definition = (role: BuiltInRole) => {
  const found = BUILT_IN_ROLES.find((r) => r.key === role);
  if (!found) throw new Error(`smoke: no built-in role ${role}`);
  return found;
};

/** Whether the role grants any key with this scope (it then needs a linked employee). */
const needs = (role: BuiltInRole, scope: string) => Object.values(definition(role).permissions).includes(scope as never);

/**
 * Makes a user holding only `role` through the API. A role scoped to a stage is linked to an
 * employee nobody holds yet (their own profile is the record); one scoped to a team is linked to a
 * manager nobody holds yet (one of their team is the record). Read as the admin, so it checks what
 * it meets, not a remembered seed.
 */
export async function makeRoleUser(role: BuiltInRole): Promise<RoleUser> {
  const api = await Api.asAdmin();
  try {
    const roles = await rolesByKey(api);
    const everyone = await allPages<EmployeeSummary>(api, '/hr/employees');
    const options = await allPages<EmployeeOption>(api, '/users/employee-options');
    const linked = new Set(options.filter((o) => o.linkedUser).map((o) => o.id));

    let employeeId: string | undefined;
    let record: EmployeeSummary | undefined = everyone[0];
    if (needs(role, PermissionScope.OWN_TEAM)) {
      // Someone whose direct manager has no account yet: the manager is the user, they the record.
      for (const e of everyone) {
        const full = await api.get<Employee>(`/hr/employees/${e.id}`);
        if (full.manager && !linked.has(full.manager.id)) {
          employeeId = full.manager.id;
          record = e;
          break;
        }
      }
      if (!employeeId) throw new Error('smoke: the seed needs an employee whose manager has no account');
    } else if (needs(role, PermissionScope.OWN_STAGE) || needs(role, PermissionScope.SELF)) {
      record = everyone.find((e) => !linked.has(e.id));
      if (!record) throw new Error('smoke: every employee already has an account');
      employeeId = record.id;
    } else if (actsOnPay(Object.keys(definition(role).permissions).map((key) => ({ key: key as PermissionKey })))) {
      // Acting on pay or penalties needs the account linked to its employee record (§6, owner
      // 2026-11-23). The last unlinked one: specs record penalties for the first employees.
      const own = [...everyone].reverse().find((e) => !linked.has(e.id));
      if (!own) throw new Error('smoke: every employee already has an account');
      employeeId = own.id;
    }
    if (!record) throw new Error('smoke: no employees');

    const runs = await api.get<PayrollRunSummary[]>('/hr/payroll-runs', { limit: PAGE });
    const run = runs.find((r) => r.status === PayrollStatus.APPROVED) ?? runs[0];
    const full = run ? await api.get<PayrollRun>(`/hr/payroll-runs/${run.id}`) : undefined;
    const line = full?.status === PayrollStatus.APPROVED ? full.lines[0] : undefined;
    const admin = (await api.get<UserAccount[]>('/users', { limit: 1 }))[0];
    const anyRole = roles.get(role);
    if (!anyRole || !admin) throw new Error('smoke: roles or users missing');

    const ids: Record<string, string | undefined> = {
      employee: record.id,
      run: run?.id,
      line: line?.id,
      user: admin.id,
      role: anyRole.id,
      // A month HR approved: it has payroll taxes (§10) to open.
      month: run?.status === PayrollStatus.APPROVED ? run.month : undefined,
    };
    const urls: ScreenUrls = {};
    for (const [id, screen] of Object.entries(SCREENS) as [ScreenId, { path: string }][]) {
      const idFor = id.startsWith('employee')
        ? ids.employee
        : (id.startsWith('payroll') && !id.startsWith('payrollTaxes')) || id === 'payslip'
          ? ids.run
          : id === 'user'
            ? ids.user
            : id === 'role'
              ? ids.role
              : undefined;
      if (screen.path.includes(':id') && !idFor) continue;
      if (screen.path.includes(':lineId') && !ids.line) continue;
      if (screen.path.includes(':month') && !ids.month) continue;
      urls[id] = screen.path
        .replace(':id', idFor ?? '')
        .replace(':lineId', ids.line ?? '')
        .replace(':month', ids.month ?? '');
    }

    const password = `Temp-${Date.now()}-${role}`;
    const user = await api.post<UserAccount>('/users', {
      name: `Smoke ${definition(role).nameEn}`,
      email: uniqueEmail(`p24-${role.replace('_', '-')}`),
      password,
      roleIds: [anyRole.id],
      ...(employeeId ? { employeeId } : {}),
    });
    return { role, email: user.email, password, keys: Object.keys(definition(role).permissions), urls };
  } finally {
    await api.dispose();
  }
}

/** A fresh browser session signed in as `user`, past the forced "Set a new password". */
export async function signInAsRoleUser(
  browser: Browser,
  user: RoleUser,
  locale: Language,
  viewport: { width: number; height: number },
): Promise<Page> {
  const context = await browser.newContext({ locale: locale === 'ar' ? 'ar-EG' : 'en-US', viewport });
  const page = await context.newPage();
  await signInAs(page, locale, user.email, user.password);
  await expect(page).toHaveURL(/\/set-password/);
  const own = `own-${user.role}-password-1`;
  await page.getByRole('textbox', { name: t(locale, 'auth.password.new'), exact: true }).fill(own);
  await page.getByRole('textbox', { name: t(locale, 'auth.password.confirm'), exact: true }).fill(own);
  await page.getByRole('button', { name: t(locale, 'auth.setPassword.submit') }).click();
  await expect(page).not.toHaveURL(/set-password/);
  user.password = own;
  return page;
}

/** Waits for the page inside the shell to finish streaming (no skeleton left). */
export async function settled(page: Page): Promise<void> {
  await expect(page.locator('main [aria-busy="true"]')).toHaveCount(0);
}
