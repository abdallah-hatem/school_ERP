// @vitest-environment jsdom
import { DEFAULT_TAX_RULE } from '@school-erp/shared';
import { cleanup, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  redirect: vi.fn(),
}));
const GET_PAYROLL_TAXES_EXCEL = vi.fn();
vi.mock('../apis', () => ({ GET_PAYROLL_TAXES_EXCEL: (month: string) => GET_PAYROLL_TAXES_EXCEL(month) }));
const saveDownloadedFile = vi.fn();
vi.mock('@/shared/lib/download', () => ({ saveDownloadedFile: (f: unknown) => saveDownloadedFile(f) }));

import { BIG_MONTH, LIMITED_MONTH, MONTH, renderAccounting } from '../test/fixtures';
import { Statement, STATEMENT_PRINT_CSS } from './statement';

afterEach(cleanup);
beforeEach(() => {
  GET_PAYROLL_TAXES_EXCEL.mockReset();
  saveDownloadedFile.mockReset();
});

const props = { monthKey: '2026-10', basePath: '/en/accounting/payroll-taxes' };
const statement = () => screen.getByRole('article', { name: 'Payroll taxes statement' });
const group = (name: string) => screen.getByRole('table', { name });
const lastRowCells = (name: string) =>
  within(within(group(name)).getAllByRole('row').at(-1)!).getAllByRole('cell').map((c) => c.textContent);

