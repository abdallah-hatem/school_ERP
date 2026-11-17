// @vitest-environment jsdom
import { cleanup, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  redirect: vi.fn(),
}));

import { MONA, renderPayroll, summary } from '../test/fixtures';
import { EmployeePayroll } from './employee-payroll';

const nov = summary();
const oct = {
  ...nov,
  id: 'r-oct',
  month: '2026-10',
  status: 'APPROVED' as const,
  approvedAt: '2026-10-31T09:00:00.000Z',
};

afterEach(cleanup);

describe('EmployeePayroll (profile tab)', () => {
  it("lists the employee's line per run: payslip link once approved, the run while draft", () => {
    renderPayroll(
      <EmployeePayroll
        payrollPath="/en/payroll"
        rows={[
          { run: nov, line: MONA },
          { run: oct, line: { ...MONA, id: 'l-oct' } },
        ]}
      />,
    );
    const table = within(document.querySelector<HTMLElement>('[data-view="table"]')!);
    const octRow = table.getByText('October 2026').closest('tr') as HTMLElement;
    expect(
      within(octRow)
        .getByRole('link', { name: /Payslip/ })
        .getAttribute('href'),
    ).toBe('/en/payroll/r-oct/payslip/l-oct');
    const novRow = table.getByText('November 2026').closest('tr') as HTMLElement;
    expect(within(novRow).queryByRole('link', { name: /Payslip/ })).toBeNull();
    expect(within(novRow).getByRole('link', { name: 'Open run' }).getAttribute('href')).toBe(`/en/payroll/${nov.id}`);
  });

  it('empty and failed states differ', () => {
    const { unmount } = renderPayroll(<EmployeePayroll payrollPath="/en/payroll" rows={[]} />);
    expect(screen.getByText('No payroll yet')).toBeTruthy();
    unmount();
    renderPayroll(<EmployeePayroll payrollPath="/en/payroll" rows={null} />);
    expect(screen.getByRole('alert')).toBeTruthy();
  });
});
