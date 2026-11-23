import { HttpStatus, NotFoundException } from '@nestjs/common';
import { ErrorCode } from '@school-erp/shared';
import { CodedException } from '../../../../common/errors/coded.exception';
import type { EmployeesService } from '../../employees/services/employees.service';
import type { MonthLockService } from '../../month-lock/month-lock.service';
import type { HrSettingsService } from '../../settings/hr-settings.service';
import type { LatenessRepository } from '../repositories/lateness.repository';
import { LatenessService } from './lateness.service';

const emp = (id: string) => ({ id, code: `EMP-${id}`, nameEn: id, nameAr: id });
const DEPT = { id: 'd1', nameEn: 'Science', nameAr: 'العلوم' };

const RULE = {
  graceMinutes: 0,
  steps: [
    { hour: 1, days: 0.25 },
    { hour: 2, days: 0.5 },
  ],
  extraHourDays: 0.5,
};

function makeService(over: {
  stored?: { employeeId: string; minutes: number }[];
  locked?: boolean;
  assertActive?: jest.Mock;
  rule?: typeof RULE;
  /** The employees the user's `hr.lateness.edit` covers (default: all of them). */
  editable?: string[];
  /** The signed-in user's linked employee (M-2). */
  me?: string;
  /** The account-link check (fourth review H1). */
  linkCheck?: jest.Mock;
} = {}) {
  const calls: string[] = [];
  const repository = {
    findByMonth: jest.fn().mockResolvedValue(over.stored ?? []),
    upsertMany: jest.fn().mockImplementation(() => {
      calls.push('write');
      return Promise.resolve();
    }),
  };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const reminders = { latenessSaved: jest.fn().mockResolvedValue(undefined) };
  const employees = {
    listActiveRefs: jest.fn().mockResolvedValue([emp('1'), emp('2')]),
    listActiveWithDepartments: jest.fn().mockResolvedValue([
      { employee: emp('1'), department: DEPT },
      { employee: emp('2'), department: DEPT },
    ]),
    assertActive:
      over.assertActive ??
      jest.fn().mockImplementation(() => {
        calls.push('active');
        return Promise.resolve();
      }),
    // Scope first (edge case 3): outside `editable` → 404 before any other check.
    assertScopeFirst: jest.fn().mockImplementation((_key: string, ids: string[]) => {
      calls.push('scope');
      const editable = over.editable;
      return editable && ids.some((id) => !editable.includes(id))
        ? Promise.reject(new NotFoundException())
        : Promise.resolve();
    }),
  };
  // The whole HR settings, as HrSettingsService returns them: the month list must pass on only the
  // lateness rule (no payroll or penalty setting).
  const settings = {
    get: jest.fn().mockResolvedValue({
      lateness: over.rule ?? RULE,
      payroll: { dayDivisor: 30, partTime: { PART_TIME_4: 80, PART_TIME_3: 60, PART_TIME_2: 40 } },
      penalties: { repetitionWindow: 'ACADEMIC_YEAR' },
    }),
  };
  const monthLock = {
    isMonthLocked: jest.fn().mockResolvedValue(over.locked ?? false),
    assertMonthOpen: jest.fn().mockImplementation(() => {
      calls.push('lock');
      return over.locked
        ? Promise.reject(new CodedException(HttpStatus.CONFLICT, ErrorCode.PAYROLL_APPROVED))
        : Promise.resolve();
    }),
  };
  const service = new LatenessService(
    repository as unknown as LatenessRepository,
    employees as unknown as EmployeesService,
    settings as unknown as HrSettingsService,
    monthLock as unknown as MonthLockService,
    audit as never,
    { inTransaction: (fn: () => unknown) => fn(), run: (fn: () => unknown) => Promise.resolve(fn()) } as never,
    reminders as never,
    {
      actor: jest.fn().mockResolvedValue(over.me ? { userId: 'u-me', employeeId: over.me } : null),
      assertLinkedForPay: over.linkCheck ?? jest.fn().mockResolvedValue(undefined),
    } as never,
  );
  return { service, repository, employees, monthLock, calls, audit, reminders };
}

