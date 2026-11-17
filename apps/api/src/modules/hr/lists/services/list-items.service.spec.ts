import { NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ErrorCode, HrListKey, ListItem, SettingsEvent } from '@school-erp/shared';
import { DepartmentsRepository } from '../repositories/departments.repository';
import { DepartmentsService } from './departments.service';

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
