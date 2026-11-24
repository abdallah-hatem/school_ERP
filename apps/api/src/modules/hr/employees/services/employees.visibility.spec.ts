import type { DomainEvents } from '../../../../core/events';
import type { AuditService } from '../../../../core/audit';
import type { UsersService } from '../../../../core/users';
import type { FileStorageService } from '../../../../core/settings';
import type { AfterCommit } from '../../../../database/transactions';
import { fakeAccess } from '../../access/hr-access.testing';
import type { EmployeeScope } from '../../access/employee-scope.pure';
import type { DepartmentsService } from '../../lists/services/departments.service';
import type { JobTitlesService } from '../../lists/services/job-titles.service';
import type {
  EmployeeDetailRow,
  EmployeesRepository,
  EmployeeSummaryRow,
} from '../repositories/employees.repository';
import type { HrRemindersService } from '../../reminders/hr-reminders.service';
import type { HrSettingsService } from '../../settings/hr-settings.service';
import { EmployeesService } from './employees.service';
import type { ContractRecords } from '../../contracts/services/contract-records.service';

/*
 * P4 — what each role can see of employees: scopes (R5, edge case 3) and salary (R7, edge case 4).
 * The scope rules themselves are pinned in access/employee-scope.pure.spec.ts; these check that the
 * service applies them on every read and write.
 */

const ref = (id: string) => ({ id, nameEn: id, nameAr: id });
const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
const PRIMARY: EmployeeScope = { kind: 'stage', stageIds: ['primary'] };

const detail = (over: Partial<EmployeeDetailRow> = {}): EmployeeDetailRow => ({
  id: 'e1',
  otherStages: [],
  code: 'EMP-0001',
  nameEn: 'A',
  nameAr: 'أ',
  nationalId: null,
  gender: 'MALE',
  dateOfBirth: d('1990-01-01'),
  phone: '010',
  email: null,
  address: null,
  hireDate: d('2024-01-01'),
  stage: ref('primary'),
  department: ref('d1'),
  jobTitle: ref('j1'),
  manager: null,
  grade: null,
  workSystem: 'FULL_TIME',
  basicSalary: 900000,
  fingerprintId: null,
  contractStart: d('2025-06-01'),
  contractEnd: d('2026-05-31'),
  probationEnd: d('2024-03-31'),
  usesBus: false,
  photoUrl: null,
  insuranceStatus: 'INSURED',
  insuranceNumber: '123',
  insuranceRegistrationDate: d('2024-01-01'),
  insuredSalary: 700000,
  bankName: 'Bank',
  bankAccountNumber: '42',
  iban: 'EG380019000500000000263180002',
  emergencyContactName: null,
  emergencyContactRelationship: null,
  emergencyContactPhone: null,
  highestDegree: null,
  major: null,
  university: null,
  graduationYear: null,
  status: 'ACTIVE',
  createdAt: new Date(),
  updatedAt: new Date(),
  ...over,
});

const summary = (id: string, stageId: string): EmployeeSummaryRow => ({
  id,
  code: id,
  nameEn: id,
  nameAr: id,
  department: ref('d1'),
  stage: ref(stageId),
  otherStages: [],
  jobTitle: ref('j1'),
  workSystem: 'FULL_TIME',
  basicSalary: 500000,
  status: 'ACTIVE',
  photoUrl: null,
  managerId: null,
  gender: 'MALE',
});

function makeService(scopes: Parameters<typeof fakeAccess>[0], repo: Record<string, jest.Mock> = {}) {
  const repository = {
    list: jest.fn().mockResolvedValue({
      data: [summary('e1', 'primary'), summary('e2', 'kg')],
      total: 2,
      page: 1,
      limit: 10,
      hasNextPage: false,
      hasPreviousPage: false,
    }),
    findDetail: jest.fn().mockResolvedValue(detail()),
    findScopeFields: jest.fn().mockResolvedValue({ id: 'e1', stageId: 'primary', managerId: null }),
    updateEmployee: jest.fn().mockResolvedValue(detail()),
    countActiveByStage: jest.fn().mockResolvedValue([]),
    findIdsInScope: jest.fn().mockResolvedValue(['e1']),
    findIdByInsuranceNumber: jest.fn().mockResolvedValue(null),
    findIdByNationalId: jest.fn().mockResolvedValue(null),
    findIdByFingerprintId: jest.fn().mockResolvedValue(null),
    ...repo,
  };
  const service = new EmployeesService(
    repository as unknown as EmployeesRepository,
    { getSelectable: jest.fn() } as unknown as DepartmentsService,
    { getSelectable: jest.fn() } as unknown as JobTitlesService,
    { publish: jest.fn() } as unknown as DomainEvents,
    {} as unknown as FileStorageService,
    fakeAccess(scopes),
    { record: jest.fn(() => Promise.resolve()) } as unknown as AuditService,
    { run: jest.fn(), inTransaction: (fn: () => Promise<unknown>) => fn() } as unknown as AfterCommit,
    { defaultProbationMonths: jest.fn().mockResolvedValue(3) } as unknown as HrSettingsService,
    {
      contractChanged: jest.fn(),
      probationChanged: jest.fn(),
      employeeDeactivated: jest.fn(),
    } as unknown as HrRemindersService,
    { accountOfEmployee: jest.fn().mockResolvedValue(null) } as unknown as UsersService,
    { createFirst: jest.fn().mockResolvedValue({}) } as unknown as ContractRecords,
  );
  return { service, repository };
}

