import { NotFoundException } from '@nestjs/common';
import { ErrorCode, type Stage } from '@school-erp/shared';
import { CodedException } from '../../common/errors/coded.exception';
import type { AfterCommit } from '../../database/transactions';
import type { AuditService } from '../audit';
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
  const audit = { record: jest.fn(() => Promise.resolve()) };
  const service = new StagesService(
    repo as unknown as StageRepository,
    audit as unknown as AuditService,
    { inTransaction: (fn: () => Promise<unknown>) => fn() } as unknown as AfterCommit,
  );
  return { service, repo, audit };
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
    await service.create({ nameEn: 'KG', nameAr: 'روضة' });
    expect(repo.create).toHaveBeenCalledWith({ nameEn: 'KG', nameAr: 'روضة', sortOrder: 4 });
  });

  it('a new stage records core.stage.create with both names and its snapshot under its history key', async () => {
    const { service, audit } = makeService();
    await service.create({ nameEn: 'KG', nameAr: 'روضة' });
    expect(audit.record).toHaveBeenCalledWith({
      action: 'core.stage.create',
      entity: { type: 'stage', id: 'new', label: { en: 'KG', ar: 'روضة' } },
      changes: [
        { field: 'lists.stages.new', before: null, after: expect.objectContaining({ nameEn: 'KG' }) },
      ],
    });
  });

  it('an edit records core.stage.update with old and new snapshots; an unchanged save still records (no entry)', async () => {
    const { service, audit } = makeService();
    await service.update('stage-1', { isActive: false });
    expect(audit.record).toHaveBeenCalledWith({
      action: 'core.stage.update',
      entity: { type: 'stage', id: 'stage-1', label: { en: 'Primary', ar: 'ابتدائي' } },
      changes: [
        {
          field: 'lists.stages.stage-1',
          before: expect.objectContaining({ isActive: true }),
          after: expect.objectContaining({ isActive: false }),
        },
      ],
    });

    audit.record.mockClear();
    await service.update('stage-1', { nameEn: 'Primary' });
    // AuditService drops a change whose before equals its after, so nothing is written.
    const [[input]] = audit.record.mock.calls as unknown as [[{ changes: { before: unknown; after: unknown }[] }]];
    expect(input.changes[0]?.before).toEqual(input.changes[0]?.after);
  });

  it('a failed write records nothing', async () => {
    const { service, repo, audit } = makeService();
    repo.update.mockRejectedValueOnce(new Error('db down'));
    await expect(service.update('stage-1', { isActive: false })).rejects.toThrow('db down');
    expect(audit.record).not.toHaveBeenCalled();
  });
});
