import { expect, test, type Page } from '@playwright/test';
import { PAGINATION, PayrollStatus, type AccountingPayrollMonth, type PayrollRunSummary } from '@school-erp/shared';
import { Api } from './support/api';
import { t } from './support/i18n';
import { searchField, shoot, signIn } from './support/ui';

/*
 * Every DataTable's header, rows and totals row reach both inner edges of their card, in English
 * and Arabic (the scroller's scrollbar gutter used to leave an empty 10px strip at the inline end:
 * right in LTR, left in RTL). Then the payroll taxes statement (§10): each group pages with the
 * subtotal of the whole group, and print lists everyone. Needs an approved month (05-payroll
 * approves one). The employees screen is a card grid, not a DataTable, so it isn't measured here.
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

/**
 * For each table drawn as a table: how far its header row, first row and totals row (when there
 * is one) stop from its card's inner edges, in px — 0 when they reach the edge.
 */
function rowGaps(page: Page) {
  return page.locator('section[data-cards-below]').evaluateAll((sections) =>
    sections.flatMap((section) => {
      const view = section.querySelector<HTMLElement>('[data-view="table"]');
      if (!view || view.getBoundingClientRect().width === 0) return [];
      const card = section.getBoundingClientRect();
      const style = getComputedStyle(section);
      const left = card.left + parseFloat(style.borderLeftWidth);
      const right = card.right - parseFloat(style.borderRightWidth);
      return ['thead tr', 'tbody tr', 'tfoot tr'].flatMap((selector) => {
        const row = view.querySelector<HTMLElement>(selector);
        if (!row) return [];
        const box = row.getBoundingClientRect();
        return [{ row: selector, start: Math.round(box.left - left), end: Math.round(right - box.right) }];
      });
    }),
  );
}

/** Opens a screen and waits until the streamed skeleton has been replaced by the loaded screen. */
async function openSettled(page: Page, path: string) {
  await page.goto(path);
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
}

for (const locale of ['en', 'ar'] as const) {
  test(`every table's rows reach both edges of its card (${locale})`, async ({ page }) => {
    const month = await approvedMonth();
    await signIn(page, locale);
    for (const path of ['/payroll', '/penalties', '/users', `/accounting/payroll-taxes/${month.month}`]) {
      await openSettled(page, `/${locale}${path}`);
      const gaps = await rowGaps(page);
      expect(gaps.length, path).toBeGreaterThan(0);
      for (const gap of gaps) expect({ path, ...gap }).toEqual({ path, row: gap.row, start: 0, end: 0 });
    }
  });

  test(`payroll taxes statement: paging, whole-group subtotals, print lists everyone (${locale})`, async ({ page }, info) => {
    const month = await approvedMonth();
    await signIn(page, locale);
    await openSettled(page, `/${locale}/accounting/payroll-taxes/${month.month}`);
    await expect(page.locator('[data-statement]')).toHaveCount(1);

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
    await expect(page.locator('[data-statement] [role="search"]')).toBeHidden();
    await page.emulateMedia({ media: 'screen' });
  });
}
