// @vitest-environment jsdom
import '@/test/dom-polyfills';
import { cleanup, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

let pathname = '/en/employees/e-mona';
vi.mock('next/navigation', () => ({
  usePathname: () => pathname,
  useParams: () => ({ id: 'e-mona' }),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  redirect: vi.fn(),
}));
vi.mock('next/link', async () => ({ default: (await import('../test/fixtures')).MockLink }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('../apis', () => ({
  CREATE_EMPLOYEE: vi.fn(),
  GET_DEPARTMENTS: vi.fn(),
  GET_STAGES: vi.fn(),
  GET_JOB_TITLES: vi.fn(),
  GET_EMPLOYEE_GRADES: vi.fn(),
  GET_MANAGER_OPTIONS: vi.fn(),
  UPDATE_EMPLOYEE: vi.fn(),
  DEACTIVATE_EMPLOYEE: vi.fn(),
  REACTIVATE_EMPLOYEE: vi.fn(),
}));

import { EMPLOYEE_SALARY_FIELDS, type Employee } from '@school-erp/shared';
import { sessionWith, STAGE_HEAD_KEYS, TEST_SESSION } from '@/test/render';
import { employee, renderEmployees, summary } from '../test/fixtures';
import { EmployeeCard } from './employee-card';
import { EmployeeForm } from './employee-form';
import { EmployeeDetails, ProfileTabs } from './employee-profile';
import { EmployeeDetailsSkeleton } from './employees-skeletons';

/*
 * P4 (R6 + R7): what a Stage head sees of an employee — the tabs, sections and card fields their
 * roles allow, and no salary anywhere — next to the HR manager, who still sees everything.
 */

const STAGE_HEAD = sessionWith(...STAGE_HEAD_KEYS);

/** The employee as the API answers a viewer without `hr.employees.view_salary`. */
const withoutSalary: Employee = (() => {
  const copy: Record<string, unknown> = { ...employee, insuranceStatus: 'INSURED', insuranceNumber: '123', salaryVisible: false };
  for (const field of EMPLOYEE_SALARY_FIELDS) delete copy[field];
  return copy as unknown as Employee;
})();
const withSalary: Employee = {
  ...employee,
  insuranceStatus: 'INSURED',
  insuranceNumber: '123',
  insuranceRegistrationDate: '2024-01-01',
  insuredSalary: 800_000,
  bankName: 'National Bank',
  iban: 'EG380019000500000000263180002',
};

afterEach(cleanup);

describe('profile tabs (R6)', () => {
  it('a Stage head sees Details, Contracts and Penalties — no Payroll, no History', () => {
    renderEmployees(<ProfileTabs profileHref="/en/employees/e-mona" />, 'en', STAGE_HEAD);
    expect(screen.getAllByRole('link').map((l) => l.textContent)).toEqual(['Details', 'Contracts', 'Penalties']);
  });

  it('without hr.penalties.view the Penalties tab goes too', () => {
    renderEmployees(<ProfileTabs profileHref="/en/employees/e-mona" />, 'en', sessionWith('hr.employees.view'));
    expect(screen.getAllByRole('link').map((l) => l.textContent)).toEqual(['Details']);
  });

  it('the HR manager still sees every tab', () => {
    renderEmployees(<ProfileTabs profileHref="/en/employees/e-mona" />, 'en', TEST_SESSION);
    expect(screen.getAllByRole('link')).toHaveLength(5);
  });
});

describe('profile Details (R7)', () => {
  it('edge case 4 — without the salary: no basic salary, no insured salary, no bank account card', () => {
    renderEmployees(<EmployeeDetails employee={withoutSalary} />, 'en', STAGE_HEAD);
    expect(screen.queryByText('Basic monthly salary (net)')).toBeNull();
    expect(screen.queryByText('Insured salary')).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Bank account' })).toBeNull();
    // The rest of the record is there, contract dates included.
    expect(screen.getByRole('heading', { name: 'Pay and contract' })).toBeTruthy();
    expect(screen.getByText('123')).toBeTruthy();
  });

  it('N0 edge 9 — the probation end is not salary-type: a Stage head sees it; empty reads "No probation"', () => {
    renderEmployees(<EmployeeDetails employee={withoutSalary} />, 'en', STAGE_HEAD);
    const item = screen.getByText('Probation ends').closest('div')!;
    expect(within(item).getByText('30 Nov 2020')).toBeTruthy();
    cleanup();
    renderEmployees(<EmployeeDetails employee={{ ...withoutSalary, probationEnd: null }} />, 'ar', STAGE_HEAD);
    const ar = screen.getByText('نهاية فترة الاختبار').closest('div')!;
    expect(within(ar).getByText('بدون فترة اختبار')).toBeTruthy();
  });

  it('the Details skeleton has the probation line in the same place', () => {
    renderEmployees(<EmployeeDetailsSkeleton />, 'en', STAGE_HEAD);
    const job = screen.getByRole('heading', { name: 'Job' }).closest('section')!;
    const labels = within(job).getAllByRole('term').map((t) => t.textContent);
    expect(labels.slice(0, 3)).toEqual(['Employee code', 'Hire date', 'Probation ends']);
  });

  it('with the salary: every salary field and the bank card', () => {
    renderEmployees(<EmployeeDetails employee={withSalary} />);
    expect(screen.getByText('Basic monthly salary (net)')).toBeTruthy();
    expect(screen.getByText('Insured salary')).toBeTruthy();
    const bank = screen.getByRole('heading', { name: 'Bank account' }).closest('section')!;
    expect(within(bank).getByText('National Bank')).toBeTruthy();
  });

  it('Arabic: the same sections are gone', () => {
    renderEmployees(<EmployeeDetails employee={withoutSalary} />, 'ar', STAGE_HEAD);
    expect(screen.queryByRole('heading', { name: 'الحساب البنكي' })).toBeNull();
  });

  it('the skeleton matches: no salary line and no bank card without the key', () => {
    renderEmployees(<EmployeeDetailsSkeleton />, 'en', STAGE_HEAD);
    expect(screen.queryByText('Basic monthly salary (net)')).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Bank account' })).toBeNull();
    cleanup();
    renderEmployees(<EmployeeDetailsSkeleton />);
    expect(screen.getByText('Basic monthly salary (net)')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Bank account' })).toBeTruthy();
  });
});

describe('employee card (R6, R7)', () => {
  const card = (salaryVisible: boolean) => {
    const row = summary({ id: 'e-1', code: 'EMP-0001', nameEn: 'Mona Khalil', nameAr: 'منى خليل', salaryVisible });
    if (!salaryVisible) delete (row as { basicSalary?: number }).basicSalary;
    return row;
  };

  it('a Stage head: no salary on the card and no Edit button', () => {
    renderEmployees(<EmployeeCard employee={card(false)} band="band-1" href="/en/employees/e-1" />, 'en', STAGE_HEAD);
    const article = screen.getByRole('article', { name: 'Mona Khalil' });
    expect(within(article).queryByText('Basic salary')).toBeNull();
    expect(within(article).queryByText('12,000.00')).toBeNull();
    expect(within(article).queryByRole('link', { name: /Edit/ })).toBeNull();
    expect(within(article).getByRole('link', { name: /View/ })).toBeTruthy();
  });

  it('the HR manager: the salary and Edit', () => {
    renderEmployees(<EmployeeCard employee={card(true)} band="band-1" href="/en/employees/e-1" />);
    const article = screen.getByRole('article', { name: 'Mona Khalil' });
    expect(within(article).getByText('12,000.00')).toBeTruthy();
    expect(within(article).getByRole('link', { name: 'Edit Mona Khalil' })).toBeTruthy();
  });
});

describe('employee form (R7)', () => {
  const renderForm = (editing: Employee, session = TEST_SESSION) =>
    renderEmployees(
      <EmployeeForm
        basePath="/en/employees"
        employee={editing}
      />,
      'en',
      session,
    );

  it('editing an employee whose salary the user can’t see: no salary fields, no bank section', () => {
    renderForm(withoutSalary, sessionWith('hr.employees.view', 'hr.employees.edit'));
    expect(screen.queryByLabelText(/Basic monthly salary/)).toBeNull();
    expect(screen.queryByLabelText(/Insured salary/)).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Bank account' })).toBeNull();
    expect(screen.getByRole('heading', { name: 'Pay and contract' })).toBeTruthy();
  });

  it('with the salary: the fields are there', () => {
    renderForm(withSalary);
    expect(screen.getByLabelText(/Basic monthly salary/)).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Bank account' })).toBeTruthy();
  });
});

// Keep `pathname` used (the tabs read it).
pathname = '/en/employees/e-mona';
