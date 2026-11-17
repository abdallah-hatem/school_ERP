import { BadRequestException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { contractYearFor, ErrorCode, HrEvent } from '@school-erp/shared';
import { todayIsoDate } from '../../../../common/utils/dates.util';
import { DepartmentsService } from '../../lists/services/departments.service';
import { JobTitlesService } from '../../lists/services/job-titles.service';
import type { CreateEmployeeDto } from '../dto/employee.dto';
import { EmployeeDetailRow, EmployeesRepository } from '../repositories/employees.repository';
import { EmployeesService } from './employees.service';

const ref = (id: string) => ({ id, nameEn: id, nameAr: id });
const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

const row = (over: Partial<EmployeeDetailRow> = {}): EmployeeDetailRow => ({
  id: 'e1',
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
  usesBus: false,
  status: 'ACTIVE',
  userId: null,
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

function makeService(repo: Record<string, jest.Mock> = {}) {
  const repository = {
    findDetail: jest.fn().mockResolvedValue(row()),
    findState: jest.fn().mockResolvedValue({ id: 'm1', status: 'ACTIVE' }),
    findManagerState: jest
      .fn()
      .mockResolvedValue({ id: 'm1', status: 'ACTIVE', jobTitle: { managesPeople: true } }),
    findStage: jest.fn().mockResolvedValue({ id: 's1', isActive: true }),
    findIdByNationalId: jest.fn().mockResolvedValue(null),
    findIdByFingerprintId: jest.fn().mockResolvedValue(null),
    managerChainIds: jest.fn().mockResolvedValue([]),
    createWithCode: jest.fn().mockImplementation(() => Promise.resolve(row())),
    updateEmployee: jest.fn().mockImplementation(() => Promise.resolve(row())),
    ...repo,
  };
  const lists = { getSelectable: jest.fn().mockResolvedValue({}) };
  const events = { emit: jest.fn() };
  const service = new EmployeesService(
    repository as unknown as EmployeesRepository,
    lists as unknown as DepartmentsService,
    lists as unknown as JobTitlesService,
    events as unknown as EventEmitter2,
  );
  return { service, repository, events };
}

describe('EmployeesService', () => {
  it('create fills the current contract year and emits employee.hired after the write', async () => {
    const { service, repository, events } = makeService();
    await service.create(dto());
    const current = contractYearFor(todayIsoDate());
    const data = repository.createWithCode.mock.calls[0]![0];
    expect(data.contractStart).toEqual(d(current.start));
    expect(data.contractEnd).toEqual(d(current.end));
    expect(events.emit).toHaveBeenCalledWith(HrEvent.EMPLOYEE_HIRED, {
      employeeId: 'e1',
      at: expect.any(String),
    });
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
        manager: { id: 'm1', code: 'EMP-0009', nameEn: 'M', nameAr: 'م', managesPeople: false },
      });
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
      findState: jest.fn().mockResolvedValue({ id: 'e1', status: 'INACTIVE' }),
      findDetail: jest.fn().mockResolvedValue(row({ status: 'INACTIVE' })),
    });
    await expect(service.deactivate('e1')).resolves.toMatchObject({ status: 'INACTIVE' });
    expect(repository.updateEmployee).not.toHaveBeenCalled();
    expect(events.emit).not.toHaveBeenCalled();
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
