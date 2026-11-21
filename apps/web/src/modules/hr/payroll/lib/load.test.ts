import { beforeEach, describe, expect, it, vi } from 'vitest';

const apis = vi.hoisted(() => ({
  GET_EMPLOYEE_PAYROLL_LINES: vi.fn(),
  GET_PAYROLL_RUN: vi.fn(),
  GET_PAYROLL_RUNS: vi.fn(),
  GET_PAYSLIP: vi.fn(),
}));
vi.mock('../apis', () => apis);
const employees = vi.hoisted(() => ({ GET_DEPARTMENTS: vi.fn() }));
vi.mock('../../employees/apis', () => employees);
const nav = vi.hoisted(() => ({
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));
vi.mock('next/navigation', () => nav);

import { run, SALMA, SETTINGS } from '../test/fixtures';
import { loadEmployeePayroll, loadPayslip, loadRun, loadRunLines } from './load';

const ok = <T>(data: T) => ({ success: true, status: 200, data });

beforeEach(() => {
  for (const fn of [...Object.values(apis), employees.GET_DEPARTMENTS]) fn.mockReset();
  employees.GET_DEPARTMENTS.mockResolvedValue(ok([]));
});

describe('payroll loaders', () => {
  it('a filtered run is read once — the API marks which adjustments apply', async () => {
    apis.GET_PAYROLL_RUN.mockResolvedValue(ok(run({ lines: [SALMA] })));
    const data = await loadRun('r1', { search: 'salma' });
    expect(apis.GET_PAYROLL_RUN).toHaveBeenCalledTimes(1);
    expect(apis.GET_PAYROLL_RUN).toHaveBeenCalledWith('r1', {
      search: 'salma',
    });
    expect(data.run.lines).toEqual([SALMA]);
    // The rules come with the run (no HR settings read, which a Principal or Accountant can't make).
    expect(data.run.rules).toEqual(SETTINGS);
    expect(data).not.toHaveProperty('settings');
  });

  it('an unfiltered run is read once', async () => {
    apis.GET_PAYROLL_RUN.mockResolvedValue(ok(run()));
    await loadRun('r1', {});
    expect(apis.GET_PAYROLL_RUN).toHaveBeenCalledTimes(1);
  });

  it('the Employees tab reads the run only when the URL filters or pages (else it shows the layout’s run)', async () => {
    const unfiltered = await loadRunLines('r1', {}, false);
    expect(apis.GET_PAYROLL_RUN).not.toHaveBeenCalled();
    // No department chosen: no list read (the filter asks the API when it opens).
    expect(employees.GET_DEPARTMENTS).not.toHaveBeenCalled();
    expect(unfiltered).toEqual({ filtered: null, selectedDepartment: null });

    apis.GET_PAYROLL_RUN.mockResolvedValue(ok(run({ lines: [SALMA] })));
    const filtered = await loadRunLines('r1', { search: 'salma', page: 2, limit: 50 }, true);
    expect(apis.GET_PAYROLL_RUN).toHaveBeenCalledTimes(1);
    expect(apis.GET_PAYROLL_RUN).toHaveBeenCalledWith('r1', { search: 'salma', page: 2, limit: 50 });
    expect(filtered.filtered?.run.lines).toEqual([SALMA]);
  });

  it('a chosen department: only its name is read (hidden ones too)', async () => {
    employees.GET_DEPARTMENTS.mockResolvedValue(ok([{ id: 'd1', nameEn: 'Old', nameAr: 'قديم', isActive: false, sortOrder: 1 }]));
    const data = await loadRunLines('r1', { departmentId: 'd1' }, false);
    expect(employees.GET_DEPARTMENTS).toHaveBeenCalledWith({ ids: ['d1'], includeHidden: true });
    expect(data.selectedDepartment).toMatchObject({ id: 'd1', nameEn: 'Old' });
  });

  it('an unknown run is the not-found page', async () => {
    apis.GET_PAYROLL_RUN.mockResolvedValue({
      success: false,
      status: 404,
      message: 'Not found.',
    });
    await expect(loadRun('r1', {})).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('a draft run\'s payslip (409) becomes the "no payslip yet" state', async () => {
    apis.GET_PAYSLIP.mockResolvedValue({
      success: false,
      status: 409,
      error: 'PAYROLL_NOT_APPROVED',
      message: 'Available only after the payroll is approved.',
    });
    expect(await loadPayslip('r1', 'l1')).toEqual({
      kind: 'draft',
      error: 'PAYROLL_NOT_APPROVED',
      message: 'Available only after the payroll is approved.',
    });
  });

  it('the profile tab reads one paginated history request — no per-run reads', async () => {
    const line = { runId: 'r-oct', lineId: 'l-oct', month: '2026-10', status: 'APPROVED', net: 1_400_000 };
    apis.GET_EMPLOYEE_PAYROLL_LINES.mockResolvedValue({ ...ok([line]), meta: { total: 25 } });
    expect(await loadEmployeePayroll('e-mona', { page: 2, limit: 12 })).toEqual({ rows: [line], total: 25 });
    expect(apis.GET_EMPLOYEE_PAYROLL_LINES).toHaveBeenCalledWith('e-mona', { page: 2, limit: 12 });
    expect(apis.GET_PAYROLL_RUNS).not.toHaveBeenCalled();
    expect(apis.GET_PAYROLL_RUN).not.toHaveBeenCalled();
  });

  it('the profile tab is an error state (null rows) when the history fails', async () => {
    apis.GET_EMPLOYEE_PAYROLL_LINES.mockResolvedValue({ success: false, status: 502, message: 'x' });
    expect(await loadEmployeePayroll('e-mona', { page: 1, limit: 10 })).toEqual({ rows: null, total: 0 });
  });
});
