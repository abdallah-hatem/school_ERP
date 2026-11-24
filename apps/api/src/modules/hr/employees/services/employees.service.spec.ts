import { BadRequestException } from '@nestjs/common';
import { contractYearFor, ErrorCode, HrEvent, schoolDayOf } from '@school-erp/shared';
import { todayIsoDate } from '../../../../common/utils/dates.util';
import type { AuditService } from '../../../../core/audit';
import type { UsersService } from '../../../../core/users';
import type { DomainEvents } from '../../../../core/events';
import type { FileStorageService } from '../../../../core/settings';
import type { AfterCommit } from '../../../../database/transactions';
import { DepartmentsService } from '../../lists/services/departments.service';
import { JobTitlesService } from '../../lists/services/job-titles.service';
import type { CreateEmployeeDto } from '../dto/employee.dto';
import { EmployeeDetailRow, EmployeesRepository } from '../repositories/employees.repository';
import type { HrRemindersService } from '../../reminders/hr-reminders.service';
import type { HrSettingsService } from '../../settings/hr-settings.service';
import { EmployeesService } from './employees.service';
import type { ContractRecords } from '../../contracts/services/contract-records.service';
import { fakeAccess } from '../../access/hr-access.testing';
import type { HrAccessService } from '../../access/hr-access.service';

const ref = (id: string) => ({ id, nameEn: id, nameAr: id });
const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

const row = (over: Partial<EmployeeDetailRow> = {}): EmployeeDetailRow => ({
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
  stage: ref('s1'),
  department: ref('d1'),
  jobTitle: ref('j1'),
  manager: null,
  grade: null,
  workSystem: 'FULL_TIME',
  basicSalary: 100,
  fingerprintId: null,
  contractStart: d('2025-06-01'),
  contractEnd: d('2026-05-31'),
  probationEnd: d('2024-03-31'),
  usesBus: false,
  photoUrl: null,
  insuranceStatus: 'NOT_INSURED',
  insuranceNumber: null,
  insuranceRegistrationDate: null,
  insuredSalary: null,
  bankName: null,
  bankAccountNumber: null,
  iban: null,
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

const dto = (over: Partial<CreateEmployeeDto> = {}): CreateEmployeeDto => ({
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
  ...over,
});

function makeService(
  repo: Record<string, jest.Mock> = {},
  access: HrAccessService = fakeAccess(),
  probationMonths = 3,
) {
  const repository = {
    findDetail: jest.fn().mockResolvedValue(row()),
    findScopeFields: jest.fn().mockResolvedValue({ id: 'e1', stageId: 's1', managerId: null }),
    findManagerState: jest
      .fn()
      .mockResolvedValue({ id: 'm1', status: 'ACTIVE', jobTitle: { managesPeople: true } }),
    findStage: jest.fn().mockResolvedValue({ id: 's1', isActive: true }),
    findIdByNationalId: jest.fn().mockResolvedValue(null),
    findIdByFingerprintId: jest.fn().mockResolvedValue(null),
    findIdByInsuranceNumber: jest.fn().mockResolvedValue(null),
    managerChainIds: jest.fn().mockResolvedValue([]),
    createWithCode: jest.fn().mockImplementation(() => Promise.resolve(row())),
    updateEmployee: jest.fn().mockImplementation(() => Promise.resolve(row())),
    ...repo,
  };
  const lists = { getSelectable: jest.fn().mockResolvedValue({}) };
  // DomainEvents holds each event until the commit (its own spec); here: what was published.
  const events = { publish: jest.fn(() => Promise.resolve()) };
  const files = {
    save: jest.fn().mockImplementation((folder: string, name: string) => Promise.resolve(`/files/${folder}/${name}`)),
    remove: jest.fn().mockResolvedValue(undefined),
  };
  const audit = { record: jest.fn(() => Promise.resolve()) };
  const users = { accountOfEmployee: jest.fn().mockResolvedValue(null) };
  const contracts = { createFirst: jest.fn().mockResolvedValue({}) };
  const reminders = {
    contractChanged: jest.fn(() => Promise.resolve()),
    probationChanged: jest.fn(() => Promise.resolve()),
    employeeDeactivated: jest.fn(() => Promise.resolve()),
  };
  // Runs after-commit work at once, as it does outside a transaction; a throw from the
  // transaction runs the rollback work.
  const rollback: (() => unknown)[] = [];
  const afterCommit = {
    run: jest.fn((fn: () => unknown) => Promise.resolve(fn())),
    onRollback: jest.fn((fn: () => unknown) => void rollback.push(fn)),
    inTransaction: async (fn: () => Promise<unknown>) => {
      try {
        return await fn();
      } catch (e) {
        for (const f of rollback.splice(0)) await f();
        throw e;
      }
    },
  };
  const service = new EmployeesService(
    repository as unknown as EmployeesRepository,
    lists as unknown as DepartmentsService,
    lists as unknown as JobTitlesService,
    events as unknown as DomainEvents,
    files as unknown as FileStorageService,
    access,
    audit as unknown as AuditService,
    afterCommit as unknown as AfterCommit,
    { defaultProbationMonths: jest.fn().mockResolvedValue(probationMonths) } as unknown as HrSettingsService,
    reminders as unknown as HrRemindersService,
    users as unknown as UsersService,
    contracts as unknown as ContractRecords,
  );
  return { service, repository, events, files, audit, afterCommit, reminders, users, contracts };
}

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]);
const insured = {
  insuranceStatus: 'INSURED' as const,
  insuranceNumber: '123456789',
  insuranceRegistrationDate: '2020-09-01',
  insuredSalary: 900_000,
};

