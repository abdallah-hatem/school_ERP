import { NotFoundException } from '@nestjs/common';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import { SettingsEvent, ErrorCode, type Stage } from '@school-erp/shared';
import { CodedException } from '../../common/errors/coded.exception';
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
  const repo = {
    findById: jest.fn(() => Promise.resolve(found)),
    nextSortOrder: jest.fn(() => Promise.resolve(4)),
    create: jest.fn((data: Partial<Stage>) => Promise.resolve(stage({ ...data, id: 'new' }))),
    update: jest.fn((_id: string, data: Partial<Stage>) => {
      const clean = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));
      return Promise.resolve({ ...(found as Stage), ...clean });
    }),
  };
  const events = { emitAsync: jest.fn(() => Promise.resolve([])) };
  const service = new StagesService(
    repo as unknown as StageRepository,
    events as unknown as EventEmitter2,
  );
  return { service, repo, events };
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

  it('a change emits one settings.changed with old and new; no change emits nothing', async () => {
    const { service, events } = makeService();
    await service.update('stage-1', { isActive: false }, 'u');
    expect(events.emitAsync).toHaveBeenCalledTimes(1);
    expect(events.emitAsync).toHaveBeenCalledWith(
      SettingsEvent.CHANGED,
      expect.objectContaining({
        scope: 'lists',
        key: 'lists.stages.stage-1',
        oldValue: expect.objectContaining({ isActive: true }),
        newValue: expect.objectContaining({ isActive: false }),
        changedById: 'u',
      }),
    );

    events.emitAsync.mockClear();
    await service.update('stage-1', { nameEn: 'Primary' }, 'u');
    expect(events.emitAsync).not.toHaveBeenCalled();
  });
});
