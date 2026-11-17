import { NotFoundException } from '@nestjs/common';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import { ErrorCode, HrCatalogueKey, SettingsEvent } from '@school-erp/shared';
import type { PenaltyCatalogueRepository } from '../repositories/penalty-catalogue.repository';
import { PenaltyCatalogueService } from './penalty-catalogue.service';

const violationRow = (over: Record<string, unknown> = {}) => ({
  id: 'v1',
  groupId: 'g1',
  nameEn: 'Late',
  nameAr: 'تأخر',
  note: null,
  isActive: true,
  levels: [{ level: 1, action: 'DEDUCT_DAYS', days: '1.5' }],
  ...over,
});

function makeService(repo: Partial<Record<keyof PenaltyCatalogueRepository, jest.Mock>> = {}) {
  const events = { emit: jest.fn() };
  const repository = {
    findGroup: jest.fn().mockResolvedValue({ id: 'g1', nameEn: 'A', nameAr: 'أ', sortOrder: 0, isActive: true }),
    findViolation: jest.fn().mockResolvedValue({ ...violationRow(), group: { isActive: true } }),
    createViolation: jest.fn().mockResolvedValue(violationRow()),
    updateViolation: jest.fn().mockResolvedValue(violationRow()),
    ...repo,
  };
  const service = new PenaltyCatalogueService(
    repository as unknown as PenaltyCatalogueRepository,
    events as unknown as EventEmitter2,
  );
  return { service, repository, events };
}

describe('PenaltyCatalogueService', () => {
  it('rejects invalid levels with INVALID_LEVELS and writes nothing', async () => {
    const { service, repository } = makeService();
    await expect(
      service.createViolation(
        'g1',
        { nameEn: 'x', nameAr: 'y', levels: [{ level: 1, action: 'NOTICE', days: 1 }] },
        null,
      ),
    ).rejects.toMatchObject({ code: ErrorCode.INVALID_LEVELS });
    expect(repository.createViolation).not.toHaveBeenCalled();
  });

  it('stores levels sorted with days null when absent, and emits a catalogue history event', async () => {
    const { service, repository, events } = makeService();
    const v = await service.createViolation(
      'g1',
      {
        nameEn: 'x',
        nameAr: 'y',
        levels: [
          { level: 2, action: 'WARNING' },
          { level: 1, action: 'NOTICE' },
        ],
      },
      'u1',
    );
    expect(repository.createViolation).toHaveBeenCalledWith('g1', expect.anything(), [
      { level: 1, action: 'NOTICE', days: null },
      { level: 2, action: 'WARNING', days: null },
    ]);
    expect(v.levels[0]).toEqual({ level: 1, action: 'DEDUCT_DAYS', days: 1.5 });
    expect(events.emit).toHaveBeenCalledWith(
      SettingsEvent.CHANGED,
      expect.objectContaining({ scope: 'catalogue', key: HrCatalogueKey.VIOLATIONS, oldValue: null, changedById: 'u1' }),
    );
  });

  it('an update that changes nothing emits no history event', async () => {
    const { service, events } = makeService();
    await service.updateViolation('v1', { nameEn: 'Late' }, null);
    expect(events.emit).not.toHaveBeenCalled();
  });

  it('unknown group / violation → 404', async () => {
    const { service } = makeService({
      findGroup: jest.fn().mockResolvedValue(null),
      findViolation: jest.fn().mockResolvedValue(null),
    });
    await expect(service.updateGroup('g', {}, null)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.updateViolation('v', {}, null)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('getUsable: a violation in a retired group is retired too', async () => {
    const { service } = makeService({
      findViolation: jest.fn().mockResolvedValue({ ...violationRow(), group: { isActive: false } }),
    });
    await expect(service.getUsable('v1')).rejects.toMatchObject({ code: ErrorCode.VIOLATION_RETIRED });
  });
});
