import { NotFoundException } from '@nestjs/common';
import { ErrorCode, HrCatalogueKey } from '@school-erp/shared';
import { fakeTransaction } from '../../../../common/testing/fake-transaction';
import type { SettingsHistory } from '../../../../core/settings';
import type { PenaltyCatalogueRepository } from '../repositories/penalty-catalogue.repository';
import { PenaltyCatalogueService } from './penalty-catalogue.service';

const violationRow = (over: Record<string, unknown> = {}) => ({
  id: 'v1',
  groupId: 'g1',
  nameEn: 'Late',
  nameAr: 'تأخر',
  note: null,
  isActive: true,
  oncePerDay: true,
  levels: [{ level: 1, action: 'DEDUCT_DAYS', days: '1.5' }],
  ...over,
});

const groupRow = { id: 'g1', nameEn: 'A', nameAr: 'أ', sortOrder: 0, isActive: true };

function makeService(repo: Partial<Record<keyof PenaltyCatalogueRepository, jest.Mock>> = {}) {
  const tx = fakeTransaction();
  /** A repository write: goes through the fake transaction. */
  const writing = (value: unknown) =>
    jest.fn(() => {
      tx.write('catalogue');
      return Promise.resolve(value);
    });
  const history = {
    record: jest.fn(() => {
      tx.write('history');
      return Promise.resolve();
    }),
  };
  const repository = {
    findGroup: jest.fn().mockResolvedValue(groupRow),
    findViolation: jest.fn().mockResolvedValue({ ...violationRow(), group: { isActive: true } }),
    createGroup: writing(groupRow),
    updateGroup: writing({ ...groupRow, isActive: false }),
    createViolation: writing(violationRow()),
    updateViolation: writing(violationRow()),
    ...repo,
  };
  const service = new PenaltyCatalogueService(
    repository as unknown as PenaltyCatalogueRepository,
    history as unknown as SettingsHistory,
    tx.afterCommit,
  );
  return { service, repository, history, tx };
}

describe('PenaltyCatalogueService.list — searched here, never in the browser', () => {
  const catalogue = [
    {
      ...groupRow,
      id: 'g1',
      nameEn: 'Attendance',
      nameAr: 'الحضور',
      violations: [violationRow({ id: 'v1', nameEn: 'Late arrival', nameAr: 'التأخر' }), violationRow({ id: 'v2', nameEn: 'Absence', nameAr: 'الغياب' })],
    },
    {
      ...groupRow,
      id: 'g2',
      nameEn: 'Conduct',
      nameAr: 'السلوك',
      violations: [violationRow({ id: 'v3', groupId: 'g2', nameEn: 'Shouting', nameAr: 'رفع الصوت' })],
    },
  ];
  const service = () => makeService({ findGroupsWithViolations: jest.fn().mockResolvedValue(catalogue) }).service;

  it('no search: every group with every violation, no match info', async () => {
    const groups = await service().list();
    expect(groups.map((g) => [g.id, g.violations.length, g.match])).toEqual([
      ['g1', 2, undefined],
      ['g2', 1, undefined],
    ]);
  });

  it("a group's own name: the whole group; a violation's name: only it; nothing else", async () => {
    expect((await service().list('attend')).map((g) => [g.id, g.violations.map((v) => v.id), g.match])).toEqual([
      ['g1', ['v1', 'v2'], { group: true, violationCount: 2 }],
    ]);
    expect((await service().list('ABSENCE')).map((g) => [g.id, g.violations.map((v) => v.id), g.match])).toEqual([
      ['g1', ['v2'], { group: false, violationCount: 2 }],
    ]);
    expect(await service().list('nothing like it')).toEqual([]);
  });

  it('active: retired groups and violations are left out, and a group left empty too', async () => {
    const withRetired = [
      { ...catalogue[0], violations: [catalogue[0].violations[0], violationRow({ id: 'v9', nameEn: 'Old rule', nameAr: 'قديم', isActive: false })] },
      { ...catalogue[1], isActive: false },
    ];
    const svc = makeService({ findGroupsWithViolations: jest.fn().mockResolvedValue(withRetired) }).service;
    expect((await svc.list(undefined, true)).map((g) => [g.id, g.violations.map((v) => v.id)])).toEqual([['g1', ['v1']]]);
    expect((await svc.list('old', true))).toEqual([]);
    expect((await svc.list('old')).map((g) => g.id)).toEqual(['g1']);
  });

  it('Arabic letter variants and marks fold (أ/ا, ة/ه)', async () => {
    expect((await service().list('الصوت')).map((g) => g.id)).toEqual(['g2']);
    expect((await service().list('التاخر')).map((g) => g.violations.map((v) => v.id))).toEqual([['v1']]);
  });
});