const STAGE_HEAD = {
  'hr.employees.view': PRIMARY,
  'hr.employees.view_salary': null,
  'hr.employees.edit': null,
  'hr.employees.change_status': null,
} as const;

describe('employees — scopes (R5)', () => {
  it('own_stage: the list query is limited to the stage', async () => {
    const { service, repository } = makeService(STAGE_HEAD);
    await service.list({});
    expect(repository.list.mock.calls[0][4]).toEqual({ OR: [{ stageId: { in: ['primary'] } }, { otherStages: { some: { stageId: { in: ['primary'] } } } }] });
  });

  it('all: the list query is not limited', async () => {
    const { service, repository } = makeService({});
    await service.list({});
    expect(repository.list.mock.calls[0][4]).toEqual({});
  });

  it('detail and headcount are read inside the view scope', async () => {
    const { service, repository } = makeService(STAGE_HEAD);
    await service.get('e1');
    expect(repository.findDetail).toHaveBeenCalledWith('e1', { OR: [{ stageId: { in: ['primary'] } }, { otherStages: { some: { stageId: { in: ['primary'] } } } }] });
    await service.activeHeadcount();
    expect(repository.countActiveByStage).toHaveBeenCalledWith({ OR: [{ stageId: { in: ['primary'] } }, { otherStages: { some: { stageId: { in: ['primary'] } } } }] });
  });

  it('edge case 3 — an employee outside the scope is 404, like an unknown one', async () => {
    // The repository finds nothing for (id, scope): the employee is in another stage.
    const { service } = makeService(STAGE_HEAD, { findDetail: jest.fn().mockResolvedValue(null) });
    await expect(service.get('e9')).rejects.toMatchObject({ status: 404 });
  });

  it('no linked employee (scope none) → the list asks for nobody', async () => {
    const { service, repository } = makeService({ 'hr.employees.view': { kind: 'none' } });
    await service.list({});
    expect(repository.list.mock.calls[0][4]).toEqual({ id: { in: [] } });
  });

  it('edit and status changes outside their scope → 404, nothing written', async () => {
    const { service, repository } = makeService(
      { ...STAGE_HEAD, 'hr.employees.edit': PRIMARY, 'hr.employees.change_status': PRIMARY },
      {
        findDetail: jest.fn().mockResolvedValue(null),
        findScopeFields: jest.fn().mockResolvedValue({ id: 'e2', stageId: 'kg', managerId: null }),
      },
    );
    await expect(service.update('e2', { grade: 'B' })).rejects.toMatchObject({ status: 404 });
    await expect(service.deactivate('e2')).rejects.toMatchObject({ status: 404 });
    await expect(service.removePhoto('e2')).rejects.toMatchObject({ status: 404 });
    expect(repository.updateEmployee).not.toHaveBeenCalled();
  });

  it('the Activity log sees every employee at scope all, else the ids in scope', async () => {
    await expect(makeService({}).service.idsInViewScope()).resolves.toBe('all');
    await expect(makeService(STAGE_HEAD).service.idsInViewScope()).resolves.toEqual(['e1']);
  });
});

