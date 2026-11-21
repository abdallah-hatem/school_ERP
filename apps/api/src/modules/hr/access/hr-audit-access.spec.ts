import { AuditRecordAccess } from '../../../core/audit';
import type { EmployeesService } from '../employees/services/employees.service';
import type { PenaltyRecordsService } from '../penalties/services/penalty-records.service';
import { fakeAccess } from './hr-access.testing';
import { HrAuditAccess } from './hr-audit-access';

/* P4 — which HR records' audit entries a viewer may read (Activity, History, summary, people). */

const PRIMARY = { kind: 'stage', stageIds: ['primary'] } as const;

function setup(scopes: Parameters<typeof fakeAccess>[0]) {
  const audit = new AuditRecordAccess();
  new HrAuditAccess(
    audit,
    fakeAccess(scopes),
    {
      idsInViewScope: jest.fn().mockResolvedValue(['e1']),
      idsWithCode: jest.fn((q: string) => Promise.resolve(q === 'EMP-0001' ? ['e1'] : [])),
    } as unknown as EmployeesService,
    {
      idsInViewScope: jest.fn().mockResolvedValue('all'),
      idsOfEmployee: jest.fn((id: string) => Promise.resolve(id === 'e1' ? ['p1'] : [])),
      idsWithEmployeeCode: jest.fn((q: string) => Promise.resolve(q === 'EMP-0001' ? ['p1'] : [])),
    } as unknown as PenaltyRecordsService,
  ).onModuleInit();
  return audit;
}

describe('HrAuditAccess', () => {
  it('a scoped viewer: only their employees; lateness months and payroll runs (other people’s figures) hidden', async () => {
    const audit = setup({ 'hr.lateness.view': PRIMARY, 'hr.payroll.view': PRIMARY });
    expect(await audit.restrictions()).toEqual([
      { entityType: 'employee', ids: ['e1'] },
      { entityType: 'lateness_month', ids: [] },
      { entityType: 'payroll_run', ids: [] },
    ]);
    await expect(audit.canSee('payroll_run', 'r1')).resolves.toBe(false);
    await expect(audit.canSee('employee', 'e1')).resolves.toBe(true);
    await expect(audit.canSee('employee', 'e2')).resolves.toBe(false);
  });

  it('a whole-school viewer sees lateness months and payroll runs', async () => {
    const audit = setup({});
    await expect(audit.canSee('lateness_month', '2026-11')).resolves.toBe(true);
    await expect(audit.canSee('payroll_run', 'r1')).resolves.toBe(true);
  });

  it('an employee’s History takes in their penalties; search finds both by the employee’s code (T29, T31)', async () => {
    const audit = setup({});
    await expect(audit.historyRecords('employee', 'e1')).resolves.toEqual([
      { entityType: 'employee', ids: ['e1'] },
      { entityType: 'penalty', ids: ['p1'] },
    ]);
    await expect(audit.historyRecords('employee', 'e2')).resolves.toEqual([{ entityType: 'employee', ids: ['e2'] }]);
    await expect(audit.searchMatches('EMP-0001')).resolves.toEqual([
      { entityType: 'employee', ids: ['e1'] },
      { entityType: 'penalty', ids: ['p1'] },
    ]);
    await expect(audit.searchMatches('nobody')).resolves.toEqual([]);
  });
});
