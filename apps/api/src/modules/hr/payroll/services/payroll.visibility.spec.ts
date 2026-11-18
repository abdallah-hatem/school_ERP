import type { Prisma } from '@prisma/client';
import { HR_SETTINGS_DEFAULTS, PAYROLL_LINE_MONEY_FIELDS } from '@school-erp/shared';
import type { DomainEvents } from '../../../../core/events';
import type { SettingsService } from '../../../../core/settings';
import { fakeAccess } from '../../access/hr-access.testing';
import type { EmployeeScope } from '../../access/employee-scope.pure';
import type { EmployeesService } from '../../employees/services/employees.service';
import type { PenaltyRecordsService } from '../../penalties/services/penalty-records.service';
import type { HrSettingsService } from '../../settings/hr-settings.service';
import type { LatenessService } from '../../staff-attendance/services/lateness.service';
import type { LineRow, PayrollRunsRepository } from '../repositories/payroll-runs.repository';
import { PayrollService, totalsMoneyVisible } from './payroll.service';

/*
 * P4 — payroll as each role sees it. The rule (R7, documented in shared `PayrollRunSummary`):
 * lines, adjustments and payslips only for the employees `hr.payroll.view` covers (else 404);
 * a line's money only when `hr.employees.view_salary` covers its employee; run totals always for a
 * whole-school viewer (the principal's "payroll totals"), and for a narrower viewer only when their
 * salary scope covers it all.
 */

const PRIMARY: EmployeeScope = { kind: 'stage', stageId: 'primary' };

const line = (employeeId: string): LineRow => ({
  id: `l-${employeeId}`,
  employeeId,
  employeeCode: employeeId,
  nameEn: employeeId,
  nameAr: employeeId,
  nationalId: null,
  departmentId: 'd1',
  departmentNameEn: 'D',
  departmentNameAr: 'D',
  basicSalary: 900000,
  workSystem: 'FULL_TIME',
  monthSalary: 900000,
  dayValue: 30000,
  penaltyDays: 1 as unknown as Prisma.Decimal,
  penaltyAmount: 30000,
  latenessMinutes: 0,
  latenessGraceMinutes: 0,
  latenessDays: 0 as unknown as Prisma.Decimal,
  latenessAmount: 0,
  adjustmentAdditions: 0,
  adjustmentDeductions: 0,
  net: 870000,
  flags: [],
});

const TOTALS = {
  employees: 2,
  monthSalary: 1800000,
  penaltyAmount: 30000,
  latenessAmount: 0,
  adjustmentAdditions: 0,
  adjustmentDeductions: 0,
  net: 1770000,
  flagged: 0,
};

