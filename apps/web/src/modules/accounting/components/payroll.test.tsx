// @vitest-environment jsdom
import type { AccountingPayrollHrBreakdown, AccountingPayrollMonth, AccountingPayrollMonthSummary } from '@school-erp/shared';
import { cleanup, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sessionWithout } from '@/test/render';

const push = vi.fn();
const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh }),
  redirect: vi.fn(),
}));
const RETURN_PAYROLL_MONTH = vi.fn();
const FINALIZE_PAYROLL_MONTH = vi.fn();
vi.mock('../apis', () => ({
  GET_PAYROLL_TAXES_EXCEL: vi.fn(),
  RETURN_PAYROLL_MONTH: (...args: unknown[]) => RETURN_PAYROLL_MONTH(...args),
  FINALIZE_PAYROLL_MONTH: (...args: unknown[]) => FINALIZE_PAYROLL_MONTH(...args),
}));
vi.mock('@/shared/lib/download', () => ({ saveDownloadedFile: vi.fn() }));

import { LIMITED_MONTH, MONTH, renderAccounting } from '../test/fixtures';
import { PayrollList } from './payroll-list';
import { PayrollMonth } from './payroll-month';

afterEach(cleanup);
beforeEach(() => {
  push.mockReset();
  refresh.mockReset();
  RETURN_PAYROLL_MONTH.mockReset();
  FINALIZE_PAYROLL_MONTH.mockReset();
});

const HR: AccountingPayrollHrBreakdown = {
  departmentNameEn: 'Science',
  departmentNameAr: 'العلوم',
  monthSalary: 1_300_000,
  penaltyDays: 1,
  penaltyAmount: 50_000,
  latenessDays: 0.5,
  latenessAmount: 25_000,
  adjustmentAdditions: 0,
  adjustmentDeductions: 25_000,
};

/** October with HR's breakdown on every line (as `GET /accounting/payroll/:month` sends it). */
const WITH_HR: AccountingPayrollMonth = { ...MONTH, lines: MONTH.lines.map((l) => ({ ...l, hr: HR })) };

const SUMMARY: AccountingPayrollMonthSummary = {
  month: MONTH.month,
  status: 'PENDING',
  finalizedAt: null,
  hrRunId: MONTH.hrRunId,
  recordedAt: MONTH.recordedAt,
  salaryVisible: true,
  totals: MONTH.totals,
};

const listProps = { basePath: '/en/accounting/payroll', hrPayrollHref: '/en/payroll', query: { page: 1, limit: 10 }, total: 1 };
const rowOf = (name: string) => screen.getAllByText(name)[0]!.closest('tr') as HTMLElement;

