import { NotFoundException } from '@nestjs/common';
import { ErrorCode, HrListKey, JobTitle, ListItem } from '@school-erp/shared';
import type { AuditService } from '../../../../core/audit';
import type { AfterCommit } from '../../../../database/transactions';
import { DepartmentsRepository } from '../repositories/departments.repository';
import { JobTitlesRepository } from '../repositories/job-titles.repository';
import { DepartmentsService } from './departments.service';
import { JobTitlesService } from './job-titles.service';

/** Runs the work at once (the spec has no database transaction). */
const inline = { inTransaction: (fn: () => Promise<unknown>) => fn() } as unknown as AfterCommit;

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
  const audit = { record: jest.fn(() => Promise.resolve()) };
  const service = new DepartmentsService(
    repository as unknown as DepartmentsRepository,
    audit as unknown as AuditService,
    inline,
  );
  return { service, repository, audit };
}

describe('ListItemsService (departments)', () => {
  it('create records hr.department.create with both names and the new snapshot under the history key, after the write', async () => {
    const created = item();
    const { service, repository, audit } = makeService({
      createItem: jest.fn().mockResolvedValue(created),
    });
    await expect(service.create({ nameEn: 'Teaching', nameAr: 'تدريس' })).resolves.toBe(created);
    expect(repository.createItem.mock.invocationCallOrder[0]).toBeLessThan(
      audit.record.mock.invocationCallOrder[0] ?? 0,
    );
    expect(audit.record).toHaveBeenCalledWith({
      action: 'hr.department.create',
      entity: { type: 'department', id: 'd1', label: { en: 'Teaching', ar: 'تدريس' } },
      changes: [{ field: HrListKey.DEPARTMENTS, before: null, after: created }],
    });
  });

  it('update records hr.department.update with old and new snapshots', async () => {
    const before = item();
    const after = item({ isActive: false });
    const { service, audit } = makeService({
      findOne: jest.fn().mockResolvedValue(before),
      updateItem: jest.fn().mockResolvedValue(after),
    });
    await service.update('d1', { isActive: false });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'hr.department.update',
        changes: [{ field: HrListKey.DEPARTMENTS, before, after }],
      }),
    );
  });

  it('an update that changes nothing still answers @Audited, with equal snapshots (no entry written)', async () => {
    const { service, audit } = makeService({
      findOne: jest.fn().mockResolvedValue(item()),
      updateItem: jest.fn().mockResolvedValue(item()),
    });
    await service.update('d1', { nameEn: 'Teaching' });
    expect(audit.record).toHaveBeenCalledTimes(1);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ changes: [{ field: HrListKey.DEPARTMENTS, before: item(), after: item() }] }),
    );
  });

  it('update of an unknown id → 404, nothing recorded', async () => {
    const { service, audit } = makeService({ findOne: jest.fn().mockResolvedValue(null) });
    await expect(service.update('x', { nameEn: 'A' })).rejects.toBeInstanceOf(NotFoundException);
    expect(audit.record).not.toHaveBeenCalled();
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
    const audit = { record: jest.fn(() => Promise.resolve()) };
    const service = new JobTitlesService(
      repository as unknown as JobTitlesRepository,
      audit as unknown as AuditService,
      inline,
    );
    return { service, repository, audit };
  }

  it('create passes managesPeople when given, and leaves it to the default when not', async () => {
    const { service, repository } = makeTitles({
      createItem: jest.fn().mockResolvedValue(title({ managesPeople: true })),
    });
    await service.create({ nameEn: 'Principal', nameAr: 'مدير المدرسة', managesPeople: true });
    expect(repository.createItem).toHaveBeenLastCalledWith({
      nameEn: 'Principal',
      nameAr: 'مدير المدرسة',
      managesPeople: true,
    });
    await service.create({ nameEn: 'Teacher', nameAr: 'معلم' });
    expect(repository.createItem).toHaveBeenLastCalledWith({ nameEn: 'Teacher', nameAr: 'معلم' });
  });

  it('turning managesPeople on records hr.job_title.update with both snapshots', async () => {
    const before = title();
    const after = title({ managesPeople: true });
    const { service, repository, audit } = makeTitles({
      findOne: jest.fn().mockResolvedValue(before),
      updateItem: jest.fn().mockResolvedValue(after),
    });
    await expect(service.update('j1', { managesPeople: true })).resolves.toBe(after);
    expect(repository.updateItem).toHaveBeenCalledWith('j1', { managesPeople: true });
    expect(audit.record).toHaveBeenCalledWith({
      action: 'hr.job_title.update',
      entity: { type: 'job_title', id: 'j1', label: { en: 'Principal', ar: 'مدير المدرسة' } },
      changes: [{ field: HrListKey.JOB_TITLES, before, after }],
    });
  });
});
