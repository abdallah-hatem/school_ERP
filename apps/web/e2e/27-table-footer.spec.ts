import { expect, test, type Page } from '@playwright/test';
import { PAGINATION, PayrollStatus, type AccountingPayrollMonth, type PayrollRunSummary } from '@school-erp/shared';
import { Api } from './support/api';
import { t } from './support/i18n';
import { searchField, shoot, signIn } from './support/ui';

/*
 * The payroll taxes statement (§10) on a desktop, English then Arabic: each group's totals row
 * reaches both edges of its table card (it used to stop short of the inline end by the scrollbar
 * gutter), each group pages with the subtotal of the whole group, and print lists everyone.
 * Needs an approved month (05-payroll approves one).
 */

async function approvedMonth(): Promise<AccountingPayrollMonth> {
  const api = await Api.asAdmin();
  try {
    const runs = await api.get<PayrollRunSummary[]>('/hr/payroll-runs', { limit: PAGINATION.maxLimit });
    const approved = runs.find((r) => r.status === PayrollStatus.APPROVED);
    if (!approved) throw new Error('smoke: no approved payroll month (05-payroll approves one)');
    return await api.get<AccountingPayrollMonth>(`/accounting/payroll/${approved.month}`);
  } finally {
    await api.dispose();
  }
}

/** For each visible totals row: how far its shaded row stops from its table card's inner edges. */
function footerGaps(page: Page) {
  return page.locator('[data-statement] section[data-cards-below]').evaluateAll((sections) =>
    sections
      .map((section) => {
        const row = section.querySelector<HTMLElement>('[data-view="table"] tfoot tr');
        if (!row || row.getBoundingClientRect().width === 0) return null;
        const card = section.getBoundingClientRect();
        const style = getComputedStyle(section);
        const r = row.getBoundingClientRect();
        return {
          start: Math.round(r.left - (card.left + parseFloat(style.borderLeftWidth))),
          end: Math.round(card.right - parseFloat(style.borderRightWidth) - r.right),
        };
      })
      .filter((gap) => gap !== null),
  );
}

for (const locale of ['en', 'ar'] as const) {
  test(`payroll taxes statement: totals row full width, paging, print lists everyone (${locale})`, async ({ page }, info) => {
    const month = await approvedMonth();
    await signIn(page, locale);
    await page.goto(`/${locale}/accounting/payroll-taxes/${month.month}`);
    await expect(page.locator('[data-statement]')).toBeVisible();
    await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);

    // The shaded totals row meets the card's edges on both sides, in LTR and RTL.
    const gaps = await footerGaps(page);
    expect(gaps.length).toBeGreaterThan(0);
    for (const gap of gaps) expect(gap).toEqual({ start: 0, end: 0 });
    // Lists without a totals row keep their layout (the scroller's gutter is unchanged).
    await page.goto(`/${locale}/payroll`);
    await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
    const gutters = await page
      .locator('[data-table-scroll]')
      .evaluateAll((els) => els.map((el) => getComputedStyle(el).scrollbarGutter));
    for (const gutter of gutters) expect(gutter).toBe('stable');
    await page.goto(`/${locale}/accounting/payroll-taxes/${month.month}`);
    await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);

    // Each group shows at most a page; its subtotal names the whole group.
    const insured = month.lines.filter((l) => l.insuranceStatus === 'INSURED').length;
    const notInsured = month.lines.length - insured;
    const groups = [
      { name: t(locale, 'accounting.payrollTaxes.statement.insured'), count: insured },
      { name: t(locale, 'accounting.payrollTaxes.statement.notInsured'), count: notInsured },
    ];
    for (const group of groups.filter((g) => g.count > 0)) {
      const table = page.getByRole('table', { name: group.name, exact: true });
      await expect(table.locator('tbody tr')).toHaveCount(Math.min(group.count, PAGINATION.defaultLimit));
      await expect(table.locator('tfoot')).toContainText(
        t(locale, 'accounting.payrollTaxes.statement.subtotalAll', { count: String(group.count) }),
      );
    }

    // A search narrows the groups on screen…
    const first = month.lines[0]!;
    await searchField(page, t(locale, 'accounting.payrollTaxes.statement.search.label')).fill(first.employeeCode);
    await expect(page.locator('[data-statement] [data-view="table"] tbody tr:visible')).toHaveCount(1);
    await shoot(page, info, `payroll-taxes-search-${locale}`);

    // …and print still lists every employee of each group, with no paging and no search box.
    await page.emulateMedia({ media: 'print' });
    for (const group of groups.filter((g) => g.count > 0)) {
      await expect(page.locator(`[data-statement] table[aria-label="${group.name}"] tbody tr:visible`)).toHaveCount(group.count);
    }
    await expect(page.getByRole('navigation', { name: t(locale, 'ui.table.pagination') }).first()).toBeHidden();
    await expect(page.getByRole('search')).toBeHidden();
    await page.emulateMedia({ media: 'screen' });
  });
}