describe('employees — salary (R7)', () => {
  it('edge case 4 — without hr.employees.view_salary the salary fields are absent from the record', async () => {
    const { service } = makeService(STAGE_HEAD);
    const employee = await service.get('e1');
    expect(employee.salaryVisible).toBe(false);
    for (const field of ['basicSalary', 'insuredSalary', 'bankName', 'bankAccountNumber', 'iban']) {
      expect(field in employee).toBe(false);
    }
    // Everything else is still there.
    expect(employee).toMatchObject({ insuranceNumber: '123', code: 'EMP-0001' });
  });

  it('N0 edge 9 — the probation end is not salary-type: a stage head sees it without salaries', async () => {
    const { service } = makeService(STAGE_HEAD);
    const employee = await service.get('e1');
    expect(employee.salaryVisible).toBe(false);
    expect(employee.probationEnd).toBe('2024-03-31');
  });

  it('edge case 4 — without the key, list rows (cards) have no basicSalary', async () => {
    const { service } = makeService(STAGE_HEAD);
    const page = await service.list({});
    expect(page.data.map((e) => [e.salaryVisible, 'basicSalary' in e])).toEqual([
      [false, false],
      [false, false],
    ]);
    expect('managerId' in page.data[0]).toBe(false);
  });

  it('with the key (scope all), every salary field is present', async () => {
    const { service } = makeService({});
    const employee = await service.get('e1');
    expect(employee).toMatchObject({
      salaryVisible: true,
      basicSalary: 900000,
      insuredSalary: 700000,
      bankName: 'Bank',
      bankAccountNumber: '42',
      iban: 'EG380019000500000000263180002',
    });
    const page = await service.list({});
    expect(page.data[0]).toMatchObject({ salaryVisible: true, basicSalary: 500000 });
  });

  it('a scoped salary key shows salaries only inside its scope', async () => {
    const { service } = makeService({ 'hr.employees.view_salary': PRIMARY });
    const page = await service.list({});
    expect(page.data.map((e) => e.basicSalary)).toEqual([500000, undefined]);
  });

  it('an edit that sends a salary field without seeing that salary → 403, nothing written', async () => {
    const { service, repository } = makeService({ ...STAGE_HEAD, 'hr.employees.edit': PRIMARY });
    await expect(service.update('e1', { basicSalary: 1 })).rejects.toMatchObject({ status: 403 });
    await expect(service.update('e1', { iban: null })).rejects.toMatchObject({ status: 403 });
    expect(repository.updateEmployee).not.toHaveBeenCalled();
  });

  it('creating needs every salary (pay is set on create) → 403 without it', async () => {
    const { service } = makeService({ 'hr.employees.view_salary': PRIMARY });
    await expect(
      service.create({
        nameEn: 'A',
        nameAr: 'أ',
        gender: 'MALE',
        dateOfBirth: '1990-01-01',
        phone: '010',
        hireDate: '2024-01-01',
        stageId: 's1',
        departmentId: 'd1',
        jobTitleId: 'j1',
        workSystem: 'FULL_TIME',
        basicSalary: 100,
      }),
    ).rejects.toMatchObject({ status: 403 });
  });
});

describe('employees — edits stay inside the scope (R5)', () => {
  const EDITOR = { ...STAGE_HEAD, 'hr.employees.edit': PRIMARY } as const;
  const inKg = jest.fn((id: string) =>
    Promise.resolve(id === 'kg-boss' ? { id, stageId: 'kg', managerId: null } : { id, stageId: 'primary', managerId: null }),
  );

  it('a manager the user can’t see reads as unknown: 400 INVALID_MANAGER, nothing written', async () => {
    const { service, repository } = makeService(EDITOR, { findScopeFields: inKg });
    await expect(service.update('e1', { managerId: 'kg-boss' })).rejects.toMatchObject({
      status: 400,
      code: 'INVALID_MANAGER',
    });
    expect(repository.updateEmployee).not.toHaveBeenCalled();
  });

  it('moving the employee to another stage (out of the editor’s scope) → 400 FOREIGN_KEY_VIOLATION', async () => {
    const { service, repository } = makeService(EDITOR);
    await expect(service.update('e1', { stageId: 'kg' })).rejects.toMatchObject({
      status: 400,
      code: 'FOREIGN_KEY_VIOLATION',
    });
    expect(repository.updateEmployee).not.toHaveBeenCalled();
  });

  it('a team editor can’t hand the employee to another manager’s team → 400 INVALID_MANAGER', async () => {
    const team = { kind: 'team', managerId: 'me' } as const;
    const { service } = makeService(
      { 'hr.employees.view': { kind: 'all' }, 'hr.employees.edit': team, 'hr.employees.view_salary': null },
      { findDetail: jest.fn().mockResolvedValue(detail({ manager: { id: 'me', code: 'M', nameEn: 'M', nameAr: 'M', photoUrl: null, jobTitle: { managesPeople: true } } as never })) },
    );
    await expect(service.update('e1', { managerId: 'other' })).rejects.toMatchObject({ code: 'INVALID_MANAGER' });
  });

  it('an unrelated edit inside the scope goes through', async () => {
    const { service, repository } = makeService(EDITOR);
    await service.update('e1', { grade: 'B' });
    expect(repository.updateEmployee).toHaveBeenCalled();
  });

  it('assertScopeFirst: a scoped user gets 404 for any id outside (unknown included); scope all lets it through', async () => {
    const { service } = makeService(STAGE_HEAD, {
      findScopeFieldsMany: jest.fn().mockResolvedValue([{ id: 'e1', stageId: 'primary', managerId: null }]),
    });
    await expect(service.assertScopeFirst('hr.employees.view', ['e1'])).resolves.toBeUndefined();
    await expect(service.assertScopeFirst('hr.employees.view', ['e1', 'unknown'])).rejects.toMatchObject({ status: 404 });
    await expect(makeService({}).service.assertScopeFirst('hr.employees.view', ['unknown'])).resolves.toBeUndefined();
  });
});
