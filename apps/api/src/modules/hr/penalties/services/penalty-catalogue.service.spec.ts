import { NotFoundException } from '@nestjs/common';
import { ErrorCode, HrCatalogueKey, type AuditChange } from '@school-erp/shared';
import type { AuditService } from '../../../../core/audit';
import type { AfterCommit } from '../../../../database/transactions';
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

function makeService(repo: Partial<Record<keyof PenaltyCatalogueRepository, jest.Mock>> = {}) {
  const audit = { record: jest.fn(() => Promise.resolve()) };
  const repository = {
    findGroup: jest.fn().mockResolvedValue({ id: 'g1', nameEn: 'A', nameAr: 'أ', sortOrder: 0, isActive: true }),
    findViolation: jest.fn().mockResolvedValue({ ...violationRow(), group: { isActive: true } }),
    createViolation: jest.fn().mockResolvedValue(violationRow()),
    updateViolation: jest.fn().mockResolvedValue(violationRow()),
    ...repo,
  };
  const service = new PenaltyCatalogueService(
    repository as unknown as PenaltyCatalogueRepository,
    audit as unknown as AuditService,
    { inTransaction: (fn: () => Promise<unknown>) => fn() } as unknown as AfterCommit,
  );
  return { service, repository, audit };
}

describe('PenaltyCatalogueService', () => {
  it('once per day (§4): stored only when given (the schema defaults it on), and a change is history', async () => {
    const { service, repository, audit } = makeService({
      updateViolation: jest.fn().mockResolvedValue(violationRow({ oncePerDay: false })),
    });
    const levels = [{ level: 1, action: 'NOTICE' as const }];
    await service.createViolation('g1', { nameEn: 'x', nameAr: 'y', levels });
    expect(repository.createViolation.mock.calls[0][1]).not.toHaveProperty('oncePerDay');
    await service.createViolation('g1', { nameEn: 'x', nameAr: 'y', oncePerDay: false, levels });
    expect(repository.createViolation.mock.calls[1][1]).toMatchObject({ oncePerDay: false });

    audit.record.mockClear();
    const after = await service.updateViolation('v1', { oncePerDay: false });
    expect(after.oncePerDay).toBe(false);
    expect(repository.updateViolation).toHaveBeenCalledWith('v1', { oncePerDay: false }, undefined);
    const [[input]] = audit.record.mock.calls as unknown as [[{ action: string; changes: AuditChange[] }]];
    expect(input.action).toBe('hr.violation.update');
    expect(input.changes[0]).toMatchObject({
      field: HrCatalogueKey.VIOLATIONS,
      before: { oncePerDay: true },
      after: { oncePerDay: false },
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
      ),
    ).rejects.toMatchObject({ code: ErrorCode.INVALID_LEVELS });
    expect(repository.createViolation).not.toHaveBeenCalled();
  });

  it('stores levels sorted with days null when absent, and emits a catalogue history event', async () => {
    const { service, repository, audit } = makeService();
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
    );
    expect(repository.createViolation).toHaveBeenCalledWith('g1', expect.anything(), [
      { level: 1, action: 'NOTICE', days: null },
      { level: 2, action: 'WARNING', days: null },
    ]);
    expect(v.levels[0]).toEqual({ level: 1, action: 'DEDUCT_DAYS', days: 1.5 });
    expect(audit.record).toHaveBeenCalledWith({
      action: 'hr.violation.create',
      entity: { type: 'violation', id: 'v1', label: { en: 'Late', ar: 'تأخر' } },
      changes: [{ field: HrCatalogueKey.VIOLATIONS, before: null, after: v }],
    });
  });

  it('an update that changes nothing still answers @Audited with equal snapshots (no entry written)', async () => {
    const { service, audit } = makeService();
    await service.updateViolation('v1', { nameEn: 'Late' });
    const [[input]] = audit.record.mock.calls as unknown as [[{ changes: AuditChange[] }]];
    expect(input.changes[0]?.before).toEqual(input.changes[0]?.after);
  });

  it('a group edit records hr.penalty_group.update with both names', async () => {
    const { service, audit } = makeService({
      updateGroup: jest.fn().mockResolvedValue({ id: 'g1', nameEn: 'B', nameAr: 'ب', sortOrder: 0, isActive: true }),
    });
    await service.updateGroup('g1', { nameEn: 'B', nameAr: 'ب' });
    expect(audit.record).toHaveBeenCalledWith({
      action: 'hr.penalty_group.update',
      entity: { type: 'penalty_group', id: 'g1', label: { en: 'B', ar: 'ب' } },
      changes: [
        {
          field: HrCatalogueKey.PENALTY_GROUPS,
          before: { id: 'g1', nameEn: 'A', nameAr: 'أ', sortOrder: 0, isActive: true },
          after: { id: 'g1', nameEn: 'B', nameAr: 'ب', sortOrder: 0, isActive: true },
        },
      ],
    });
  });

  it('unknown group / violation → 404, nothing recorded', async () => {
    const { service, audit } = makeService({
      findGroup: jest.fn().mockResolvedValue(null),
      findViolation: jest.fn().mockResolvedValue(null),
    });
    await expect(service.updateGroup('g', {})).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.updateViolation('v', {})).rejects.toBeInstanceOf(NotFoundException);
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('getUsable: a violation in a retired group is retired too', async () => {
    const { service } = makeService({
      findViolation: jest.fn().mockResolvedValue({ ...violationRow(), group: { isActive: false } }),
    });
    await expect(service.getUsable('v1')).rejects.toMatchObject({ code: ErrorCode.VIOLATION_RETIRED });
  });
});
