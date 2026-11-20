import { expect, test } from '@playwright/test';
import { PAGINATION, type Employee, type Month, type PayrollRun, type PayrollRunSummary } from '@school-erp/shared';
import { Api } from './support/api';
import { prefixOf, t } from './support/i18n';
import { expectNoHorizontalScroll, settle, shoot, signIn } from './support/ui';

/*
 * A payroll run's header (month, status, Recalculate / Export / Approve) and its tab bar live in the
 * run layout, so switching Employees → History → Employees renders only the tab: the `<h1>` stays
 * the same DOM node the whole time and never turns into a skeleton (the run isn't read again).
 * Runs in the `desktop-en` project (1440×900).
 */

type Watch = { lost: boolean; headerSkeleton: boolean };
type WatchWindow = Window & { __runH1?: Element | null; __runWatch?: Watch };

async function anyRun(): Promise<PayrollRunSummary> {
  const api = await Api.asAdmin();
  try {
    const [run] = await api.get<PayrollRunSummary[]>('/hr/payroll-runs', { limit: PAGINATION.maxLimit });
    if (!run) throw new Error('smoke: no payroll run (05-payroll creates one)');
    return run;
  } finally {
    await api.dispose();
  }
}

for (const locale of ['en', 'ar'] as const) {
  test(`payroll run (${locale}): switching to History and back keeps the header, only the tab loads`, async ({ page }, info) => {
    const run = await anyRun();
    await signIn(page, locale);
    const href = `/${locale}/payroll/${run.id}`;
    await page.goto(href);
    const tabs = page.getByRole('navigation', { name: t(locale, 'payroll.tabs.label') });
    const idle = () => expect(page.locator('#main [aria-busy="true"]')).toHaveCount(0);
    await idle();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    await page.evaluate(() => {
      const w = window as WatchWindow;
      w.__runH1 = document.getElementById('main')?.querySelector('h1') ?? null;
      w.__runWatch = { lost: false, headerSkeleton: false };
      new MutationObserver(() => {
        const watch = w.__runWatch!;
        const h1 = document.getElementById('main')?.querySelector('h1');
        if (!w.__runH1?.isConnected || h1 !== w.__runH1) watch.lost = true;
        if (document.querySelector('#main h1 [data-slot="skeleton"]')) watch.headerSkeleton = true;
      }).observe(document.body, { childList: true, subtree: true, attributes: true });
    });

    const steps = [
      { label: t(locale, 'payroll.tabs.history'), url: `${href}/history`, shot: 'history' },
      { label: t(locale, 'payroll.tabs.employees'), url: href, shot: 'employees' },
    ];
    for (const step of steps) {
      const link = tabs.getByRole('link', { name: step.label, exact: true });
      await link.click();
      await expect(page).toHaveURL(new RegExp(`${step.url}$`));
      await expect(link).toHaveAttribute('aria-current', 'page');
      await idle();
      if (step.shot === 'history') {
        await expect(page.getByRole('heading', { level: 2, name: t(locale, 'audit.history.title') })).toBeVisible();
        await expect(page.getByTestId('audit-entry').first()).toBeVisible();
      } else {
        await expect(page.getByRole('heading', { level: 2, name: t(locale, 'payroll.table.heading') })).toBeVisible();
      }
      await expectNoHorizontalScroll(page);
      await settle(page);
      await shoot(page, info, `run-${step.shot}-${locale}`);
      const watch = await page.evaluate(() => {
        const w = window as WatchWindow;
        const h1 = document.getElementById('main')?.querySelector('h1');
        return { ...w.__runWatch!, same: !!h1 && h1 === w.__runH1 };
      });
      expect(watch, `header after switching to ${step.shot}`).toEqual({ lost: false, headerSkeleton: false, same: true });
    }
  });
}

/** The month after `month` (`2026-12` → `2027-01`). */
function nextMonth(month: Month): Month {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
}

/*
 * Dry run 2026-11-20 b, finding 1: the History tab opened straight after Recalculate said "No
 * changes recorded yet" until a reload — the browser reused the History it already held (writes
 * only marked their tags stale). A write now expires its tags at once and drops the router cache
 * (`src/lib/revalidate.ts`), so History shows the new entry without a reload.
 */
test('payroll run: History opened straight after Recalculate lists the new entry, without a reload', async ({ page }) => {
  const api = await Api.asAdmin();
  let restoreSalary: (() => Promise<unknown>) | null = null;
  try {
    // A fresh draft (the month after the newest run): History holds only its "Created" entry.
    const runs = await api.get<PayrollRunSummary[]>('/hr/payroll-runs', { limit: PAGINATION.maxLimit });
    const newest = runs.map((r) => r.month).sort().pop();
    if (!newest) throw new Error('smoke: no payroll run (05-payroll creates one)');
    const run = await api.post<PayrollRun>('/hr/payroll-runs', { month: nextMonth(newest) });
    const line = run.lines[0];
    if (!line) throw new Error('smoke: the new run has no lines');

    await signIn(page, 'en');
    const href = `/en/payroll/${run.id}`;
    await page.goto(href);
    const tabs = page.getByRole('navigation', { name: t('en', 'payroll.tabs.label') });
    const historyTab = tabs.getByRole('link', { name: t('en', 'payroll.tabs.history'), exact: true });
    const employeesTab = tabs.getByRole('link', { name: t('en', 'payroll.tabs.employees'), exact: true });
    const entries = page.getByTestId('audit-entry');

    // Open History first, so the browser holds it, then go back to Employees.
    await historyTab.click();
    await expect(page).toHaveURL(new RegExp(`${href}/history$`));
    await expect(entries).toHaveCount(1);
    await employeesTab.click();
    await expect(page).toHaveURL(new RegExp(`${href}$`));

    // A salary change (made elsewhere) gives Recalculate something to record.
    const employee = await api.get<Employee>(`/hr/employees/${line.employeeId}`);
    if (employee.basicSalary === undefined) throw new Error('smoke: the admin cannot see salaries');
    const salary = employee.basicSalary;
    restoreSalary = () => api.patch(`/hr/employees/${line.employeeId}`, { basicSalary: salary });
    await api.patch(`/hr/employees/${line.employeeId}`, { basicSalary: salary + 10_000 });

    await page.getByRole('button', { name: t('en', 'payroll.actions.recalculate'), exact: true }).click();
    await expect(page.getByText(t('en', 'payroll.actions.recalculated'))).toBeVisible();

    // Straight to History: the Recalculate entry is there, newest first — no reload.
    await historyTab.click();
    await expect(page).toHaveURL(new RegExp(`${href}/history$`));
    await expect(entries).toHaveCount(2);
    await expect(entries.first()).toContainText(prefixOf('en', 'audit.actions.hr.payroll.recalculate', {}));
    await expect(page.getByText(t('en', 'audit.history.emptyTitle'))).toHaveCount(0);
  } finally {
    await restoreSalary?.();
    await api.dispose();
  }
});
