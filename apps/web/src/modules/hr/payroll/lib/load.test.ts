import { beforeEach, describe, expect, it, vi } from 'vitest';

const apis = vi.hoisted(() => ({
  GET_PAYROLL_RUN: vi.fn(),
  GET_PAYROLL_RUNS: vi.fn(),
  GET_PAYSLIP: vi.fn(),
}));
vi.mock('../apis', () => apis);
const employees = vi.hoisted(() => ({ GET_DEPARTMENTS: vi.fn() }));
vi.mock('../../employees/apis', () => employees);
const lateness = vi.hoisted(() => ({ GET_HR_SETTINGS: vi.fn() }));
vi.mock('../../lateness/apis', () => lateness);
const nav = vi.hoisted(() => ({
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));
vi.mock('next/navigation', () => nav);

import { MONA, run, SALMA, SETTINGS, summary as toSummary } from '../test/fixtures';
import { loadEmployeePayroll, loadPayslip, loadRun } from './load';

const ok = <T>(data: T) => ({ success: true, status: 200, data });

beforeEach(() => {
  for (const fn of [...Object.values(apis), employees.GET_DEPARTMENTS, lateness.GET_HR_SETTINGS]) fn.mockReset();
  employees.GET_DEPARTMENTS.mockResolvedValue(ok([]));
  lateness.GET_HR_SETTINGS.mockResolvedValue(ok(SETTINGS));
});

describe('payroll loaders', () => {
  it('a filtered run also reads the whole run, so "not applied" knows every employee', async () => {
    apis.GET_PAYROLL_RUN.mockImplementation((_id: string, query?: object) =>
      Promise.resolve(ok(query ? run({ lines: [SALMA] }) : run())),
    );
    const data = await loadRun('r1', { search: 'salma' });
    expect(apis.GET_PAYROLL_RUN).toHaveBeenCalledWith('r1', {
      search: 'salma',
    });
    expect(apis.GET_PAYROLL_RUN).toHaveBeenCalledWith('r1');
    expect(data.run.lines).toEqual([SALMA]);
    expect(data.runEmployeeIds).toEqual(['e-mona', 'e-salma']);
    expect(data.settings).toEqual(SETTINGS);
  });

  it('an unfiltered run is read once', async () => {
    apis.GET_PAYROLL_RUN.mockResolvedValue(ok(run()));
    await loadRun('r1', {});
    expect(apis.GET_PAYROLL_RUN).toHaveBeenCalledTimes(1);
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

  it("the profile tab keeps only the employee's own line (a code search also matches longer codes)", async () => {
    const summary = toSummary(run());
    apis.GET_PAYROLL_RUNS.mockResolvedValue(ok([summary, { ...summary, id: 'r-oct', month: '2026-10' }]));
    const lookalike = {
      ...SALMA,
      employeeId: 'e-other',
      employeeCode: 'EMP-00010',
    };
    apis.GET_PAYROLL_RUN.mockImplementation((id: string) =>
      Promise.resolve(ok(id === 'r-oct' ? run({ lines: [lookalike] }) : run({ lines: [MONA, lookalike] }))),
    );
    const rows = await loadEmployeePayroll({ id: 'e-mona', code: 'EMP-0001' });
    expect(apis.GET_PAYROLL_RUN).toHaveBeenCalledWith(summary.id, {
      search: 'EMP-0001',
    });
    expect(rows).toEqual([{ run: summary, line: MONA }]);
  });
});