describe('PayrollList (Accounting → Payroll)', () => {
  it('each approved month: its status, head count, net, insurance, taxes and gross, linking to the month', () => {
    const finalized: AccountingPayrollMonthSummary = { ...SUMMARY, month: '2026-09', status: 'FINALIZED', finalizedAt: '2026-10-28T09:00:00.000Z' };
    renderAccounting(<PayrollList {...listProps} months={[SUMMARY, finalized]} total={2} />);
    expect(within(rowOf('September 2026')).getByText('Finalized · transferred')).toBeTruthy();
    const row = rowOf('October 2026');
    expect(within(row).getByText('Pending transfer')).toBeTruthy();
    expect(row.textContent).toContain('24,000.00');
    expect(row.textContent).toContain('1,100.00');
    // Taxes = income tax + martyrs' fund (3,034.70 + 14.08).
    expect(row.textContent).toContain('3,048.78');
    expect(row.textContent).toContain('28,148.78');
    expect(within(row).getByRole('link', { name: 'Open October 2026' }).getAttribute('href')).toBe('/en/accounting/payroll/2026-10');
  });

  it('without every salary: the head count, money hidden', () => {
    renderAccounting(<PayrollList {...listProps} months={[{ ...SUMMARY, salaryVisible: false, totals: { employees: 3 } }]} />);
    const row = rowOf('October 2026');
    expect(row.textContent).not.toContain('28,148.78');
    expect(within(row).getAllByLabelText('Amount hidden').length).toBe(4);
  });

  it('nothing approved yet: says so and links to HR payroll', () => {
    renderAccounting(<PayrollList {...listProps} months={[]} total={0} />);
    expect(screen.getByText('No approved payroll yet')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Open HR payroll' }).getAttribute('href')).toBe('/en/payroll');
  });
});

describe('PayrollMonth (Accounting → Payroll, one month)', () => {
  const props = { monthKey: '2026-10' as const, basePath: '/en/accounting/payroll' };
  const table = () => screen.getByRole('table', { name: 'Employees in October 2026' });

  it("HR's columns, then insurance and taxes, and the gross", () => {
    renderAccounting(<PayrollMonth {...props} month={WITH_HR} />);
    const headers = within(table()).getAllByRole('columnheader').map((h) => h.textContent);
    expect(headers).toEqual([
      'Employee', 'Salary', 'Penalties', 'Lateness', 'Adjustments', 'Net',
      'Insurance share', 'Income tax', "Martyrs' fund", 'Gross',
    ]);
    const omar = within(table()).getByText('Omar Fathy').closest('tr') as HTMLElement;
    expect(omar.textContent).toContain('Science');
    expect(omar.textContent).toContain('13,000.00');
    expect(omar.textContent).toContain('500.00');
    expect(omar.textContent).toContain('-250.00');
    expect(omar.textContent).toContain('550.00');
    expect(omar.textContent).toContain('14,074.42');
    // The month's total row covers everyone.
    const last = within(table()).getAllByRole('row').at(-1)!;
    expect(last.textContent).toContain('28,148.78');
    expect(screen.getByRole('heading', { level: 1, name: 'Payroll · October 2026' })).toBeTruthy();
  });

  it('salary data (§2, P4): a line outside scope shows its name only; no totals', () => {
    const limited: AccountingPayrollMonth = {
      ...LIMITED_MONTH,
      lines: LIMITED_MONTH.lines.map((l) =>
        l.salaryVisible ? { ...l, hr: HR } : { ...l, hr: { departmentNameEn: 'Science', departmentNameAr: 'العلوم', penaltyDays: 1, latenessDays: 0 } },
      ),
    };
    renderAccounting(<PayrollMonth {...props} month={limited} />);
    const omar = within(table()).getByText('Omar Fathy').closest('tr') as HTMLElement;
    expect(omar.textContent).toContain('Salary hidden');
    expect(within(omar).getAllByLabelText('Amount hidden')).toHaveLength(9);
    expect(screen.getAllByText('Totals show only to someone who sees every salary.').length).toBeGreaterThan(0);
    expect(within(table()).getAllByRole('row').at(-1)!.textContent).not.toContain('28,148.78');
  });

  it('search narrows the employees by name or code', async () => {
    const user = userEvent.setup();
    renderAccounting(<PayrollMonth {...props} month={WITH_HR} />);
    await user.type(screen.getByRole('searchbox', { name: 'Search employees' }), 'EMP-0002');
    expect(within(table()).getByText('Omar Fathy')).toBeTruthy();
    expect(within(table()).queryByText('Salma Adel')).toBeNull();
    expect(screen.getByTestId('lines-count').textContent).toBe('1 of 3');
  });

  it('Arabic: right to left, Arabic headings and names', () => {
    renderAccounting(<PayrollMonth {...props} month={WITH_HR} />, 'ar');
    expect(document.documentElement.dir).toBe('rtl');
    expect(screen.getByRole('columnheader', { name: 'ضريبة كسب العمل' })).toBeTruthy();
    expect(screen.getAllByText('عمر فتحي').length).toBeGreaterThan(0);
    expect(screen.getAllByText('العلوم').length).toBeGreaterThan(0);
  });
});

describe('PayrollMonth — return to HR / finalize', () => {
  const props = { monthKey: '2026-10' as const, basePath: '/en/accounting/payroll' };
  const button = (name: string) => screen.queryByRole('button', { name });

  it('a pending month: "Pending transfer", with Return to HR and Finalize for someone holding both', () => {
    renderAccounting(<PayrollMonth {...props} month={WITH_HR} />);
    expect(screen.getByText('Pending transfer')).toBeTruthy();
    expect(button('Return to HR')).toBeTruthy();
    expect(button('Finalize (transfer made)')).toBeTruthy();
  });

  it('each button needs its own permission', () => {
    renderAccounting(<PayrollMonth {...props} month={WITH_HR} />, 'en', sessionWithout('accounting.payroll.return'));
    expect(button('Return to HR')).toBeNull();
    expect(button('Finalize (transfer made)')).toBeTruthy();
    cleanup();
    renderAccounting(<PayrollMonth {...props} month={WITH_HR} />, 'en', sessionWithout('accounting.payroll.finalize'));
    expect(button('Return to HR')).toBeTruthy();
    expect(button('Finalize (transfer made)')).toBeNull();
  });

  it('Return to HR asks why (required), sends the reason, then goes back to the list', async () => {
    const user = userEvent.setup();
    RETURN_PAYROLL_MONTH.mockResolvedValue({ success: true, status: 204, data: null });
    renderAccounting(<PayrollMonth {...props} month={WITH_HR} />);
    await user.click(button('Return to HR')!);
    const dialog = await screen.findByRole('dialog', { name: 'Return October 2026 to HR?' });
    const confirm = within(dialog).getByRole('button', { name: 'Return to HR' });
    expect(confirm.hasAttribute('disabled')).toBe(true);
    await user.type(within(dialog).getByRole('textbox'), '  Penalty for EMP-0012 missing ');
    await user.click(confirm);
    expect(RETURN_PAYROLL_MONTH).toHaveBeenCalledWith('2026-10', MONTH.hrRunId, { reason: 'Penalty for EMP-0012 missing' });
    expect(push).toHaveBeenCalledWith('/en/accounting/payroll');
  });

  it('Finalize confirms, then the month reads Finalized with no way back', async () => {
    const user = userEvent.setup();
    FINALIZE_PAYROLL_MONTH.mockResolvedValue({
      success: true,
      status: 200,
      data: { ...WITH_HR, status: 'FINALIZED', finalizedAt: '2026-11-20T09:00:00.000Z' },
    });
    renderAccounting(<PayrollMonth {...props} month={WITH_HR} />);
    await user.click(button('Finalize (transfer made)')!);
    const dialog = await screen.findByRole('dialog', { name: 'Finalize October 2026?' });
    await user.click(within(dialog).getByRole('button', { name: 'Finalize' }));
    expect(FINALIZE_PAYROLL_MONTH).toHaveBeenCalledWith('2026-10', MONTH.hrRunId);
    expect(await screen.findByText('Finalized · transferred')).toBeTruthy();
    expect(screen.getByRole('note').textContent).toContain('can no longer be returned to HR');
    expect(button('Return to HR')).toBeNull();
    expect(button('Finalize (transfer made)')).toBeNull();
  });

  it('Arabic: a finalized month in Arabic, no actions but Excel and PDF', () => {
    renderAccounting(
      <PayrollMonth {...props} month={{ ...WITH_HR, status: 'FINALIZED', finalizedAt: '2026-11-20T09:00:00.000Z' }} />,
      'ar',
    );
    expect(screen.getByText('مُنهى · تم التحويل')).toBeTruthy();
    expect(button('إعادة إلى الموارد البشرية')).toBeNull();
  });
});