function makeService(scopes: Parameters<typeof fakeAccess>[0], salaryIds: string[] = []) {
  const repository = {
    findRun: jest.fn().mockResolvedValue({ id: 'r1', month: '2026-10', status: 'APPROVED', approvedAt: new Date(), calculatedAt: new Date() }),
    list: jest.fn().mockResolvedValue({
      data: [{ id: 'r1', month: '2026-10', status: 'APPROVED', approvedAt: null }],
      total: 1,
      page: 1,
      limit: 10,
      hasNextPage: false,
      hasPreviousPage: false,
    }),
    totalsFor: jest.fn().mockResolvedValue(new Map([['r1', { ...TOTALS }]])),
    findLines: jest.fn().mockResolvedValue([line('e1')]),
    findLine: jest.fn().mockResolvedValue(line('e1')),
    findAdjustments: jest.fn().mockResolvedValue([
      {
        id: 'a1',
        employeeId: 'e1',
        type: 'ADDITION',
        amount: 5000,
        reason: 'Bonus',
        createdAt: new Date(),
        employee: { code: 'e1', nameEn: 'e1', nameAr: 'e1' },
      },
    ]),
    lineEmployeeIds: jest.fn().mockResolvedValue(new Set(['e1'])),
    listEmployeeLines: jest.fn().mockResolvedValue({
      data: [{ id: 'l-e1', net: 870000, run: { id: 'r1', month: '2026-10', status: 'APPROVED' } }],
      total: 1,
      page: 1,
      limit: 10,
      hasNextPage: false,
      hasPreviousPage: false,
    }),
  };
  const employees = {
    assertInScope: jest.fn().mockResolvedValue(undefined),
    filterInScope: jest.fn().mockResolvedValue(new Set(salaryIds)),
  };
  const penalties = {
    pendingCountInMonth: jest.fn().mockResolvedValue(0),
    approvedInMonth: jest.fn().mockResolvedValue([
      {
        date: '2026-10-05',
        violationNameEn: 'Late',
        violationNameAr: 'تأخير',
        level: 1,
        action: 'DEDUCT_DAYS',
        days: 1,
      },
    ]),
  };
  const school = { getSchoolSettings: jest.fn().mockResolvedValue({ nameEn: 'S', nameAr: 'S', logoUrl: null }) };
  const service = new PayrollService(
    repository as unknown as PayrollRunsRepository,
    employees as unknown as EmployeesService,
    penalties as unknown as PenaltyRecordsService,
    {} as unknown as LatenessService,
    // An extra key beside the HR rules: the run must pass on the rules only.
    { get: jest.fn().mockResolvedValue({ ...HR_SETTINGS_DEFAULTS, extra: { secret: 1 } }) } as unknown as HrSettingsService,
    school as unknown as SettingsService,
    { publish: jest.fn() } as unknown as DomainEvents,
    fakeAccess(scopes),
    { record: jest.fn() } as never,
    { inTransaction: (fn: () => unknown) => fn(), run: (fn: () => unknown) => Promise.resolve(fn()) } as never,
    {} as never,
  );
  return { service, repository, employees };
}

const PRINCIPAL = { 'hr.employees.view_salary': null } as const;
/** The Accountant: every run, with salaries. */
const ACCOUNTANT = {} as const;

describe('payroll — the run carries its rules (no hr.settings.view needed)', () => {
  it.each([
    ['principal', PRINCIPAL],
    ['accountant', ACCOUNTANT],
  ])('%s: the run holds the HR rules, and nothing but them', async (_who, scopes) => {
    const run = await makeService(scopes).service.get('r1');
    const { lateness, payroll, penalties } = HR_SETTINGS_DEFAULTS;
    expect(run.rules).toEqual({ lateness, payroll, penalties });
    // Not the employee rule (N0's probation length) either: the run's figures don't use it.
    expect(Object.keys(run.rules).sort()).toEqual(['lateness', 'payroll', 'penalties']);
  });

  it('the rules hold no money, whatever the viewer’s salary scope', async () => {
    const run = await makeService(PRINCIPAL).service.get('r1');
    const json = JSON.stringify(run.rules);
    for (const field of PAYROLL_LINE_MONEY_FIELDS) expect(json).not.toContain(field);
  });
});

