import { expect, type Browser, type Locator, type Page } from '@playwright/test';
import type { EmployeeOption, EmployeeSummary, Language, UserAccount } from '@school-erp/shared';
import { Api, rolesByKey, signInAs, uniqueEmail } from './access';
import { t } from './i18n';

/*
 * P4 (roles-permissions R5–R7): a Stage head linked to a seeded employee, and the employees in
 * and outside their stage, read as the admin so the spec checks what it meets, not a remembered seed.
 */

export interface StageHeadSetup {
  user: UserAccount & { password: string };
  /** Their linked employee. */
  own: EmployeeSummary;
  /** Every employee of their stage (any status), and one of another stage. */
  inStage: EmployeeSummary[];
  outside: EmployeeSummary;
  /** Set once the first sign-in replaced the temporary password (`user.password` is then theirs). */
  passwordChosen?: boolean;
}

const PAGE = 100;

async function allPages<T>(api: Api, path: string): Promise<T[]> {
  const out: T[] = [];
  for (let page = 1; ; page++) {
    const rows = await api.get<T[]>(path, { page, limit: PAGE });
    out.push(...rows);
    if (rows.length < PAGE) return out;
  }
}

export async function makeStageHead(): Promise<StageHeadSetup> {
  const api = await Api.asAdmin();
  // Every employee and every picker option, page by page (the API serves at most 100 a page, and
  // the seed plus earlier specs hold more).
  const everyone = await allPages<EmployeeSummary>(api, '/hr/employees');
  // An employee has at most one account: each run (and each spec) links a Stage head to one nobody
  // holds yet.
  const options = await allPages<EmployeeOption>(api, '/users/employee-options');
  const linked = new Set(options.filter((o) => o.linkedUser).map((o) => o.id));
  // A stage with an unlinked employee in it and someone outside it.
  const own = everyone.find((e) => !linked.has(e.id) && everyone.some((o) => o.stage.id !== e.stage.id));
  if (!own) throw new Error('smoke: the seed needs employees in two stages');
  const inStage = everyone.filter((e) => e.stage.id === own.stage.id);
  const outside = everyone.find((e) => e.stage.id !== own.stage.id)!;
  const roles = await rolesByKey(api);
  const password = `Temp-${Date.now()}-Head`;
  const user = await api.post<UserAccount>('/users', {
    name: 'Stage Head',
    email: uniqueEmail('p4-head'),
    password,
    roleIds: [roles.get('stage_head')?.id ?? ''],
    employeeId: own.id,
  });
  await api.dispose();
  return { user: { ...user, password }, own, inStage, outside };
}

/** A fresh browser session signed in as `setup.user`, past "Set a new password". */
export async function signInAsStageHead(
  browser: Browser,
  setup: StageHeadSetup,
  locale: Language,
  viewport: { width: number; height: number },
  own: string,
): Promise<Page> {
  const context = await browser.newContext({ locale: locale === 'ar' ? 'ar-EG' : 'en-US', viewport });
  const page = await context.newPage();
  await signInAs(page, locale, setup.user.email, setup.user.password);
  // The first sign-in uses the temporary password and must choose one; later ones use that one.
  if (!setup.passwordChosen) {
    await page.getByRole('textbox', { name: t(locale, 'auth.password.new'), exact: true }).fill(own);
    await page.getByRole('textbox', { name: t(locale, 'auth.password.confirm'), exact: true }).fill(own);
    await page.getByRole('button', { name: t(locale, 'auth.setPassword.submit') }).click();
    await expect(page).not.toHaveURL(/set-password/);
    setup.user.password = own;
    setup.passwordChosen = true;
  }
  return page;
}

/**
 * The basic salary's label in the profile's Pay and contract card — one element (exact text, inside
 * that card). The label's words also appear elsewhere on the page (hints, other labels), so a bare
 * `getByText` matches several.
 */
export function salaryInContract(page: Page, locale: Language): Locator {
  return page
    // The card itself (its own <h2>), never a section that merely contains it.
    .locator('section:has(> h2)')
    .filter({ has: page.locator(':scope > h2', { hasText: t(locale, 'employees.sections.contract') }) })
    .getByText(t(locale, 'employees.fields.basicSalary'), { exact: true });
}

/** The app's not-found screen inside the shell (a page or record the viewer can't open). */
export async function expectNotFound(page: Page, locale: Language): Promise<void> {
  await expect(page.getByText(t(locale, 'ui.states.notFoundTitle'))).toBeVisible();
}
