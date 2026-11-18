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

import { LIMITED_MONTH, MONTH, renderAccounting } from '../test/fixtures';
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
    expect(lastRowCells('Insured')).toEqual(['Subtotal', '', '', '12,000.00', '1,100.00', '1,517.38', '7.32', '14,624.70']);
    expect(lastRowCells('Not insured')).toEqual(['Subtotal', '', '12,000.00', '1,517.32', '6.76', '13,524.08']);
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
    expect(lastRowCells('Insured')).toEqual(['Subtotal', 'Only for someone who sees every salary']);
    expect(lastRowCells('Not insured')).toEqual(['Subtotal', 'Only for someone who sees every salary']);
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
    expect(lastRowCells('غير مؤمَّن عليهم')[0]).toBe('المجموع الفرعي');
  });
});
