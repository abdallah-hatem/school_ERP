import { expect, type Browser, type Page } from '@playwright/test';
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

export async function makeStageHead(): Promise<StageHeadSetup> {
  const api = await Api.asAdmin();
  const everyone = await api.get<EmployeeSummary[]>('/hr/employees', { limit: 100 });
  // An employee has at most one account: each run (and each spec) links a Stage head to one nobody
  // holds yet.
  const options = await api.get<EmployeeOption[]>('/users/employee-options', { limit: 100 });
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

/** The app's not-found screen inside the shell (a page or record the viewer can't open). */
export async function expectNotFound(page: Page, locale: Language): Promise<void> {
  await expect(page.getByText(t(locale, 'ui.states.notFoundTitle'))).toBeVisible();
}
