import { NotFoundException } from '@nestjs/common';
import { ErrorCode, HrListKey, JobTitle, ListItem } from '@school-erp/shared';
import { fakeTransaction } from '../../../../common/testing/fake-transaction';
import type { SettingsHistory } from '../../../../core/settings';
import { DepartmentsRepository } from '../repositories/departments.repository';
import { JobTitlesRepository } from '../repositories/job-titles.repository';
import { DepartmentsService } from './departments.service';
import { JobTitlesService } from './job-titles.service';
import { GradesRepository } from '../repositories/grades.repository';
import { GradesService } from './grades.service';

const item = (over: Partial<ListItem> = {}): ListItem => ({
  id: 'd1',
  nameEn: 'Teaching',
  nameAr: 'تدريس',
  sortOrder: 0,
  isActive: true,
  ...over,
});

type Tx = ReturnType<typeof fakeTransaction>;

/** A history double that writes in the fake transaction. */
function historyIn(tx: Tx) {
  return {
    record: jest.fn(() => {
      tx.write('history');
      return Promise.resolve();
    }),
  };
}

/** A repository write that goes through the fake transaction too. */
const writing = (tx: Tx, value: unknown) =>
  jest.fn(() => {
    tx.write('item');
    return Promise.resolve(value);
  });

function makeService(
  repo: (tx: Tx) => Partial<Record<keyof DepartmentsRepository, jest.Mock>> = () => ({}),
) {
  const tx = fakeTransaction();
  const repository = {
    findAllOrdered: jest.fn(),
    findOne: jest.fn(),
    createItem: jest.fn(),
    updateItem: jest.fn(),
    ...repo(tx),
  };
  const history = historyIn(tx);
  const service = new DepartmentsService(
    repository as unknown as DepartmentsRepository,
    history as unknown as SettingsHistory,
    tx.afterCommit,
  );
  return { service, repository, history, tx };
}