describe('Statement', () => {
  it('the sum across the top: net + insurance share + income tax + martyrs\' fund = gross', () => {
    const { container } = renderAccounting(<Statement {...props} month={MONTH} todayRule={DEFAULT_TAX_RULE} />);
    const sum = container.querySelector('[data-statement-sum]') as HTMLElement;
    expect(sum.textContent).toContain('Net paid');
    expect(sum.textContent).toContain('24,000.00');
    expect(sum.textContent).toContain('1,100.00');
    expect(sum.textContent).toContain('3,034.70');
    expect(sum.textContent).toContain('14.08');
    expect(sum.textContent).toContain('28,148.78');
    expect(within(statement()).getByText('Demo School · Payroll taxes statement')).toBeTruthy();
    expect(within(statement()).getByRole('heading', { level: 2, name: 'October 2026' })).toBeTruthy();
  });

  it('employees grouped insured / not insured, each a table with its subtotal row', () => {
    renderAccounting(<Statement {...props} month={MONTH} todayRule={DEFAULT_TAX_RULE} />);
    const insured = group('Insured');
    expect(within(insured).getByText('Omar Fathy')).toBeTruthy();
    expect(within(insured).getByText('Hana Nabil')).toBeTruthy();
    expect(within(insured).queryByText('Salma Adel')).toBeNull();
    // Subtotal under each column: net, insurance share, tax, fund, gross (the insurance pill column is hidden in the table).
    expect(lastRowCells('Insured')).toEqual(['Subtotal · all 2', '', '', '12,000.00', '1,100.00', '1,517.38', '7.32', '14,624.70']);
    expect(lastRowCells('Not insured')).toEqual(['Subtotal · 1 employee', '', '12,000.00', '1,517.32', '6.76', '13,524.08']);
    // A net floored at 0 says so.
    expect(within(insured).getByText('Net 0 — floored in HR')).toBeTruthy();
  });

  it('salary data (§2, P4): a line outside the viewer\'s scope shows name and insurance only, and no totals anywhere', () => {
    const { container } = renderAccounting(<Statement {...props} month={LIMITED_MONTH} todayRule={DEFAULT_TAX_RULE} />);
    expect(container.querySelector('[data-statement-sum]')?.textContent).toContain('You see the amounts of 2 of 3 employees.');
    expect(container.querySelector('[data-statement-sum]')?.textContent).not.toContain('24,000.00');
    const omar = within(group('Insured')).getByText('Omar Fathy').closest('tr') as HTMLElement;
    expect(omar.textContent).toContain('Salary hidden');
    expect(within(omar).getAllByLabelText('Amount hidden').length).toBeGreaterThan(0);
    expect(lastRowCells('Insured')).toEqual(['Subtotal · all 2', 'Only for someone who sees every salary']);
    expect(lastRowCells('Not insured')).toEqual(['Subtotal · 1 employee', 'Only for someone who sees every salary']);
  });

  it('the rule used, and whether it is still today\'s', () => {
    renderAccounting(<Statement {...props} month={MONTH} todayRule={DEFAULT_TAX_RULE} />);
    expect(within(statement()).getByText('First 5,000.00')).toBeTruthy();
    expect(within(statement()).getAllByText('Next 1,250.00')).toHaveLength(2);
    expect(within(statement()).getByText('Above 35,000.00')).toBeTruthy();
    expect(screen.getByText('Same as today\'s rule')).toBeTruthy();
    cleanup();
    renderAccounting(<Statement {...props} month={MONTH} todayRule={{ ...DEFAULT_TAX_RULE, martyrPercent: 0.1 }} />);
    expect(screen.getByText('Today\'s rule is different')).toBeTruthy();
    cleanup();
    // A viewer who can't read today's rule: no badge.
    renderAccounting(<Statement {...props} month={MONTH} todayRule={null} />);
    expect(screen.queryByText('Same as today\'s rule')).toBeNull();
    expect(screen.queryByText('Today\'s rule is different')).toBeNull();
  });

  it('Excel: one request, the file saved; busy while it downloads', async () => {
    const user = userEvent.setup();
    let resolve: (v: unknown) => void = () => undefined;
    GET_PAYROLL_TAXES_EXCEL.mockReturnValue(new Promise((r) => (resolve = r)));
    renderAccounting(<Statement {...props} month={MONTH} todayRule={null} />);
    const excel = screen.getByRole('button', { name: 'Excel' });
    await user.click(excel);
    await user.click(excel);
    expect(GET_PAYROLL_TAXES_EXCEL).toHaveBeenCalledTimes(1);
    expect(GET_PAYROLL_TAXES_EXCEL).toHaveBeenCalledWith('2026-10');
    const file = { fileName: 'payroll-taxes-2026-10.xlsx', contentType: 'x', base64: '' };
    resolve({ success: true, status: 200, data: file });
    await vi.waitFor(() => expect(saveDownloadedFile).toHaveBeenCalledWith(file));
  });

  it('print / PDF: landscape A4, the app chrome and the buttons left out', () => {
    expect(STATEMENT_PRINT_CSS).toMatch(/@page\s*{\s*size:\s*A4 landscape/);
    const { container } = renderAccounting(<Statement {...props} month={MONTH} todayRule={DEFAULT_TAX_RULE} />);
    expect(container.querySelector('style')?.textContent).toBe(STATEMENT_PRINT_CSS);
    const pdf = screen.getByRole('button', { name: 'Download PDF' });
    expect(pdf.closest('.no-print')).toBeTruthy();
    expect(statement().contains(pdf)).toBe(false);
  });

  it('loading: the same blocks, with the tables in their skeleton', () => {
    const { container } = renderAccounting(<Statement {...props} month={undefined} todayRule={null} />);
    for (const block of ['header', 'statement', 'statement-head', 'statement-sum', 'statement-foot']) {
      expect(container.querySelector(`[data-skeleton-block="${block}"]`), block).not.toBeNull();
    }
    expect(container.querySelectorAll('[aria-hidden="true"] tfoot')).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'Excel' })).toBeNull();
  });

  it('Arabic (RTL): the statement reads in Arabic with Latin figures', () => {
    renderAccounting(<Statement {...props} basePath="/ar/accounting/payroll-taxes" month={MONTH} todayRule={DEFAULT_TAX_RULE} />, 'ar');
    expect(document.documentElement.dir).toBe('rtl');
    expect(screen.getByRole('table', { name: 'مؤمَّن عليهم' })).toBeTruthy();
    expect(screen.getByText('مدرسة تجريبية · بيان ضرائب الرواتب')).toBeTruthy();
    expect(screen.getByText('مطابقة لقاعدة اليوم')).toBeTruthy();
    expect(lastRowCells('غير مؤمَّن عليهم')[0]).toBe('المجموع الفرعي · موظف واحد');
    expect(lastRowCells('مؤمَّن عليهم')[0]).toBe('المجموع الفرعي · الاثنان');
  });

  describe('a month of many employees (paging, search, print)', () => {
    // Paging and Clear filters bring the list's top back into view.
    beforeEach(() => vi.stubGlobal('scrollTo', vi.fn()));
    afterEach(() => vi.unstubAllGlobals());
    // The group (heading, count) around its DataTable region of the same name.
    const insured = () => screen.getAllByRole('region', { name: 'Insured' })[0]!;
    const notInsured = () => screen.getAllByRole('region', { name: 'Not insured' })[0]!;
    const bodyNames = (name: string) =>
      within(group(name))
        .getAllByRole('row')
        .slice(1, -1)
        .map((r) => within(r).getAllByRole('cell')[0]!.textContent);
    const searchBox = () => screen.getByRole('searchbox', { name: "Search the statement's employees" }) as HTMLInputElement;

    it("each group pages by the app's default of 10; the subtotal covers the whole group and says so", async () => {
      const user = userEvent.setup();
      renderAccounting(<Statement {...props} month={BIG_MONTH} todayRule={null} />);
      // 26 insured: rows 1–10, and the subtotal of all 26 (26 × 100.00 gross).
      expect(bodyNames('Insured')).toHaveLength(10);
      expect(bodyNames('Insured')[0]).toContain('Insured 01');
      expect(within(insured()).getByText('Showing 1–10 of 26')).toBeTruthy();
      const subtotal = lastRowCells('Insured');
      expect(subtotal[0]).toBe('Subtotal · all 26');
      expect(subtotal.at(-1)).toBe('2,600.00');
      // Page 2: the next ten; the subtotal is unchanged (the group, not the page).
      await user.click(within(insured()).getByRole('button', { name: 'Page 2' }));
      expect(bodyNames('Insured')).toHaveLength(10);
      expect(bodyNames('Insured')[0]).toContain('Insured 11');
      expect(within(insured()).getByText('Showing 11–20 of 26')).toBeTruthy();
      expect(lastRowCells('Insured')).toEqual(subtotal);
      // The other group pages on its own.
      expect(within(notInsured()).getByText('Showing 1–3 of 3')).toBeTruthy();
    });

    it("one search (name or code) narrows both groups and goes back to page 1; the subtotals stay the whole group's", async () => {
      const user = userEvent.setup();
      renderAccounting(<Statement {...props} month={BIG_MONTH} todayRule={null} />);
      await user.click(within(insured()).getByRole('button', { name: 'Page 3' }));
      await user.type(searchBox(), 'EMP-0105');
      expect(bodyNames('Insured')).toEqual([expect.stringContaining('Insured 05')]);
      expect(within(insured()).getByText('1 of 26')).toBeTruthy();
      expect(lastRowCells('Insured')[0]).toBe('Subtotal · all 26');
      expect(lastRowCells('Insured').at(-1)).toBe('2,600.00');
      // No one in the other group matches: it says so, with Clear filters.
      expect(within(notInsured()).getByText('No one in this group matches')).toBeTruthy();
      // An Arabic name matches too, with its letter variants folded (أخر / اخر).
      await user.clear(searchBox());
      await user.type(searchBox(), 'اخر 3');
      expect(bodyNames('Not insured')).toEqual([expect.stringContaining('Other 3')]);
      // Clear filters: everyone again, from page 1.
      await user.click(screen.getAllByRole('button', { name: /Clear filters/ })[0]!);
      expect(searchBox().value).toBe('');
      expect(within(insured()).getByText('Showing 1–10 of 26')).toBeTruthy();
    });

    it('print / PDF lists everyone in each group, whatever the page or the search', async () => {
      const user = userEvent.setup();
      const { container } = renderAccounting(<Statement {...props} month={BIG_MONTH} todayRule={null} />);
      await user.click(within(insured()).getByRole('button', { name: 'Page 2' }));
      await user.type(searchBox(), 'Insured 05');
      const printed = [...container.querySelectorAll<HTMLElement>('[data-print-rows]')];
      expect(printed.map((p) => p.querySelectorAll('tbody tr').length)).toEqual([26, 3]);
      expect(printed[0]!.querySelector('tfoot')?.textContent).toContain('Subtotal · all 26');
      // The search box stays off the printout.
      expect(screen.getByRole('search').classList.contains('no-print')).toBe(true);
    });
  });

  it('worst-case totals (break-ui): every term of the sum is drawn whole, its label apart from it', () => {
    // A month of 500 employees near the largest salary: nine- and ten-digit totals.
    const totals = {
      employees: 500,
      net: 99_999_999_999,
      insuranceAmount: 1,
      incomeTax: 3_595_275_932,
      martyrTax: 0,
      gross: 1_073_741_823_500,
    };
    for (const locale of ['en', 'ar'] as const) {
      const { container } = renderAccounting(<Statement {...props} month={{ ...MONTH, totals }} todayRule={DEFAULT_TAX_RULE} />, locale);
      const sum = container.querySelector('[data-statement-sum]') as HTMLElement;
      for (const figure of ['999,999,999.99', '0.01', '35,952,759.32', '0.00', '10,737,418,235.00']) {
        const piece = within(sum).getByText(figure);
        // One piece, the currency label a separate one before it (it may wrap above, never split it).
        expect(piece.childNodes).toHaveLength(1);
        expect(piece.previousElementSibling?.textContent).toBe(locale === 'ar' ? 'ج.م' : 'EGP');
      }
      cleanup();
    }
  });
});