describe('PenaltyCatalogueService', () => {
  it('once per day (§4): stored only when given (the schema defaults it on), and a change is history', async () => {
    const { service, repository, history } = makeService({
      updateViolation: jest.fn().mockResolvedValue(violationRow({ oncePerDay: false })),
    });
    const levels = [{ level: 1, action: 'NOTICE' as const }];
    await service.createViolation('g1', { nameEn: 'x', nameAr: 'y', levels }, null);
    expect(repository.createViolation.mock.calls[0][1]).not.toHaveProperty('oncePerDay');
    await service.createViolation('g1', { nameEn: 'x', nameAr: 'y', oncePerDay: false, levels }, null);
    expect(repository.createViolation.mock.calls[1][1]).toMatchObject({ oncePerDay: false });

    history.record.mockClear();
    const after = await service.updateViolation('v1', { oncePerDay: false }, 'u1');
    expect(after.oncePerDay).toBe(false);
    expect(repository.updateViolation).toHaveBeenCalledWith('v1', { oncePerDay: false }, undefined);
    expect((history.record.mock.calls as unknown[][])[0][0]).toMatchObject({
      oldValue: { oncePerDay: true },
      newValue: { oncePerDay: false },
    });
  });

  it('getUsable carries the flag for recording', async () => {
    const { service } = makeService({
      findViolation: jest.fn().mockResolvedValue({ ...violationRow({ oncePerDay: false }), group: { isActive: true } }),
    });
    await expect(service.getUsable('v1')).resolves.toMatchObject({ oncePerDay: false });
  });

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

  it('stores levels sorted with days null when absent, and records a catalogue history entry', async () => {
    const { service, repository, history, tx } = makeService();
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
    expect(history.record).toHaveBeenCalledWith(
      expect.objectContaining({ scope: 'catalogue', key: HrCatalogueKey.VIOLATIONS, oldValue: null, changedById: 'u1' }),
    );
    expect(tx.state).toEqual({ committed: ['catalogue', 'history'], commits: 1, rollbacks: 0 });
  });

  it('groups: create and update commit with their history entry', async () => {
    const { service, history, tx } = makeService();
    await service.createGroup({ nameEn: 'A', nameAr: 'أ' }, 'u1');
    await service.updateGroup('g1', { isActive: false }, 'u1');
    expect(history.record).toHaveBeenLastCalledWith({
      scope: 'catalogue',
      key: HrCatalogueKey.PENALTY_GROUPS,
      oldValue: groupRow,
      newValue: { ...groupRow, isActive: false },
      changedById: 'u1',
    });
    expect(tx.state).toEqual({
      committed: ['catalogue', 'history', 'catalogue', 'history'],
      commits: 2,
      rollbacks: 0,
    });
  });

  it('the history write fails → the catalogue change rolls back with it', async () => {
    const { service, history, tx } = makeService();
    history.record.mockImplementation(() => Promise.reject(new Error('audit down')));
    const levels = [{ level: 1, action: 'NOTICE' as const }];
    await expect(service.createGroup({ nameEn: 'A', nameAr: 'أ' }, 'u1')).rejects.toThrow('audit down');
    await expect(service.updateGroup('g1', { isActive: false }, 'u1')).rejects.toThrow('audit down');
    await expect(
      service.createViolation('g1', { nameEn: 'x', nameAr: 'y', levels }, 'u1'),
    ).rejects.toThrow('audit down');
    await expect(service.updateViolation('v1', { nameEn: 'X' }, 'u1')).rejects.toThrow('audit down');
    expect(tx.state).toEqual({ committed: [], commits: 0, rollbacks: 4 });
  });

  it('the catalogue write fails → no history entry', async () => {
    const { service, history, tx } = makeService({
      updateViolation: jest.fn().mockRejectedValue(new Error('db down')),
    });
    await expect(service.updateViolation('v1', { nameEn: 'X' }, 'u1')).rejects.toThrow('db down');
    expect(history.record).not.toHaveBeenCalled();
    expect(tx.state).toEqual({ committed: [], commits: 0, rollbacks: 1 });
  });

  it('an update that changes nothing passes equal snapshots (history writes no entry for them)', async () => {
    const { service, history } = makeService();
    await service.updateViolation('v1', { nameEn: 'Late' }, null);
    const [change] = (history.record.mock.calls as unknown[][])[0] as [
      { oldValue: unknown; newValue: unknown },
    ];
    expect(change.oldValue).toEqual(change.newValue);
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
