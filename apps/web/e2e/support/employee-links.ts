import { expect, type Page, type TestInfo } from '@playwright/test';
import { PAGINATION, type Language, type PayrollRun, type PayrollRunSummary } from '@school-erp/shared';
import { Api } from './api';
import { t } from './i18n';
import { expectNoHorizontalScroll, expectTapTargets, shoot } from './ui';

/*
 * Every employee name opens that employee's profile (EmployeeLink). From a payroll run's
 * "Employees this month", a click on a name lands on the profile; the penalties list and the
 * lateness board name employees the same way. Shared by the desktop and phone specs.
 */

/** A run with lines (05-payroll made this month's), with its lines. */
async function runWithLines(): Promise<PayrollRun> {
  const api = await Api.asAdmin();
  const runs = await api.get<PayrollRunSummary[]>('/hr/payroll-runs', { limit: PAGINATION.maxLimit });
  for (const summary of runs) {
    const run = await api.get<PayrollRun>(`/hr/payroll-runs/${summary.id}`);
    if (run.lines.length > 0) {
      await api.dispose();
      return run;
    }
  }
  await api.dispose();
  throw new Error('smoke: no payroll run with lines — did 05-payroll run?');
}

/** `phone`: names reach 44px to a finger there (`tap-target`); desktop keeps its density. */
export async function checkEmployeeLinks(
  page: Page,
  info: TestInfo,
  locale: Language,
  suffix: string,
  phone: boolean,
): Promise<void> {
  const run = await runWithLines();
  const line = run.lines[0]!;
  const name = locale === 'ar' ? line.nameAr : line.nameEn;

  await page.goto(`/${locale}/payroll/${run.id}`);
  const link = page.getByRole('link', { name, exact: true }).filter({ visible: true }).first();
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute('href', `/${locale}/employees/${line.employeeId}`);
  if (phone) await expectTapTargets(link);
  await expectNoHorizontalScroll(page);
  await shoot(page, info, `employee-links-payroll-${suffix}`);

  // The name opens the profile — no row menu, no adjustments dialog on the way.
  await link.click();
  await expect(page).toHaveURL(new RegExp(`/${locale}/employees/${line.employeeId}$`));
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  // The penalties list and the lateness board link their names too.
  await page.goto(`/${locale}/penalties`);
  await expect(page.getByRole('heading', { level: 1, name: t(locale, 'penalties.title') })).toBeVisible();
  const penaltyLinks = page.locator('#main a[href*="/employees/"]').filter({ visible: true });
  if (phone && (await penaltyLinks.count()) > 0) await expectTapTargets(penaltyLinks.first());
  await expectNoHorizontalScroll(page);
  await shoot(page, info, `employee-links-penalties-${suffix}`);

  await page.goto(`/${locale}/lateness`);
  await expect(page.getByRole('heading', { level: 1, name: t(locale, 'lateness.title') })).toBeVisible();
  const latenessLink = page.locator('#main a[href*="/employees/"]').filter({ visible: true }).first();
  await expect(latenessLink).toBeVisible();
  if (phone) await expectTapTargets(latenessLink);
  await expectNoHorizontalScroll(page);
  await shoot(page, info, `employee-links-lateness-${suffix}`);
}
