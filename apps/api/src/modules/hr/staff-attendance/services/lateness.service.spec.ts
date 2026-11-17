import { HttpStatus } from '@nestjs/common';
import { ErrorCode } from '@school-erp/shared';
import { CodedException } from '../../../../common/errors/coded.exception';
import type { EmployeesService } from '../../employees/services/employees.service';
import type { MonthLockService } from '../../month-lock/month-lock.service';
import type { HrSettingsService } from '../../settings/hr-settings.service';
import type { LatenessRepository } from '../repositories/lateness.repository';
import { LatenessService } from './lateness.service';

const emp = (id: string) => ({ id, code: `EMP-${id}`, nameEn: id, nameAr: id });

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
} = {}) {
  const calls: string[] = [];
  const repository = {
    findByMonth: jest.fn().mockResolvedValue(over.stored ?? []),
    upsertMany: jest.fn().mockImplementation(() => {
      calls.push('write');
      return Promise.resolve();
    }),
  };
  const employees = {
    listActiveRefs: jest.fn().mockResolvedValue([emp('1'), emp('2')]),
    assertActive:
      over.assertActive ??
      jest.fn().mockImplementation(() => {
        calls.push('active');
        return Promise.resolve();
      }),
  };
  const settings = { get: jest.fn().mockResolvedValue({ lateness: over.rule ?? RULE }) };
  const monthLock = {
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
  );
  return { service, repository, employees, monthLock, calls };
}

describe('LatenessService', () => {
  it('list: every active employee, 0 minutes when nothing stored, days from the rule', async () => {
    const { service } = makeService({ stored: [{ employeeId: '2', minutes: 61 }] });
    await expect(service.list('2026-11')).resolves.toEqual([
      { employee: emp('1'), minutes: 0, days: 0 },
      { employee: emp('2'), minutes: 61, days: 0.75 },
    ]);
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

  it('put: checks the lock, then the employees, then writes only the given entries', async () => {
    const { service, repository, calls } = makeService();
    await service.put('2026-11', { entries: [{ employeeId: '1', minutes: 120 }] }, 'u1');
    expect(calls).toEqual(['lock', 'active', 'write']);
    expect(repository.upsertMany).toHaveBeenCalledWith(
      '2026-11',
      [{ employeeId: '1', minutes: 120 }],
      'u1',
    );
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
});
