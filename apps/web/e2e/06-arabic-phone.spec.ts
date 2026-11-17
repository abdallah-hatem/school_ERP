import { expect, test, type Page } from '@playwright/test';
import { PAGINATION, type PayrollRun, type PayrollRunSummary } from '@school-erp/shared';
import { Api } from './support/api';
import { currentMonth } from './support/dates';
import { literal, t } from './support/i18n';
import { expectNoHorizontalScroll, shoot, signIn } from './support/ui';

/** Runs in the `phone-ar` project only (390×844). */

async function expectRtlPhoneLayout(page: Page) {
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('html')).toHaveAttribute('lang', /^ar/);
  await expectNoHorizontalScroll(page);
}

/** This month's payroll run: the one 05-payroll approved, or a new draft when this runs alone. */
async function currentRunId(api: Api): Promise<string> {
  const month = currentMonth();
  const runs = await api.get<PayrollRunSummary[]>('/hr/payroll-runs', {
    limit: PAGINATION.maxLimit,
  });
  const run = runs.find((r) => r.month === month) ?? (await api.post<PayrollRun>('/hr/payroll-runs', { month }));
  return run.id;
}

test('Arabic on a phone: dashboard, employees and the payroll run fit the screen, right to left', async ({
  page,
}, info) => {
  const api = await Api.asAdmin();
  const runId = await currentRunId(api);
  await api.dispose();

  await signIn(page, 'ar');
  await expect(page).toHaveURL(/\/ar\/?$/);
  await expect(
    page.getByRole('link', {
      name: literal(t('ar', 'dashboard.headcount.label')),
    }),
  ).toBeVisible();
  await expectRtlPhoneLayout(page);
  await shoot(page, info, 'dashboard');

  await page.goto('/ar/employees');
  await expect(page.getByRole('heading', { level: 1, name: t('ar', 'employees.title') })).toBeVisible();
  // Phones get the card list, not the table.
  await expect(page.locator('[data-view="cards"]').first()).toBeVisible();
  await expect(page.locator('[data-view="table"]').first()).toBeHidden();
  await expectRtlPhoneLayout(page);
  await shoot(page, info, 'employees-list');

  await page.goto(`/ar/payroll/${runId}`);
  await expect(page.getByTestId('lines-count')).toBeVisible();
  await expect(page.locator('[data-view="cards"]').first()).toBeVisible();
  await expectRtlPhoneLayout(page);
  await shoot(page, info, 'payroll-run');
});
