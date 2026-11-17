import { NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ErrorCode, HrListKey, JobTitle, ListItem, SettingsEvent } from '@school-erp/shared';
import { DepartmentsRepository } from '../repositories/departments.repository';
import { JobTitlesRepository } from '../repositories/job-titles.repository';
import { DepartmentsService } from './departments.service';
import { JobTitlesService } from './job-titles.service';

const item = (over: Partial<ListItem> = {}): ListItem => ({
  id: 'd1',
  nameEn: 'Teaching',
  nameAr: 'تدريس',
  sortOrder: 0,
  isActive: true,
  ...over,
});

function makeService(repo: Partial<Record<keyof DepartmentsRepository, jest.Mock>> = {}) {
  const repository = {
    findAllOrdered: jest.fn(),
    findOne: jest.fn(),
    createItem: jest.fn(),
    updateItem: jest.fn(),
    ...repo,
  };
  const events = { emit: jest.fn() };
  const service = new DepartmentsService(
    repository as unknown as DepartmentsRepository,
    events as unknown as EventEmitter2,
  );
  return { service, repository, events };
}

describe('ListItemsService (departments)', () => {
  it('create emits settings.changed (scope lists) with a null old value, after the write', async () => {
    const created = item();
    const { service, repository, events } = makeService({
      createItem: jest.fn().mockResolvedValue(created),
    });
    await expect(service.create({ nameEn: 'Teaching', nameAr: 'تدريس' }, 'u1')).resolves.toBe(
      created,
    );
    expect(repository.createItem.mock.invocationCallOrder[0]).toBeLessThan(
      events.emit.mock.invocationCallOrder[0],
    );
    expect(events.emit).toHaveBeenCalledWith(SettingsEvent.CHANGED, {
      scope: 'lists',
      key: HrListKey.DEPARTMENTS,
      oldValue: null,
      newValue: created,
      changedById: 'u1',
      changedAt: expect.any(String),
    });
  });

  it('update emits old and new snapshots', async () => {
    const before = item();
    const after = item({ isActive: false });
    const { service, events } = makeService({
      findOne: jest.fn().mockResolvedValue(before),
      updateItem: jest.fn().mockResolvedValue(after),
    });
    await service.update('d1', { isActive: false }, 'u1');
    expect(events.emit).toHaveBeenCalledWith(
      SettingsEvent.CHANGED,
      expect.objectContaining({ oldValue: before, newValue: after, key: HrListKey.DEPARTMENTS }),
    );
  });

  it('an update that changes nothing emits nothing', async () => {
    const { service, events } = makeService({
      findOne: jest.fn().mockResolvedValue(item()),
      updateItem: jest.fn().mockResolvedValue(item()),
    });
    await service.update('d1', { nameEn: 'Teaching' }, 'u1');
    expect(events.emit).not.toHaveBeenCalled();
  });

  it('update of an unknown id → 404, nothing emitted', async () => {
    const { service, events } = makeService({ findOne: jest.fn().mockResolvedValue(null) });
    await expect(service.update('x', { nameEn: 'A' }, 'u1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(events.emit).not.toHaveBeenCalled();
  });

  it('getSelectable: missing → FOREIGN_KEY_VIOLATION, hidden → LIST_ITEM_HIDDEN', async () => {
    const missing = makeService({ findOne: jest.fn().mockResolvedValue(null) }).service;
    await expect(missing.getSelectable('x')).rejects.toMatchObject({
      code: ErrorCode.FOREIGN_KEY_VIOLATION,
    });
    const hidden = makeService({ findOne: jest.fn().mockResolvedValue(item({ isActive: false })) });
    await expect(hidden.service.getSelectable('d1')).rejects.toMatchObject({
      code: ErrorCode.LIST_ITEM_HIDDEN,
    });
  });
});

describe('JobTitlesService (managesPeople, §3 2026-11-18)', () => {
  const title = (over: Partial<JobTitle> = {}): JobTitle => ({
    id: 'j1',
    nameEn: 'Principal',
    nameAr: 'مدير المدرسة',
    sortOrder: 0,
    isActive: true,
    managesPeople: false,
    ...over,
  });

  function makeTitles(repo: Record<string, jest.Mock> = {}) {
    const repository = {
      findAllOrdered: jest.fn(),
      findOne: jest.fn(),
      createItem: jest.fn(),
      updateItem: jest.fn(),
      ...repo,
    };
    const events = { emit: jest.fn() };
    const service = new JobTitlesService(
      repository as unknown as JobTitlesRepository,
      events as unknown as EventEmitter2,
    );
    return { service, repository, events };
  }

  it('create passes managesPeople when given, and leaves it to the default when not', async () => {
    const { service, repository } = makeTitles({
      createItem: jest.fn().mockResolvedValue(title({ managesPeople: true })),
    });
    await service.create(
      { nameEn: 'Principal', nameAr: 'مدير المدرسة', managesPeople: true },
      'u1',
    );
    expect(repository.createItem).toHaveBeenLastCalledWith({
      nameEn: 'Principal',
      nameAr: 'مدير المدرسة',
      managesPeople: true,
    });
    await service.create({ nameEn: 'Teacher', nameAr: 'معلم' }, 'u1');
    expect(repository.createItem).toHaveBeenLastCalledWith({ nameEn: 'Teacher', nameAr: 'معلم' });
  });

  it('turning managesPeople on is a change: history gets both snapshots', async () => {
    const before = title();
    const after = title({ managesPeople: true });
    const { service, repository, events } = makeTitles({
      findOne: jest.fn().mockResolvedValue(before),
      updateItem: jest.fn().mockResolvedValue(after),
    });
    await expect(service.update('j1', { managesPeople: true }, 'u1')).resolves.toBe(after);
    expect(repository.updateItem).toHaveBeenCalledWith('j1', { managesPeople: true });
    expect(events.emit).toHaveBeenCalledWith(
      SettingsEvent.CHANGED,
      expect.objectContaining({ key: HrListKey.JOB_TITLES, oldValue: before, newValue: after }),
    );
  });

  it('setting managesPeople to what it already is emits nothing', async () => {
    const { service, events } = makeTitles({
      findOne: jest.fn().mockResolvedValue(title({ managesPeople: true })),
      updateItem: jest.fn().mockResolvedValue(title({ managesPeople: true })),
    });
    await service.update('j1', { managesPeople: true }, 'u1');
    expect(events.emit).not.toHaveBeenCalled();
  });
});
