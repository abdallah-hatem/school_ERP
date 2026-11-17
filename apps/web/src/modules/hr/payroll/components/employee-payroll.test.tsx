// @vitest-environment jsdom
import type { EmployeePayrollLine } from '@school-erp/shared';
import { cleanup, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => router,
  redirect: vi.fn(),
}));

import { renderPayroll } from '../test/fixtures';
import { EmployeePayroll, type EmployeePayrollProps } from './employee-payroll';

const NOV: EmployeePayrollLine = { runId: 'r-nov', lineId: 'l-nov', month: '2026-11', status: 'DRAFT', net: 1_350_000 };
const OCT: EmployeePayrollLine = { runId: 'r-oct', lineId: 'l-oct', month: '2026-10', status: 'APPROVED', net: 1_400_000 };

function renderTab(props: Partial<EmployeePayrollProps> = {}) {
  return renderPayroll(
    <EmployeePayroll
      payrollPath="/en/payroll"
      tabPath="/en/employees/e-mona/payroll"
      rows={[NOV, OCT]}
      total={2}
      page={1}
      limit={20}
      {...props}
    />,
  );
}

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe('EmployeePayroll (profile tab)', () => {
  it("lists the employee's line per run: payslip link once approved, the run while draft", () => {
    renderTab();
    const table = within(document.querySelector<HTMLElement>('[data-view="table"]')!);
    const octRow = table.getByText('October 2026').closest('tr') as HTMLElement;
    expect(
      within(octRow)
        .getByRole('link', { name: /Payslip/ })
        .getAttribute('href'),
    ).toBe('/en/payroll/r-oct/payslip/l-oct');
    expect(within(octRow).getByText('14,000.00')).toBeTruthy();
    const novRow = table.getByText('November 2026').closest('tr') as HTMLElement;
    expect(within(novRow).queryByRole('link', { name: /Payslip/ })).toBeNull();
    expect(within(novRow).getByRole('link', { name: 'Open run' }).getAttribute('href')).toBe('/en/payroll/r-nov');
  });

  it('pages through the server: the next page goes into the URL without scrolling', async () => {
    renderTab({ total: 45, limit: 20 });
    await userEvent.click(screen.getAllByRole('button', { name: /next/i })[0]!);
    expect(router.push).toHaveBeenCalledWith('/en/employees/e-mona/payroll?page=2', { scroll: false });
  });

  it('empty and failed states differ', () => {
    const { unmount } = renderTab({ rows: [], total: 0 });
    expect(screen.getByText('No payroll yet')).toBeTruthy();
    unmount();
    renderTab({ rows: null, total: 0 });
    expect(screen.getByRole('alert')).toBeTruthy();
  });
});
