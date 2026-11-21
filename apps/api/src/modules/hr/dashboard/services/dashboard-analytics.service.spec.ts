import { BadRequestException, ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { PERMISSION_KEYS, dashboardAnalyticsQuerySchema, type AuthUser, type PermissionKey } from '@school-erp/shared';
import { SchemaPipe } from '../../../../common/pipes/schema.pipe';
import { PermissionGuard, type PermissionsService } from '../../../../core/permissions';
import type { EmployeeScope } from '../../access/employee-scope.pure';
import { fakeAccess } from '../../access/hr-access.testing';
import type { EmployeesService } from '../../employees/services/employees.service';
import { DashboardController } from '../controllers/dashboard.controller';
import type { DashboardAnalyticsRepository } from '../repositories/dashboard-analytics.repository';
import { DashboardAnalyticsService } from './dashboard-analytics.service';

const NOW = new Date('2026-11-21T10:00:00Z');
const PRIMARY: EmployeeScope = { kind: 'stage', stageIds: ['primary'] };
const PRIMARY_EMPLOYEES = { OR: [{ stageId: { in: ['primary'] } }, { otherStages: { some: { stageId: { in: ['primary'] } } } }] };

function makeService(scopes: Partial<Record<PermissionKey, EmployeeScope | null>> = {}) {
  const repository = {
    countApprovedRuns: jest.fn().mockResolvedValue(3),
    approvedRunsIn: jest.fn().mockResolvedValue([
      { id: 'r9', month: '2026-09' },
      { id: 'r10', month: '2026-10' },
    ]),
    lineTotals: jest.fn().mockImplementation((_ids: string[], scope: object) =>
      Promise.resolve(
        new Map([
          ['r9', { net: Object.keys(scope).length ? 10 : 1_000, penaltyAmount: 5, latenessAmount: 5, employees: 2 }],
          ['r10', { net: Object.keys(scope).length ? 20 : 2_000, penaltyAmount: 10, latenessAmount: 0, employees: 2 }],
        ]),
      ),
    ),
    workedOutTaxes: jest.fn().mockResolvedValue(new Map([['r10', { insurance: 200, incomeTax: 90, martyrTax: 10 }]])),
    employeeDates: jest.fn().mockResolvedValue([{ hireDate: '2026-10-05', deactivatedOn: null, active: true }]),
    approvedPenaltyCounts: jest.fn().mockResolvedValue([{ date: '2026-11-03', action: 'NOTICE', count: 2 }]),
    latenessMinutes: jest.fn().mockResolvedValue([{ month: '2026-11', minutes: 45 }]),
    noStageIds: jest.fn().mockResolvedValue(new Set(['s'])),
  };
  const employees = {
    activeHeadcount: jest.fn().mockResolvedValue({ active: 1, byStage: [{ stage: { id: 's', nameEn: 'S', nameAr: 'س' }, count: 1 }] }),
  };
  const service = new DashboardAnalyticsService(
    repository as unknown as DashboardAnalyticsRepository,
    employees as unknown as EmployeesService,
    fakeAccess(scopes),
  );
  return { service, repository, employees };
}

describe('DashboardAnalyticsService', () => {
  it('the whole school with every salary: every chart, the range ending this month (school clock)', async () => {
    const { service, repository } = makeService();
    const a = await service.get(12, NOW);
    expect(a.range).toBe(12);
    expect(a.months[11]).toBe('2026-11');
    expect(a.months).toHaveLength(12);
    // The month before the range is read too, for the first month's change.
    expect(repository.approvedRunsIn.mock.calls[0]![0]).toHaveLength(13);
    expect(a.approvedMonths).toBe(3);
    expect(a.latestApproved).toBe('2026-10');
    expect(a.payroll!.find((p) => p.month === '2026-10')).toEqual({ month: '2026-10', net: 2_000, employees: 2, change: 1_000 });
    expect(a.deductions).toMatchObject({ month: '2026-10', gross: 2_310 });
    expect(a.headcountByStage).toEqual([{ stage: { id: 's', nameEn: 'S', nameAr: 'س' }, count: 1, share: 1, noStage: true }]);
    expect(a.flow!.find((f) => f.month === '2026-10')!.joiners).toBe(1);
    expect(a.penalties!.at(-1)!.notice).toBe(2);
    expect(a.lateness!.at(-1)!.minutes).toBe(45);
  });

  it('just after midnight in Cairo it is already the next month', async () => {
    const { service } = makeService();
    const a = await service.get(6, new Date('2026-11-30T22:30:00Z'));
    expect(a.months.at(-1)).toBe('2026-12');
  });

  it('a principal (payroll for the whole school, no salaries): payroll totals, but no deductions (§10)', async () => {
    const { service, repository } = makeService({ 'hr.employees.view_salary': null });
    const a = await service.get(6, NOW);
    expect(a.payroll).not.toBeNull();
    expect(a.deductions).toBeNull();
    expect(a.deductionTrend).toBeNull();
    expect(repository.workedOutTaxes).not.toHaveBeenCalled();
  });

  it('a stage head: their stage’s rows only; no money without a salary scope covering them (R7)', async () => {
    const { service, repository } = makeService({
      'hr.employees.view': PRIMARY,
      'hr.penalties.view': PRIMARY,
      'hr.lateness.view': null,
      'hr.payroll.view': PRIMARY,
      'hr.employees.view_salary': null,
    });
    const a = await service.get(6, NOW);
    expect(repository.employeeDates).toHaveBeenCalledWith(PRIMARY_EMPLOYEES);
    expect(repository.approvedPenaltyCounts.mock.calls[0]![1]).toEqual({ stageId: { in: ['primary'] } });
    expect(a.payroll).toBeNull();
    expect(a.lateness).toBeNull();
    expect(a.deductions).toBeNull();
    expect(repository.latenessMinutes).not.toHaveBeenCalled();
  });

  it('a stage head whose salary scope covers their stage: their lines’ totals, still no deductions', async () => {
    const { service, repository } = makeService({ 'hr.payroll.view': PRIMARY, 'hr.employees.view_salary': PRIMARY });
    const a = await service.get(6, NOW);
    expect(repository.lineTotals).toHaveBeenCalledWith(['r9', 'r10'], PRIMARY_EMPLOYEES);
    expect(a.payroll!.find((p) => p.month === '2026-10')!.net).toBe(20);
    expect(a.deductions).toBeNull();
  });

  it('without the screens’ permissions every part is null (the charts section shows nothing)', async () => {
    const { service, employees } = makeService({
      'hr.employees.view': null,
      'hr.penalties.view': null,
      'hr.lateness.view': null,
      'hr.payroll.view': null,
      'hr.employees.view_salary': null,
    });
    const a = await service.get(6, NOW);
    expect(a).toMatchObject({ payroll: null, headcountByStage: null, flow: null, penalties: null, lateness: null, deductions: null });
    expect(employees.activeHeadcount).not.toHaveBeenCalled();
  });

  it('an approved month accounting hasn’t worked out yet is left out of the deductions', async () => {
    const { service, repository } = makeService();
    repository.workedOutTaxes.mockResolvedValueOnce(new Map());
    const a = await service.get(6, NOW);
    expect(a.deductions).toBeNull();
    expect(a.deductionTrend).toEqual([]);
  });
});

describe('GET /hr/dashboard/analytics — the range and the permission', () => {
  const pipe = new SchemaPipe(dashboardAnalyticsQuerySchema);

  it('months is 6 or 12 (default 6); anything else is a 400', () => {
    expect(pipe.transform({ months: '12' })).toEqual({ months: 12 });
    expect(pipe.transform({})).toEqual({ months: 6 });
    expect(pipe.transform(undefined)).toEqual({ months: 6 });
    for (const months of ['0', '5', '7', '24', 'x']) expect(() => pipe.transform({ months })).toThrow(BadRequestException);
    expect(() => pipe.transform({ months: '6', extra: '1' })).toThrow(BadRequestException);
  });

  const user: AuthUser = { id: 'u', email: 'u@school.test', name: 'U', mustChangePassword: false };
  const ctx = {
    getHandler: () => DashboardController.prototype.getAnalytics,
    getClass: () => DashboardController,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
  const guardHolding = (keys: readonly PermissionKey[]) =>
    new PermissionGuard({ permissionsFor: () => Promise.resolve([...keys]) } as unknown as PermissionsService);

  it('a user without hr.dashboard.view_analytics gets 403 — the HR manager’s keys included', async () => {
    const hrManager = PERMISSION_KEYS.filter((k) => k.startsWith('hr.') && k !== 'hr.dashboard.view_analytics');
    await expect(guardHolding(hrManager).canActivate(ctx)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(guardHolding([]).canActivate(ctx)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('with it (the System admin holds every key) the request goes through', async () => {
    await expect(guardHolding(PERMISSION_KEYS).canActivate(ctx)).resolves.toBe(true);
    await expect(guardHolding(['hr.dashboard.view_analytics']).canActivate(ctx)).resolves.toBe(true);
  });
});
