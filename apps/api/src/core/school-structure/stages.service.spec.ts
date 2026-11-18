import { NotFoundException } from '@nestjs/common';
import { ErrorCode, type Stage } from '@school-erp/shared';
import { CodedException } from '../../common/errors/coded.exception';
import { fakeTransaction } from '../../common/testing/fake-transaction';
import type { SettingsHistory } from '../settings';
import type { StageRepository } from './repositories/stage.repository';
import { StagesService } from './stages.service';

const stage = (over: Partial<Stage> = {}): Stage => ({
  id: 'stage-1',
  nameEn: 'Primary',
  nameAr: 'ابتدائي',
  sortOrder: 1,
  isActive: true,
  ...over,
});

function makeService(found: Stage | null = stage()) {
  const tx = fakeTransaction();
  const repo = {
    findById: jest.fn(() => Promise.resolve(found)),
    nextSortOrder: jest.fn(() => Promise.resolve(4)),
    create: jest.fn((data: Partial<Stage>) => {
      tx.write('stage');
      return Promise.resolve(stage({ ...data, id: 'new' }));
    }),
    update: jest.fn((_id: string, data: Partial<Stage>) => {
      tx.write('stage');
      const clean = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));
      return Promise.resolve({ ...(found as Stage), ...clean });
    }),
  };
  const history = {
    record: jest.fn(() => {
      tx.write('history');
      return Promise.resolve();
    }),
  };
  const service = new StagesService(
    repo as unknown as StageRepository,
    history as unknown as SettingsHistory,
    tx.afterCommit,
  );
  return { service, repo, history, tx };
}

describe('StagesService', () => {
  it('getActiveById returns an active stage', async () => {
    const { service } = makeService();
    await expect(service.getActiveById('stage-1')).resolves.toMatchObject({ id: 'stage-1' });
  });

  it('getActiveById refuses a hidden stage with LIST_ITEM_HIDDEN', async () => {
    const { service } = makeService(stage({ isActive: false }));
    const err = await service.getActiveById('stage-1').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CodedException);
    expect((err as CodedException).code).toBe(ErrorCode.LIST_ITEM_HIDDEN);
  });

  it('getActiveById → 404 for a missing stage', async () => {
    const { service } = makeService(null);
    await expect(service.getActiveById('x')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('a new stage without sortOrder goes last', async () => {
    const { service, repo } = makeService();
    await service.create({ nameEn: 'KG', nameAr: 'روضة' }, 'u');
    expect(repo.create).toHaveBeenCalledWith({ nameEn: 'KG', nameAr: 'روضة', sortOrder: 4 });
  });

  it('a change records one history entry with old and new, in the same transaction', async () => {
    const { service, history, tx } = makeService();
    await service.update('stage-1', { isActive: false }, 'u');
    expect(history.record).toHaveBeenCalledTimes(1);
    expect(history.record).toHaveBeenCalledWith({
      scope: 'lists',
      key: 'lists.stages.stage-1',
      oldValue: expect.objectContaining({ isActive: true }),
      newValue: expect.objectContaining({ isActive: false }),
      changedById: 'u',
    });
    expect(tx.state).toEqual({ committed: ['stage', 'history'], commits: 1, rollbacks: 0 });
  });

  it('a create and its history entry commit together', async () => {
    const { service, history, tx } = makeService();
    await service.create({ nameEn: 'KG', nameAr: 'روضة' }, 'u');
    expect(history.record).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'lists.stages.new', oldValue: null, changedById: 'u' }),
    );
    expect(tx.state).toEqual({ committed: ['stage', 'history'], commits: 1, rollbacks: 0 });
  });

  it('the history write fails → the stage change rolls back with it', async () => {
    const { service, history, tx } = makeService();
    history.record.mockImplementation(() => Promise.reject(new Error('audit down')));
    await expect(service.update('stage-1', { isActive: false }, 'u')).rejects.toThrow('audit down');
    await expect(service.create({ nameEn: 'KG', nameAr: 'روضة' }, 'u')).rejects.toThrow(
      'audit down',
    );
    expect(tx.state).toEqual({ committed: [], commits: 0, rollbacks: 2 });
  });

  it('the stage write fails → no history entry is written', async () => {
    const { service, repo, history, tx } = makeService();
    repo.update.mockImplementationOnce(() => Promise.reject(new Error('db down')));
    await expect(service.update('stage-1', { isActive: false }, 'u')).rejects.toThrow('db down');
    expect(history.record).not.toHaveBeenCalled();
    expect(tx.state).toEqual({ committed: [], commits: 0, rollbacks: 1 });
  });

  it('a save that changes nothing still goes through history (which writes no entry for it)', async () => {
    const { service, history } = makeService();
    await service.update('stage-1', { nameEn: 'Primary' }, 'u');
    expect(history.record).toHaveBeenCalledWith(
      expect.objectContaining({ oldValue: stage(), newValue: stage() }),
    );
  });

  it('update of a missing stage → 404, nothing written', async () => {
    const { service, history, tx } = makeService(null);
    await expect(service.update('x', { nameEn: 'A' }, 'u')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(history.record).not.toHaveBeenCalled();
    expect(tx.state.committed).toEqual([]);
  });
});