describe('payroll — salary (R7)', () => {
  it('edge case 4 — a payroll viewer without the salary key sees lines without money', async () => {
    const { service } = makeService(PRINCIPAL);
    const run = await service.get('r1');
    expect(run.lines[0].salaryVisible).toBe(false);
    for (const field of PAYROLL_LINE_MONEY_FIELDS) expect(field in run.lines[0]).toBe(false);
    expect(run.lines[0]).toMatchObject({ employeeCode: 'e1', penaltyDays: 1 });
    expect(run.adjustments[0]).toMatchObject({ salaryVisible: false, reason: 'Bonus' });
    expect('amount' in run.adjustments[0]).toBe(false);
  });

  it('…but a whole-school viewer keeps the run totals (the principal’s payroll totals)', async () => {
    const { service } = makeService(PRINCIPAL);
    const run = await service.get('r1');
    expect(run.salaryVisible).toBe(true);
    expect(run.totals.net).toBe(1770000);
    const page = await service.list({});
    expect(page.data[0].totals.net).toBe(1770000);
  });

  it('with the salary key, every amount is present', async () => {
    const { service } = makeService({});
    const run = await service.get('r1');
    expect(run.lines[0]).toMatchObject({ salaryVisible: true, net: 870000, basicSalary: 900000 });
    expect(run.adjustments[0].amount).toBe(5000);
  });

  it('a payslip without the salary key has no amounts anywhere', async () => {
    const { service } = makeService(PRINCIPAL);
    const slip = await service.payslip('r1', 'l-e1');
    expect(slip.salaryVisible).toBe(false);
    expect('net' in slip).toBe(false);
    expect('amount' in slip.penalties[0]).toBe(false);
    expect('amount' in slip.adjustments[0]).toBe(false);
  });

  it('a payslip with the key itemises the penalty amount', async () => {
    const { service } = makeService({});
    const slip = await service.payslip('r1', 'l-e1');
    expect(slip.penalties[0].amount).toBe(30000);
    expect(slip.adjustments[0].amount).toBe(5000);
  });

  it('the profile Payroll tab: net only with the salary key', async () => {
    const hidden = await makeService(PRINCIPAL).service.employeeLines('e1', {});
    expect(hidden.data[0]).toMatchObject({ salaryVisible: false });
    expect('net' in hidden.data[0]).toBe(false);
    const shown = await makeService({ 'hr.employees.view_salary': PRIMARY }, ['e1']).service.employeeLines('e1', {});
    expect(shown.data[0]).toMatchObject({ salaryVisible: true, net: 870000 });
  });

  it('the bank sheet lists every net, so it needs every salary → 403 without it', async () => {
    const { service } = makeService({ 'hr.employees.view_salary': PRIMARY });
    await expect(service.bankSheet('r1', 'en')).rejects.toMatchObject({ status: 403 });
  });
});

describe('payroll — scopes (R5)', () => {
  it('a scoped payroll viewer gets only their employees’ lines, adjustments and totals', async () => {
    const { service, repository } = makeService({ 'hr.payroll.view': PRIMARY });
    await service.get('r1');
    expect(repository.findLines).toHaveBeenCalledWith('r1', {}, { stageId: 'primary' });
    expect(repository.findAdjustments).toHaveBeenCalledWith('r1', undefined, { stageId: 'primary' });
    expect(repository.totalsFor).toHaveBeenCalledWith(['r1'], { stageId: 'primary' });
  });

  it('a scoped viewer’s totals hide money unless their salary scope covers it', async () => {
    const without = await makeService({ 'hr.payroll.view': PRIMARY, 'hr.employees.view_salary': null }).service.get('r1');
    expect(without.salaryVisible).toBe(false);
    expect('net' in without.totals).toBe(false);
    expect(without.totals.employees).toBe(2);
    const covered = await makeService({ 'hr.payroll.view': PRIMARY, 'hr.employees.view_salary': PRIMARY }).service.get('r1');
    expect(covered.totals.net).toBe(1770000);
  });

  it('edge case 3 — a payslip outside the scope is 404', async () => {
    const { service, repository } = makeService({ 'hr.payroll.view': PRIMARY });
    repository.findLine.mockResolvedValueOnce(null);
    await expect(service.payslip('r1', 'l-e9')).rejects.toMatchObject({ status: 404 });
    expect(repository.findLine).toHaveBeenCalledWith('r1', 'l-e9', { stageId: 'primary' });
  });

  it('edge case 3 — an employee’s payroll lines outside the scope are 404', async () => {
    const { service, employees } = makeService({ 'hr.payroll.view': PRIMARY });
    employees.assertInScope.mockRejectedValueOnce(Object.assign(new Error('nf'), { status: 404 }));
    await expect(service.employeeLines('e9', {})).rejects.toMatchObject({ status: 404 });
    expect(employees.assertInScope).toHaveBeenCalledWith('hr.payroll.view', 'e9');
  });

  it('totalsMoneyVisible: whole school always; a narrower view only when salary covers it', () => {
    expect(totalsMoneyVisible({ lines: { kind: 'all' }, salary: { kind: 'none' } })).toBe(true);
    expect(totalsMoneyVisible({ lines: PRIMARY, salary: { kind: 'none' } })).toBe(false);
    expect(totalsMoneyVisible({ lines: PRIMARY, salary: PRIMARY })).toBe(true);
    expect(totalsMoneyVisible({ lines: PRIMARY, salary: { kind: 'all' } })).toBe(true);
  });
});