describe('EmployeesService — insurance (§3)', () => {
  it('create insured writes the three details', async () => {
    const { service, repository } = makeService();
    await service.create(dto(insured));
    const data = repository.createWithCode.mock.calls[0]![0];
    expect(data).toMatchObject({
      insuranceStatus: 'INSURED',
      insuranceNumber: '123456789',
      insuranceRegistrationDate: d('2020-09-01'),
      insuredSalary: 900_000,
    });
  });

  it('create insured without a number → 400, nothing written', async () => {
    const { service, repository } = makeService();
    await expect(service.create(dto({ ...insured, insuranceNumber: null }))).rejects.toThrow(
      'insuranceNumber is required when insured',
    );
    expect(repository.createWithCode).not.toHaveBeenCalled();
  });

  it('not insured clears the details even when they are sent', async () => {
    const { service, repository } = makeService();
    await service.create(dto({ ...insured, insuranceStatus: 'NOT_INSURED' }));
    expect(repository.createWithCode.mock.calls[0]![0]).toMatchObject({
      insuranceStatus: 'NOT_INSURED',
      insuranceNumber: null,
      insuranceRegistrationDate: null,
      insuredSalary: null,
    });
    // An insurance number that is cleared is never checked for uniqueness.
    expect(repository.findIdByInsuranceNumber).not.toHaveBeenCalled();
  });

  it('update merges with the saved values: changing only the salary keeps the number and date', async () => {
    const saved = row({
      insuranceStatus: 'INSURED',
      insuranceNumber: '555',
      insuranceRegistrationDate: d('2021-01-01'),
      insuredSalary: 100,
    });
    const { service, repository } = makeService({ findDetail: jest.fn().mockResolvedValue(saved) });
    await service.update('e1', { insuredSalary: 200 });
    expect(repository.updateEmployee.mock.calls[0]![1]).toMatchObject({
      insuranceStatus: 'INSURED',
      insuranceNumber: '555',
      insuranceRegistrationDate: d('2021-01-01'),
      insuredSalary: 200,
    });
  });

  it('update to insured with nothing saved → 400; update to not insured clears', async () => {
    const { service } = makeService();
    await expect(service.update('e1', { insuranceStatus: 'INSURED' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    const savedInsured = row({ ...insured, insuranceRegistrationDate: d('2020-09-01') });
    const second = makeService({ findDetail: jest.fn().mockResolvedValue(savedInsured) });
    await second.service.update('e1', { insuranceStatus: 'NOT_INSURED' });
    expect(second.repository.updateEmployee.mock.calls[0]![1]).toMatchObject({
      insuranceNumber: null,
      insuranceRegistrationDate: null,
      insuredSalary: null,
    });
  });

  it('insurance status cannot be cleared', async () => {
    const { service } = makeService();
    await expect(service.update('e1', { insuranceStatus: null as never })).rejects.toThrow(
      'insuranceStatus cannot be empty',
    );
  });

  it('an insurance number owned by someone else → 409 DUPLICATE_INSURANCE_NUMBER; your own is fine', async () => {
    const { service } = makeService({ findIdByInsuranceNumber: jest.fn().mockResolvedValue('other') });
    await expect(service.create(dto(insured))).rejects.toMatchObject({
      code: ErrorCode.DUPLICATE_INSURANCE_NUMBER,
    });
    const own = makeService({ findIdByInsuranceNumber: jest.fn().mockResolvedValue('e1') });
    await expect(own.service.update('e1', insured)).resolves.toBeDefined();
  });
});

describe('EmployeesService — photo (§3)', () => {
  const file = (over: Partial<{ mimetype: string; size: number; buffer: Buffer }> = {}) => ({
    mimetype: 'image/png',
    size: PNG.length,
    buffer: PNG,
    ...over,
  });

  it('stores the photo under employee-photos and deletes the previous one', async () => {
    const { service, repository, files, afterCommit } = makeService({
      findDetail: jest.fn().mockResolvedValue(row({ photoUrl: '/files/employee-photos/old.png' })),
    });
    await service.setPhoto('e1', file());
    expect(afterCommit.run).toHaveBeenCalledTimes(1);
    expect(files.save).toHaveBeenCalledWith('employee-photos', expect.stringMatching(/^e1-.+\.png$/), PNG);
    expect(repository.updateEmployee).toHaveBeenCalledWith('e1', {
      photoUrl: expect.stringMatching(/^\/files\/employee-photos\/e1-/),
    });
    expect(files.remove).toHaveBeenCalledWith('/files/employee-photos/old.png');
  });

  it('refuses an SVG, a GIF, a mismatched type and anything over 2 MB', async () => {
    const { service, files } = makeService();
    await expect(
      service.setPhoto('e1', file({ mimetype: 'image/svg+xml', buffer: Buffer.from('<svg/>') })),
    ).rejects.toMatchObject({ code: ErrorCode.INVALID_FILE_TYPE });
    await expect(
      service.setPhoto('e1', file({ mimetype: 'image/gif', buffer: Buffer.from('GIF89a') })),
    ).rejects.toMatchObject({ code: ErrorCode.INVALID_FILE_TYPE });
    await expect(service.setPhoto('e1', file({ mimetype: 'image/jpeg' }))).rejects.toMatchObject({
      code: ErrorCode.INVALID_FILE_TYPE,
    });
    await expect(service.setPhoto('e1', file({ size: 2 * 1024 * 1024 + 1 }))).rejects.toMatchObject({
      code: ErrorCode.FILE_TOO_LARGE,
    });
    expect(files.save).not.toHaveBeenCalled();
  });

  it('unknown employee → 404; removing when there is no photo changes nothing', async () => {
    const missing = makeService({ findDetail: jest.fn().mockResolvedValue(null) });
    await expect(missing.service.setPhoto('x', file())).rejects.toThrow('Not Found');
    const { service, repository, files } = makeService();
    await service.removePhoto('e1');
    expect(repository.updateEmployee).not.toHaveBeenCalled();
    expect(files.remove).not.toHaveBeenCalled();
  });

  it('gap 8 — the photo change rolls back: the new file is deleted, the old one kept', async () => {
    const { service, files, audit } = makeService({
      findDetail: jest.fn().mockResolvedValue(row({ photoUrl: '/files/employee-photos/old.png' })),
    });
    audit.record.mockRejectedValueOnce(new Error('audit down'));
    await expect(service.setPhoto('e1', file())).rejects.toThrow('audit down');
    const saved = await (files.save.mock.results[0]?.value as Promise<string>);
    expect(files.remove).toHaveBeenCalledWith(saved);
    expect(files.remove).not.toHaveBeenCalledWith('/files/employee-photos/old.png');
  });
});

describe('EmployeesService', () => {
  it('create fills the current contract year, creates the first contract and publishes hr.employee.hired', async () => {
    const { service, repository, events, contracts } = makeService();
    await service.create(dto());
    const current = contractYearFor(todayIsoDate());
    const data = repository.createWithCode.mock.calls[0]![0];
    expect(data.contractStart).toEqual(d(current.start));
    expect(data.contractEnd).toEqual(d(current.end));
    // Contracts (spec 2026-11-24): creation still sets the first contract.
    expect(contracts.createFirst).toHaveBeenCalledWith('e1', current.start, current.end);
    expect(events.publish).toHaveBeenCalledWith(HrEvent.EMPLOYEE_HIRED, {
      employeeId: 'e1',
      hireDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      at: expect.any(String),
    });
  });

  it('gap 3 — an edit that changes nothing publishes no hr.employee.updated; a real one names its fields', async () => {
    const same = makeService();
    await same.service.update('e1', { grade: 'A' });
    expect(same.events.publish).not.toHaveBeenCalled();

    const changed = makeService({
      updateEmployee: jest.fn().mockResolvedValue(row({ phone: '01000000999' })),
    });
    await changed.service.update('e1', { phone: '01000000999' });
    expect(changed.events.publish).toHaveBeenCalledWith(HrEvent.EMPLOYEE_UPDATED, {
      employeeId: 'e1',
      fields: ['phone'],
      at: expect.any(String),
    });
  });

  it('deactivating publishes hr.employee.deactivated as must-deliver; reactivating, hr.employee.updated with status', async () => {
    const off = makeService({ updateEmployee: jest.fn().mockResolvedValue(row({ status: 'INACTIVE' })) });
    await off.service.deactivate('e1');
    expect(off.events.publish).toHaveBeenCalledWith(
      HrEvent.EMPLOYEE_DEACTIVATED,
      { employeeId: 'e1', at: expect.any(String) },
      { mustDeliver: true },
    );

    const on = makeService({
      findDetail: jest.fn().mockResolvedValue(row({ status: 'INACTIVE' })),
      updateEmployee: jest.fn().mockResolvedValue(row({ status: 'ACTIVE' })),
    });
    await on.service.reactivate('e1');
    expect(on.events.publish).toHaveBeenCalledWith(HrEvent.EMPLOYEE_UPDATED, {
      employeeId: 'e1',
      fields: ['status'],
      at: expect.any(String),
    });
  });

  it('deactivating keeps the school day it was done (a leaver, §2); reactivating clears it', async () => {
    const off = makeService({ updateEmployee: jest.fn().mockResolvedValue(row({ status: 'INACTIVE' })) });
    await off.service.deactivate('e1');
    const data = off.repository.updateEmployee.mock.calls[0]![1] as { status: string; deactivatedOn: Date };
    expect(data.status).toBe('INACTIVE');
    expect(data.deactivatedOn.toISOString().slice(0, 10)).toBe(schoolDayOf(new Date()));

    const on = makeService({
      findDetail: jest.fn().mockResolvedValue(row({ status: 'INACTIVE' })),
      updateEmployee: jest.fn().mockResolvedValue(row({ status: 'ACTIVE' })),
    });
    await on.service.reactivate('e1');
    expect(on.repository.updateEmployee).toHaveBeenCalledWith('e1', { status: 'ACTIVE', deactivatedOn: null });
  });

  it('create with contract end not after start → 400, nothing written', async () => {
    const { service, repository } = makeService();
    await expect(
      service.create(dto({ contractStart: '2026-06-01', contractEnd: '2026-06-01' })),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.createWithCode).not.toHaveBeenCalled();
  });

  it('assertActive: unknown id → 400 FOREIGN_KEY_VIOLATION (before inactive); inactive → 409 EMPLOYEE_INACTIVE', async () => {
    const findStates = jest.fn().mockResolvedValue([
      { id: 'a', status: 'ACTIVE' },
      { id: 'i', status: 'INACTIVE' },
    ]);
    const { service } = makeService({ findStates });
    await expect(service.assertActive(['a', 'a'])).resolves.toBeUndefined();
    expect(findStates).toHaveBeenLastCalledWith(['a']);
    await expect(service.assertActive(['a', 'i', 'x'])).rejects.toMatchObject({
      status: 400,
      code: ErrorCode.FOREIGN_KEY_VIOLATION,
    });
    await expect(service.assertActive(['a', 'i'])).rejects.toMatchObject({
      status: 409,
      code: ErrorCode.EMPLOYEE_INACTIVE,
    });
  });

  it('manager = self → INVALID_MANAGER', async () => {
    const { service } = makeService();
    await expect(service.update('e1', { managerId: 'e1' })).rejects.toMatchObject({
      code: ErrorCode.INVALID_MANAGER,
    });
  });

  it('inactive or missing manager → INVALID_MANAGER', async () => {
    const inactive = makeService({
      findManagerState: jest
        .fn()
        .mockResolvedValue({ id: 'm1', status: 'INACTIVE', jobTitle: { managesPeople: true } }),
    });
    await expect(inactive.service.create(dto({ managerId: 'm1' }))).rejects.toMatchObject({
      code: ErrorCode.INVALID_MANAGER,
    });
    const missing = makeService({ findManagerState: jest.fn().mockResolvedValue(null) });
    await expect(missing.service.create(dto({ managerId: 'm1' }))).rejects.toMatchObject({
      code: ErrorCode.INVALID_MANAGER,
    });
  });

  describe('managers must manage people (§3, 2026-11-18)', () => {
    const notManaging = () =>
      jest
        .fn()
        .mockResolvedValue({ id: 'm1', status: 'ACTIVE', jobTitle: { managesPeople: false } });
    const managerRef = {
      id: 'm1',
      code: 'EMP-0009',
      nameEn: 'M',
      nameAr: 'م',
      photoUrl: null,
      gender: 'FEMALE' as const,
      jobTitle: { managesPeople: false },
    };

    it('create with a manager whose job title does not manage people → MANAGER_NOT_MANAGING', async () => {
      const { service, repository } = makeService({ findManagerState: notManaging() });
      await expect(service.create(dto({ managerId: 'm1' }))).rejects.toMatchObject({
        status: 400,
        code: ErrorCode.MANAGER_NOT_MANAGING,
      });
      expect(repository.createWithCode).not.toHaveBeenCalled();
    });

    it('update choosing a new non-manager → MANAGER_NOT_MANAGING, nothing written', async () => {
      const { service, repository } = makeService({ findManagerState: notManaging() });
      await expect(service.update('e1', { managerId: 'm1' })).rejects.toMatchObject({
        code: ErrorCode.MANAGER_NOT_MANAGING,
      });
      expect(repository.updateEmployee).not.toHaveBeenCalled();
    });

    it('the existing manager who no longer qualifies is kept on unrelated edits', async () => {
      const { service, repository } = makeService({
        findManagerState: notManaging(),
        findDetail: jest.fn().mockResolvedValue(row({ manager: managerRef })),
      });
      // The whole form is sent back: the same manager, plus an unrelated change.
      await expect(service.update('e1', { managerId: 'm1', grade: 'B' })).resolves.toBeDefined();
      await expect(service.update('e1', { grade: 'C' })).resolves.toBeDefined();
      expect(repository.updateEmployee).toHaveBeenCalledTimes(2);
    });

    it('get reports whether the manager still manages people', async () => {
      const { service } = makeService({
        findDetail: jest.fn().mockResolvedValue(row({ manager: managerRef })),
      });
      await expect(service.get('e1')).resolves.toMatchObject({
        manager: { id: 'm1', code: 'EMP-0009', nameEn: 'M', nameAr: 'م', managesPeople: false, gender: 'FEMALE' },
      });
    });

    it('get says who signs in as the employee, through core’s users service; null when nobody', async () => {
      const linked = makeService();
      linked.users.accountOfEmployee.mockResolvedValue({ id: 'u1', name: 'Mona Adel' });
      await expect(linked.service.get('e1')).resolves.toMatchObject({ signInAccount: { id: 'u1', name: 'Mona Adel' } });
      expect(linked.users.accountOfEmployee).toHaveBeenCalledWith('e1');
      const unlinked = makeService();
      expect((await unlinked.service.get('e1')).signInAccount).toBeNull();
    });

    it('list passes the picker filters to the repository', async () => {
      const list = jest
        .fn()
        .mockResolvedValue({
          data: [],
          total: 0,
          page: 1,
          limit: 20,
          hasNextPage: false,
          hasPreviousPage: false,
        });
      const { service } = makeService({ list });
      await service.list({ status: 'ACTIVE', managesPeople: true, excludeId: 'e1' });
      expect(list.mock.calls[0]![3]).toMatchObject({
        status: 'ACTIVE',
        managesPeople: true,
        excludeId: 'e1',
      });
    });
  });

  it('a manager whose chain reaches the employee → MANAGER_LOOP', async () => {
    const { service, repository } = makeService({
      managerChainIds: jest.fn().mockResolvedValue(['m1', 'x', 'e1']),
    });
    await expect(service.update('e1', { managerId: 'm1' })).rejects.toMatchObject({
      code: ErrorCode.MANAGER_LOOP,
    });
    expect(repository.updateEmployee).not.toHaveBeenCalled();
  });

  it('national ID held by another employee → 409; held by self → allowed', async () => {
    const other = makeService({ findIdByNationalId: jest.fn().mockResolvedValue('e2') });
    await expect(
      other.service.update('e1', { nationalId: '12345678901234' }),
    ).rejects.toMatchObject({
      code: ErrorCode.DUPLICATE_NATIONAL_ID,
    });
    const self = makeService({ findIdByNationalId: jest.fn().mockResolvedValue('e1') });
    await expect(
      self.service.update('e1', { nationalId: '12345678901234' }),
    ).resolves.toBeDefined();
  });

  it('PATCH clearing a required field → 400', async () => {
    const { service } = makeService();
    await expect(service.update('e1', { phone: null as unknown as string })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('PATCH keeps a list item hidden after assignment; a new hidden choice is checked', async () => {
    const { service, repository } = makeService({
      findStage: jest.fn().mockResolvedValue({ id: 's1', isActive: false }),
    });
    await expect(service.update('e1', { stageId: 's1', grade: 'B' })).resolves.toBeDefined();
    expect(repository.findStage).not.toHaveBeenCalled();
    await expect(service.update('e1', { stageId: 's2' })).rejects.toMatchObject({
      code: ErrorCode.LIST_ITEM_HIDDEN,
    });
  });

  it('deactivating an inactive employee is a no-op without an event', async () => {
    const { service, repository, events } = makeService({
      findDetail: jest.fn().mockResolvedValue(row({ status: 'INACTIVE' })),
    });
    await expect(service.deactivate('e1')).resolves.toMatchObject({ status: 'INACTIVE' });
    expect(repository.updateEmployee).not.toHaveBeenCalled();
    expect(events.publish).not.toHaveBeenCalled();
  });

  it('maps dates to YYYY-MM-DD', async () => {
    const { service } = makeService();
    await expect(service.get('e1')).resolves.toMatchObject({
      dateOfBirth: '1990-01-01',
      hireDate: '2024-01-01',
      contractStart: '2025-06-01',
      contractEnd: '2026-05-31',
    });
  });
});

describe('EmployeesService — audit (§9, T28)', () => {
  type Recorded = { action: string; entity: unknown; before: Record<string, unknown> | null; after: Record<string, unknown> };
  const recorded = (audit: { record: jest.Mock }) => audit.record.mock.calls.map(([input]) => input as Recorded);

  it('create records hr.employee.create with both names, the new snapshot and no before', async () => {
    const { service, audit } = makeService();
    await service.create(dto());
    const [entry] = recorded(audit);
    expect(entry).toMatchObject({
      action: 'hr.employee.create',
      entity: { type: 'employee', id: 'e1', label: { en: 'A', ar: 'أ' } },
      before: null,
      after: expect.objectContaining({ code: 'EMP-0001', basicSalary: 100, dateOfBirth: '1990-01-01' }),
    });
  });

  it('an edit records the before and after snapshots, with id fields stored by name', async () => {
    const science = { id: 'd1', nameEn: 'Science', nameAr: 'علوم' };
    const maths = { id: 'd2', nameEn: 'Maths', nameAr: 'رياضيات' };
    const { service, audit } = makeService({
      findDetail: jest.fn().mockResolvedValue(row({ department: science })),
      updateEmployee: jest.fn().mockResolvedValue(row({ department: maths })),
    });
    await service.update('e1', { departmentId: 'd2' });
    const [entry] = recorded(audit);
    expect(entry?.action).toBe('hr.employee.update');
    expect(entry?.before?.departmentId).toEqual({ nameEn: 'Science', nameAr: 'علوم' });
    expect(entry?.after.departmentId).toEqual({ nameEn: 'Maths', nameAr: 'رياضيات' });
    expect(entry?.after).not.toHaveProperty('department');
  });

  it('a failed write records nothing', async () => {
    const { service, audit } = makeService({
      updateEmployee: jest.fn().mockRejectedValue(new Error('db down')),
    });
    await expect(service.update('e1', { grade: 'B' })).rejects.toThrow('db down');
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('review 2026-11-24 — nobody deactivates their own record (403 OWN_EMPLOYEE); someone else may', async () => {
    const self = makeService({}, fakeAccess({}, { userId: 'u1', employeeId: 'e1' }));
    await expect(self.service.deactivate('e1')).rejects.toMatchObject({ code: ErrorCode.OWN_EMPLOYEE });
    expect(self.repository.updateEmployee).not.toHaveBeenCalled();
    const other = makeService(
      { updateEmployee: jest.fn().mockResolvedValue(row({ status: 'INACTIVE' })) },
      fakeAccess({}, { userId: 'u2', employeeId: 'e2' }),
    );
    await expect(other.service.deactivate('e1')).resolves.toMatchObject({ status: 'INACTIVE' });
  });

  it('deactivate / reactivate record their own action with the status change', async () => {
    const active = makeService({
      updateEmployee: jest.fn().mockResolvedValue(row({ status: 'INACTIVE' })),
    });
    await active.service.deactivate('e1');
    expect(recorded(active.audit)[0]).toMatchObject({
      action: 'hr.employee.deactivate',
      before: expect.objectContaining({ status: 'ACTIVE' }),
      after: expect.objectContaining({ status: 'INACTIVE' }),
    });

    const inactive = makeService({
      findDetail: jest.fn().mockResolvedValue(row({ status: 'INACTIVE' })),
    });
    await inactive.service.reactivate('e1');
    expect(recorded(inactive.audit)[0]?.action).toBe('hr.employee.reactivate');
  });

  it('a no-op (already inactive, no photo to remove) records equal snapshots: no entry, @Audited answered', async () => {
    const inactive = makeService({ findDetail: jest.fn().mockResolvedValue(row({ status: 'INACTIVE' })) });
    await inactive.service.deactivate('e1');
    const [entry] = recorded(inactive.audit);
    expect(entry?.before).toEqual(entry?.after);

    const noPhoto = makeService();
    await noPhoto.service.removePhoto('e1');
    const [photo] = recorded(noPhoto.audit);
    expect(photo?.action).toBe('hr.employee.update');
    expect(photo?.before).toEqual(photo?.after);
  });

  it('a new photo records the photo change and deletes the old file only after the commit', async () => {
    const { service, audit, files, afterCommit } = makeService({
      findDetail: jest.fn().mockResolvedValue(row({ photoUrl: '/files/employee-photos/old.png' })),
      updateEmployee: jest.fn().mockResolvedValue(row({ photoUrl: '/files/employee-photos/e1-new.png' })),
    });
    await service.setPhoto('e1', { mimetype: 'image/png', size: PNG.length, buffer: PNG });
    const [entry] = recorded(audit);
    expect(entry?.before?.photoUrl).toBe('/files/employee-photos/old.png');
    expect(entry?.after.photoUrl).toBe('/files/employee-photos/e1-new.png');
    expect(afterCommit.run).toHaveBeenCalledTimes(1);
    expect(files.remove).toHaveBeenCalledWith('/files/employee-photos/old.png');
  });
});

describe('EmployeesService — probation end (§3, N0)', () => {
  type Recorded = { action: string; before: Record<string, unknown> | null; after: Record<string, unknown> };
  const recorded = (audit: { record: jest.Mock }) => audit.record.mock.calls.map(([input]) => input as Recorded);
  /** The fields an entry lists: those whose snapshot values differ (what core's diff keeps). */
  const changed = (e: Recorded) =>
    Object.keys(e.after).filter((k) => JSON.stringify(e.before?.[k]) !== JSON.stringify(e.after[k]));
  const written = (repository: { createWithCode: jest.Mock }, call = 0) =>
    (repository.createWithCode.mock.calls[call] as [{ probationEnd: Date | null }])[0];

  it('edge 1 — hired 1 Sep with no probation end → saved as 30 Nov (default 3 months)', async () => {
    const { service, repository } = makeService();
    await service.create(dto({ hireDate: '2026-09-01' }));
    expect(written(repository).probationEnd).toEqual(d('2026-11-30'));
  });

  it('edge 1 — an explicit null on create is filled the same way', async () => {
    const { service, repository } = makeService();
    await service.create(dto({ hireDate: '2026-09-01', probationEnd: null }));
    expect(written(repository).probationEnd).toEqual(d('2026-11-30'));
  });

  it('edge 2 — a given probation end is kept as given', async () => {
    const { service, repository } = makeService();
    await service.create(dto({ hireDate: '2026-09-01', probationEnd: '2026-10-15' }));
    expect(written(repository).probationEnd).toEqual(d('2026-10-15'));
  });

  it('edge 3 / 7 — the length is read from the setting at create: 0 leaves it empty, 6 gives 28 Feb', async () => {
    const none = makeService({}, fakeAccess(), 0);
    await none.service.create(dto({ hireDate: '2026-09-01' }));
    expect(written(none.repository).probationEnd).toBeNull();
    const six = makeService({}, fakeAccess(), 6);
    await six.service.create(dto({ hireDate: '2026-09-01' }));
    expect(written(six.repository).probationEnd).toEqual(d('2027-02-28'));
  });

  it('edge 4 — before the hire date → 400 PROBATION_BEFORE_HIRE, nothing saved; the hire date itself is fine', async () => {
    const { service, repository } = makeService();
    await expect(service.create(dto({ hireDate: '2026-09-01', probationEnd: '2026-08-31' }))).rejects.toMatchObject({
      status: 400,
      code: ErrorCode.PROBATION_BEFORE_HIRE,
    });
    await expect(service.update('e1', { probationEnd: '2023-12-31' })).rejects.toMatchObject({
      code: ErrorCode.PROBATION_BEFORE_HIRE,
    });
    expect(repository.createWithCode).not.toHaveBeenCalled();
    expect(repository.updateEmployee).not.toHaveBeenCalled();
    await service.create(dto({ hireDate: '2026-09-01', probationEnd: '2026-09-01' }));
    expect(written(repository).probationEnd).toEqual(d('2026-09-01'));
  });

  it('edge 5 — an edit can clear it (no probation)', async () => {
    const { service, repository } = makeService();
    await service.update('e1', { probationEnd: null });
    expect(repository.updateEmployee.mock.calls[0][1]).toMatchObject({ probationEnd: null });
  });

  it("edge 6 — an edited hire date doesn't move it; one moved past it is refused", async () => {
    const { service, repository } = makeService();
    await service.update('e1', { hireDate: '2024-02-01' });
    expect(repository.updateEmployee.mock.calls[0][1]).not.toHaveProperty('probationEnd');
    await expect(service.update('e1', { hireDate: '2024-04-01' })).rejects.toMatchObject({
      code: ErrorCode.PROBATION_BEFORE_HIRE,
    });
    // Both sent together are checked together.
    await service.update('e1', { hireDate: '2024-04-01', probationEnd: '2024-06-30' });
    expect(repository.updateEmployee.mock.calls[1][1]).toMatchObject({ probationEnd: d('2024-06-30') });
  });

  it('edge 8 — an edit changing only the probation end lists only that field, before and after', async () => {
    const { service, audit } = makeService({
      updateEmployee: jest.fn().mockResolvedValue(row({ probationEnd: d('2024-05-31') })),
    });
    await service.update('e1', { probationEnd: '2024-05-31' });
    const [entry] = recorded(audit);
    expect(entry?.action).toBe('hr.employee.update');
    expect(changed(entry)).toEqual(['probationEnd']);
    expect(entry?.before?.probationEnd).toBe('2024-03-31');
    expect(entry?.after.probationEnd).toBe('2024-05-31');
  });

  it("edge 8 — an edit that doesn't change it doesn't list it; create records it", async () => {
    const { service, audit } = makeService({
      updateEmployee: jest.fn().mockResolvedValue(row({ grade: 'B' })),
    });
    await service.update('e1', { grade: 'B' });
    expect(changed(recorded(audit)[0])).toEqual(['grade']);
    const created = makeService();
    await created.service.create(dto());
    expect(recorded(created.audit)[0]?.after).toHaveProperty('probationEnd', '2024-03-31');
  });

  it('the record carries it as YYYY-MM-DD, or null', async () => {
    const { service } = makeService({ findDetail: jest.fn().mockResolvedValue(row({ probationEnd: null })) });
    expect((await service.get('e1')).probationEnd).toBeNull();
    const dated = makeService();
    expect((await dated.service.get('e1')).probationEnd).toBe('2024-03-31');
  });
});

describe('EmployeesService — reminders resolved at the change (§11, N3)', () => {
  it('contracts edge 13 — an edit never moves the contract dates (they change only through Contracts)', async () => {
    const { service, repository, reminders } = makeService({
      updateEmployee: jest.fn().mockResolvedValue(row({ grade: 'B' })),
    });
    await service.update('e1', { grade: 'B', contractEnd: '2026-08-31' } as never);
    const data = repository.updateEmployee.mock.calls[0]![1] as Record<string, unknown>;
    expect(data.contractEnd).not.toBeInstanceOf(Date);
    expect(reminders.contractChanged).not.toHaveBeenCalled();
  });

  it('N3 edge 2 — an unchanged date resolves nothing', async () => {
    const same = makeService({ updateEmployee: jest.fn().mockResolvedValue(row({ grade: 'B' })) });
    await same.service.update('e1', { grade: 'B' });
    expect(same.reminders.contractChanged).not.toHaveBeenCalled();
    expect(same.reminders.probationChanged).not.toHaveBeenCalled();
  });

  it('N3 edge 11 / N0 edge 5 — a moved or cleared probation end resolves its open reminder', async () => {
    const cleared = makeService({
      updateEmployee: jest.fn().mockResolvedValue(row({ probationEnd: null })),
    });
    await cleared.service.update('e1', { probationEnd: null });
    expect(cleared.reminders.probationChanged).toHaveBeenCalledWith('e1');
    expect(cleared.reminders.contractChanged).not.toHaveBeenCalled();
  });

  it('N3 edge 12 — deactivating resolves the reminders about the employee; a no-op deactivation and a reactivation do not', async () => {
    const active = makeService({
      updateEmployee: jest.fn().mockResolvedValue(row({ status: 'INACTIVE' })),
    });
    await active.service.deactivate('e1');
    expect(active.reminders.employeeDeactivated).toHaveBeenCalledWith('e1');

    const inactive = makeService({ findDetail: jest.fn().mockResolvedValue(row({ status: 'INACTIVE' })) });
    await inactive.service.deactivate('e1');
    await inactive.service.reactivate('e1');
    expect(inactive.reminders.employeeDeactivated).not.toHaveBeenCalled();
  });

  it('a refused edit resolves nothing (the resolve rides on the change)', async () => {
    const { service, reminders } = makeService();
    await expect(service.update('e1', { probationEnd: '2023-12-31' })).rejects.toMatchObject({
      code: ErrorCode.PROBATION_BEFORE_HIRE,
    });
    expect(reminders.probationChanged).not.toHaveBeenCalled();
  });
});