describe('ListItemsService (departments)', () => {
  it("create records history (scope lists, null old value) in the write's transaction", async () => {
    const created = item();
    const { service, history, tx } = makeService((t) => ({ createItem: writing(t, created) }));
    await expect(service.create({ nameEn: 'Teaching', nameAr: 'تدريس' }, 'u1')).resolves.toBe(
      created,
    );
    expect(history.record).toHaveBeenCalledWith({
      scope: 'lists',
      key: HrListKey.DEPARTMENTS,
      oldValue: null,
      newValue: created,
      changedById: 'u1',
    });
    expect(tx.state).toEqual({ committed: ['item', 'history'], commits: 1, rollbacks: 0 });
  });

  it('update records old and new snapshots, committed with the change', async () => {
    const before = item();
    const after = item({ isActive: false });
    const { service, history, tx } = makeService((t) => ({
      findOne: jest.fn().mockResolvedValue(before),
      updateItem: writing(t, after),
    }));
    await service.update('d1', { isActive: false }, 'u1');
    expect(history.record).toHaveBeenCalledWith(
      expect.objectContaining({ oldValue: before, newValue: after, key: HrListKey.DEPARTMENTS }),
    );
    expect(tx.state.committed).toEqual(['item', 'history']);
  });

  it('the history write fails → the change rolls back (create and update)', async () => {
    const { service, history, tx } = makeService((t) => ({
      findOne: jest.fn().mockResolvedValue(item()),
      createItem: writing(t, item()),
      updateItem: writing(t, item({ isActive: false })),
    }));
    history.record.mockImplementation(() => Promise.reject(new Error('audit down')));
    await expect(service.create({ nameEn: 'A', nameAr: 'ب' }, 'u1')).rejects.toThrow('audit down');
    await expect(service.update('d1', { isActive: false }, 'u1')).rejects.toThrow('audit down');
    expect(tx.state).toEqual({ committed: [], commits: 0, rollbacks: 2 });
  });

  it('the write fails → no history entry', async () => {
    const { service, history, tx } = makeService(() => ({
      createItem: jest.fn().mockRejectedValue(new Error('db down')),
    }));
    await expect(service.create({ nameEn: 'A', nameAr: 'ب' }, 'u1')).rejects.toThrow('db down');
    expect(history.record).not.toHaveBeenCalled();
    expect(tx.state).toEqual({ committed: [], commits: 0, rollbacks: 1 });
  });

  it('an update that changes nothing passes equal snapshots (history writes no entry for them)', async () => {
    const { service, history } = makeService(() => ({
      findOne: jest.fn().mockResolvedValue(item()),
      updateItem: jest.fn().mockResolvedValue(item()),
    }));
    await service.update('d1', { nameEn: 'Teaching' }, 'u1');
    expect(history.record).toHaveBeenCalledWith(
      expect.objectContaining({ oldValue: item(), newValue: item() }),
    );
  });

  it('update of an unknown id → 404, nothing recorded', async () => {
    const { service, history } = makeService(() => ({
      findOne: jest.fn().mockResolvedValue(null),
    }));
    await expect(service.update('x', { nameEn: 'A' }, 'u1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(history.record).not.toHaveBeenCalled();
  });

  it('getSelectable: missing → FOREIGN_KEY_VIOLATION, hidden → LIST_ITEM_HIDDEN', async () => {
    const missing = makeService(() => ({ findOne: jest.fn().mockResolvedValue(null) })).service;
    await expect(missing.getSelectable('x')).rejects.toMatchObject({
      code: ErrorCode.FOREIGN_KEY_VIOLATION,
    });
    const hidden = makeService(() => ({
      findOne: jest.fn().mockResolvedValue(item({ isActive: false })),
    }));
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
    const tx = fakeTransaction();
    const history = historyIn(tx);
    const service = new JobTitlesService(
      repository as unknown as JobTitlesRepository,
      history as unknown as SettingsHistory,
      tx.afterCommit,
    );
    return { service, repository, history };
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
    const { service, repository, history } = makeTitles({
      findOne: jest.fn().mockResolvedValue(before),
      updateItem: jest.fn().mockResolvedValue(after),
    });
    await expect(service.update('j1', { managesPeople: true }, 'u1')).resolves.toBe(after);
    expect(repository.updateItem).toHaveBeenCalledWith('j1', { managesPeople: true });
    expect(history.record).toHaveBeenCalledWith(
      expect.objectContaining({ key: HrListKey.JOB_TITLES, oldValue: before, newValue: after }),
    );
  });

  it('setting managesPeople to what it already is passes equal snapshots', async () => {
    const same = title({ managesPeople: true });
    const { service, history } = makeTitles({
      findOne: jest.fn().mockResolvedValue(same),
      updateItem: jest.fn().mockResolvedValue(same),
    });
    await service.update('j1', { managesPeople: true }, 'u1');
    expect(history.record).toHaveBeenCalledWith(
      expect.objectContaining({ oldValue: same, newValue: same }),
    );
  });
});

describe('GradesService (§3, owner 2026-11-24)', () => {
  function makeGrades(repo: Partial<Record<keyof GradesRepository, jest.Mock>> = {}) {
    const tx = fakeTransaction();
    const repository = { findOne: jest.fn(), createItem: jest.fn(), updateItem: jest.fn(), ...repo };
    const history = historyIn(tx);
    const service = new GradesService(
      repository as unknown as GradesRepository,
      history as unknown as SettingsHistory,
      tx.afterCommit,
    );
    return { service, repository, history };
  }

  it('create and rename record their history under hr.grades (the hr.grade.* audit actions)', async () => {
    const senior = item({ id: 'g1', nameEn: 'Senior', nameAr: 'أول' });
    const renamed = { ...senior, nameEn: 'Senior teacher' };
    const { service, history } = makeGrades({
      createItem: jest.fn().mockResolvedValue(senior),
      findOne: jest.fn().mockResolvedValue(senior),
      updateItem: jest.fn().mockResolvedValue(renamed),
    });
    await service.create({ nameEn: 'Senior', nameAr: 'أول' }, 'u1');
    await service.update('g1', { nameEn: 'Senior teacher' }, 'u1');
    expect(history.record).toHaveBeenCalledTimes(2);
    expect(history.record).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ scope: 'lists', key: HrListKey.GRADES, oldValue: null, newValue: senior }),
    );
    expect(history.record).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ scope: 'lists', key: HrListKey.GRADES, oldValue: senior, newValue: renamed }),
    );
  });

  it('getSelectable: an unknown grade → FOREIGN_KEY_VIOLATION, a hidden one → LIST_ITEM_HIDDEN', async () => {
    const missing = makeGrades({ findOne: jest.fn().mockResolvedValue(null) });
    await expect(missing.service.getSelectable('x')).rejects.toMatchObject({ code: ErrorCode.FOREIGN_KEY_VIOLATION });
    const hidden = makeGrades({ findOne: jest.fn().mockResolvedValue(item({ id: 'g1', isActive: false })) });
    await expect(hidden.service.getSelectable('g1')).rejects.toMatchObject({ code: ErrorCode.LIST_ITEM_HIDDEN });
    const shown = makeGrades({ findOne: jest.fn().mockResolvedValue(item({ id: 'g1' })) });
    await expect(shown.service.getSelectable('g1')).resolves.toMatchObject({ id: 'g1' });
  });
});