describe('LatenessService', () => {
  it('list: every active employee, 0 minutes when nothing stored, days from the rule', async () => {
    const { service } = makeService({ stored: [{ employeeId: '2', minutes: 61 }] });
    await expect(service.list('2026-11')).resolves.toEqual([
      { employee: emp('1'), department: DEPT, minutes: 0, days: 0 },
      { employee: emp('2'), department: DEPT, minutes: 61, days: 0.75 },
    ]);
  });

  it('month: the rows plus the month lock (locked false / true)', async () => {
    const open = makeService();
    await expect(open.service.month('2026-11')).resolves.toMatchObject({ locked: false });
    expect((await open.service.month('2026-11')).items).toHaveLength(2);
    const locked = makeService({ locked: true });
    await expect(locked.service.month('2026-11')).resolves.toMatchObject({ locked: true });
  });

  it('month: carries the lateness rule its days were computed with — only that rule, no other setting', async () => {
    const rule = { ...RULE, graceMinutes: 10 };
    const { service } = makeService({ stored: [{ employeeId: '1', minutes: 70 }], rule });
    const month = await service.month('2026-11');
    expect(Object.keys(month).sort()).toEqual(['items', 'limit', 'locked', 'page', 'rule', 'total', 'totals']);
    expect(month.rule).toEqual(rule);
    expect(Object.keys(month.rule).sort()).toEqual(['extraHourDays', 'graceMinutes', 'steps']);
    // 70 minutes, 10 of grace → 60 → hour 1 = 0.25 d: the rows use the very rule returned.
    expect(month.items[0]).toMatchObject({ minutes: 70, days: 0.25 });
  });

  it('month: pages and searches here (code or either name); the totals cover every row', async () => {
    const { service } = makeService({ stored: [{ employeeId: '1', minutes: 70 }, { employeeId: '2', minutes: 130 }] });
    const page2 = await service.month('2026-11', { page: 2, limit: 1 });
    expect(page2).toMatchObject({ total: 2, page: 2, limit: 1 });
    expect(page2.items.map((r) => r.employee.id)).toEqual(['2']);
    // 70 → 0.75 d, 130 → 1.25 d: every row, whatever the page.
    expect(page2.totals).toEqual({ employees: 2, minutes: 200, days: 2 });
    const found = await service.month('2026-11', { search: 'emp-1' });
    expect(found.items.map((r) => r.employee.id)).toEqual(['1']);
    expect(found.total).toBe(1);
    // The totals stay the month's: the search narrows the rows, not the summary.
    expect(found.totals.employees).toBe(2);
    expect((await service.month('2026-11', { search: 'nobody' })).items).toEqual([]);
    expect((await service.month('2026-11', { page: 5, limit: 10 })).items).toEqual([]);
  });

  it('put: answers with the month as it stands — lock, rule and totals, no rows', async () => {
    const { service } = makeService({ stored: [{ employeeId: '1', minutes: 70 }] });
    const saved = await service.put('2026-11', { entries: [{ employeeId: '1', minutes: 70 }] }, 'u1');
    expect(Object.keys(saved).sort()).toEqual(['locked', 'rule', 'totals']);
    expect(saved.totals).toEqual({ employees: 2, minutes: 70, days: 0.75 });
  });

  it('list: a stored row for an employee no longer active is not shown', async () => {
    const { service } = makeService({ stored: [{ employeeId: 'gone', minutes: 30 }] });
    const rows = await service.list('2026-11');
    expect(rows.map((r) => r.employee.id)).toEqual(['1', '2']);
  });

  it('list: days follow the current rule (grace 10 → 10 minutes cost 0)', async () => {
    const { service } = makeService({
      stored: [{ employeeId: '1', minutes: 10 }],
      rule: { ...RULE, graceMinutes: 10 },
    });
    expect((await service.list('2026-11'))[0]).toMatchObject({ minutes: 10, days: 0 });
  });

  it('put: checks the lock, then the scope, then the employees, then writes only the given entries', async () => {
    const { service, repository, calls } = makeService();
    await service.put('2026-11', { entries: [{ employeeId: '1', minutes: 120 }] }, 'u1');
    expect(calls).toEqual(['lock', 'scope', 'active', 'write']);
    expect(repository.upsertMany).toHaveBeenCalledWith(
      '2026-11',
      [{ employeeId: '1', minutes: 120 }],
      'u1',
    );
  });

  it('N3 edges 7 / 8 — a save (even all zeros) resolves the month’s lateness reminder; an empty save or a refused one does not', async () => {
    const zeros = makeService();
    await zeros.service.put('2026-11', { entries: [{ employeeId: '1', minutes: 0 }] }, 'u1');
    expect(zeros.reminders.latenessSaved).toHaveBeenCalledWith('2026-11', 'u1');

    const empty = makeService();
    await empty.service.put('2026-11', { entries: [] }, 'u1');
    expect(empty.reminders.latenessSaved).not.toHaveBeenCalled();

    const locked = makeService({ locked: true });
    await expect(
      locked.service.put('2026-11', { entries: [{ employeeId: '1', minutes: 5 }] }, 'u1'),
    ).rejects.toMatchObject({ code: ErrorCode.PAYROLL_APPROVED });
    expect(locked.reminders.latenessSaved).not.toHaveBeenCalled();
  });

  it('the month list asks for the employees hr.lateness.view covers (R5)', async () => {
    const { service, employees } = makeService();
    await service.month('2026-11');
    expect(employees.listActiveWithDepartments).toHaveBeenCalledWith('hr.lateness.view');
  });

  it('payroll’s list (no key) is school-wide', async () => {
    const { service, employees } = makeService();
    await service.list('2026-11');
    expect(employees.listActiveWithDepartments).toHaveBeenCalledWith(undefined);
  });

  it('edge case 3 — put for an employee outside hr.lateness.edit → 404, nothing written', async () => {
    const { service, repository } = makeService({ editable: ['1'] });
    await expect(
      service.put('2026-11', { entries: [{ employeeId: '1', minutes: 5 }, { employeeId: '2', minutes: 5 }] }, 'u1'),
    ).rejects.toMatchObject({ status: 404 });
    expect(repository.upsertMany).not.toHaveBeenCalled();
  });

  it('edge case 3 — outside the scope is 404 even when the employee is inactive (scope checked first)', async () => {
    const assertActive = jest
      .fn()
      .mockRejectedValue(new CodedException(HttpStatus.CONFLICT, ErrorCode.EMPLOYEE_INACTIVE));
    const { service } = makeService({ editable: ['1'], assertActive });
    await expect(
      service.put('2026-11', { entries: [{ employeeId: '2', minutes: 5 }] }, 'u1'),
    ).rejects.toMatchObject({ status: 404 });
    expect(assertActive).not.toHaveBeenCalled();
  });

  it('put on an approved month → PAYROLL_APPROVED, nothing written', async () => {
    const { service, repository } = makeService({ locked: true });
    await expect(
      service.put('2026-11', { entries: [{ employeeId: '1', minutes: 5 }] }, 'u1'),
    ).rejects.toMatchObject({ code: ErrorCode.PAYROLL_APPROVED });
    expect(repository.upsertMany).not.toHaveBeenCalled();
  });

  it('put with an inactive employee → EMPLOYEE_INACTIVE, nothing written', async () => {
    const assertActive = jest
      .fn()
      .mockRejectedValue(new CodedException(HttpStatus.CONFLICT, ErrorCode.EMPLOYEE_INACTIVE));
    const { service, repository } = makeService({ assertActive });
    await expect(
      service.put('2026-11', { entries: [{ employeeId: '1', minutes: 5 }] }, 'u1'),
    ).rejects.toMatchObject({ code: ErrorCode.EMPLOYEE_INACTIVE });
    expect(repository.upsertMany).not.toHaveBeenCalled();
  });

  it('M-2 — nobody changes their own lateness (403 OWN_PAY_CHANGE); their row sent back unchanged is fine', async () => {
    const { service, repository } = makeService({ me: '1', stored: [{ employeeId: '1', minutes: 30 }] });
    await expect(
      service.put('2026-11', { entries: [{ employeeId: '1', minutes: 0 }, { employeeId: '2', minutes: 5 }] }, 'u-me'),
    ).rejects.toMatchObject({ code: ErrorCode.OWN_PAY_CHANGE, status: 403 });
    expect(repository.upsertMany).not.toHaveBeenCalled();
    await service.put('2026-11', { entries: [{ employeeId: '1', minutes: 30 }, { employeeId: '2', minutes: 5 }] }, 'u-me');
    expect(repository.upsertMany).toHaveBeenCalled();
  });

  it('fourth review H1 — changing minutes needs a linked account; sending them back unchanged doesn’t ask', async () => {
    const refuse = jest.fn().mockRejectedValue(Object.assign(new Error('no'), { code: ErrorCode.ACCOUNT_NOT_LINKED }));
    const { service, repository } = makeService({ stored: [{ employeeId: '1', minutes: 30 }], linkCheck: refuse });
    await expect(service.put('2026-11', { entries: [{ employeeId: '1', minutes: 45 }] }, 'u')).rejects.toMatchObject({
      code: ErrorCode.ACCOUNT_NOT_LINKED,
    });
    expect(repository.upsertMany).not.toHaveBeenCalled();
    await service.put('2026-11', { entries: [{ employeeId: '1', minutes: 30 }] }, 'u');
    expect(refuse).toHaveBeenCalledTimes(1);
  });
});
