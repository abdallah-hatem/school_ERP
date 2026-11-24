import { ErrorCode, type ContractDocument } from '@school-erp/shared';
import { CodedException } from '../../../../common/errors/coded.exception';
import type { AuditService } from '../../../../core/audit';
import type { AfterCommit } from '../../../../database/transactions';
import type { HrAccessService } from '../../access/hr-access.service';
import type { ContractTemplatesRepository, TemplateWithVersion } from '../repositories/contract-templates.repository';
import { ContractTemplatesService } from './contract-templates.service';

const doc = (text: string, key = 'employee.nameAr'): ContractDocument =>
  ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }, { type: 'field', attrs: { key } }] }] }) as ContractDocument;

/** An in-memory repository: templates with their versions. */
function fakeRepository() {
  const templates = new Map<string, { nameEn: string; nameAr: string; defaultForWorkSystem: string | null; hiddenAt: Date | null; currentVersion: number }>();
  const versions = new Map<string, { bodyAr: unknown; bodyEn: unknown; usesSalary: boolean }>();
  let n = 0;
  const row = (id: string): TemplateWithVersion | null => {
    const t = templates.get(id);
    if (!t) return null;
    const v = versions.get(`${id}:${t.currentVersion}`)!;
    return {
      template: { id, ...t, createdAt: new Date(), updatedAt: new Date(), createdBy: null, updatedBy: null },
      version: { id: `${id}:${t.currentVersion}`, version: t.currentVersion, fields: [], createdAt: new Date(), createdBy: null, ...v },
    } as unknown as TemplateWithVersion;
  };
  return {
    templates,
    versions,
    findOne: jest.fn((id: string) => Promise.resolve(row(id))),
    lock: jest.fn().mockResolvedValue(undefined),
    nameTaken: jest.fn((en: string, ar: string, except: string | null) =>
      Promise.resolve([...templates.entries()].some(([id, t]) => id !== except && (t.nameEn.toLowerCase() === en.toLowerCase() || t.nameAr === ar))),
    ),
    findDefault: jest.fn((ws: string, except: string | null) => {
      const hit = [...templates.entries()].find(([id, t]) => id !== except && t.defaultForWorkSystem === ws && !t.hiddenAt);
      return Promise.resolve(hit ? { id: hit[0], nameEn: hit[1].nameEn, nameAr: hit[1].nameAr } : null);
    }),
    create: jest.fn((d: { nameEn: string; nameAr: string; defaultForWorkSystem: string | null }) => {
      const id = `t${++n}`;
      templates.set(id, { nameEn: d.nameEn, nameAr: d.nameAr, defaultForWorkSystem: d.defaultForWorkSystem, hiddenAt: null, currentVersion: 1 });
      return Promise.resolve(id);
    }),
    update: jest.fn((id: string, data: Record<string, unknown>) => {
      const t = templates.get(id)!;
      Object.assign(t, Object.fromEntries(Object.entries(data).filter(([k]) => k in t)));
      return Promise.resolve();
    }),
    addVersion: jest.fn((d: { templateId: string; version: number; bodyAr: unknown; bodyEn: unknown; usesSalary: boolean }) => {
      versions.set(`${d.templateId}:${d.version}`, { bodyAr: d.bodyAr, bodyEn: d.bodyEn, usesSalary: d.usesSalary });
      return Promise.resolve();
    }),
  };
}

function setup() {
  const repository = fakeRepository();
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const access = { actor: jest.fn().mockResolvedValue({ userId: 'u1', employeeId: null }) };
  const afterCommit = { inTransaction: (fn: () => Promise<unknown>) => fn() };
  const service = new ContractTemplatesService(
    repository as unknown as ContractTemplatesRepository,
    access as unknown as HrAccessService,
    audit as unknown as AuditService,
    afterCommit as unknown as AfterCommit,
  );
  return { service, repository, audit };
}

const base = { nameEn: 'Full-time contract', nameAr: 'عقد', defaultForWorkSystem: null, bodyAr: doc('a'), bodyEn: null };

async function codeOf(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'resolved';
  } catch (e) {
    if (e instanceof CodedException) return e.code;
    throw e;
  }
}

describe('ContractTemplatesService', () => {
  it('creates version 1 with its entry; a rename is not a version, a text change is', async () => {
    const { service, audit } = setup();
    const { template } = await service.create(base);
    expect(template.version).toBe(1);
    const renamed = (await service.update(template.id, { ...base, nameEn: 'Renamed', baseVersion: 1 })).template;
    expect(renamed.version).toBe(1);
    const changed = (await service.update(template.id, { ...base, nameEn: 'Renamed', bodyAr: doc('b'), baseVersion: 1 })).template;
    expect(changed.version).toBe(2);
    expect(audit.record.mock.calls.map(([e]) => (e as { action: string }).action)).toEqual([
      'hr.contract_template.create',
      'hr.contract_template.update',
      'hr.contract_template.update',
    ]);
  });

  it('edge case 12 — a stale baseVersion → TEMPLATE_CHANGED, nothing written', async () => {
    const { service, repository } = setup();
    const { template } = await service.create(base);
    await service.update(template.id, { ...base, bodyAr: doc('first'), baseVersion: 1 });
    expect(await codeOf(service.update(template.id, { ...base, bodyAr: doc('second'), baseVersion: 1 }))).toBe(ErrorCode.TEMPLATE_CHANGED);
    expect(repository.versions.size).toBe(2);
  });

  it('making a template a work system’s default takes it from the one that had it (its own entry)', async () => {
    const { service, audit } = setup();
    const first = (await service.create({ ...base, nameEn: 'A', nameAr: 'أ', defaultForWorkSystem: 'FULL_TIME' })).template;
    const second = await service.create({ ...base, nameEn: 'B', nameAr: 'ب', defaultForWorkSystem: 'FULL_TIME' });
    expect(second.tookDefaultFrom).toEqual({ id: first.id, nameEn: 'A', nameAr: 'أ' });
    expect((await service.get(first.id)).defaultForWorkSystem).toBeNull();
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'hr.contract_template.update', entity: expect.objectContaining({ id: first.id }) }));
  });

  it('edge case 10 — hiding the default drops the mark; a hidden template can’t be made a default; showing doesn’t bring it back', async () => {
    const { service } = setup();
    const { template } = await service.create({ ...base, defaultForWorkSystem: 'FULL_TIME' });
    expect((await service.hide(template.id)).defaultForWorkSystem).toBeNull();
    expect(await codeOf(service.update(template.id, { ...base, defaultForWorkSystem: 'FULL_TIME', baseVersion: 1 }))).toBe(ErrorCode.TEMPLATE_HIDDEN);
    expect(await service.show(template.id)).toMatchObject({ hidden: false, defaultForWorkSystem: null });
  });

  it('edge cases 8 and 23 — an optional phrase without a field, or a text over 200 KB, is refused before anything is written', async () => {
    const { service, repository } = setup();
    const optional = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'optional', content: [{ type: 'text', text: 'x' }] }] }] } as ContractDocument;
    expect(await codeOf(service.create({ ...base, bodyAr: optional }))).toBe(ErrorCode.OPTIONAL_PHRASE_NEEDS_FIELD);
    expect(await codeOf(service.create({ ...base, bodyAr: doc('x'.repeat(201 * 1024)) }))).toBe(ErrorCode.TEMPLATE_TOO_LONG);
    expect(await codeOf(service.create({ ...base, bodyAr: { type: 'doc', content: [{ type: 'paragraph' }] } }))).toBe(ErrorCode.TEMPLATE_TEXT_EMPTY);
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('a name already used in either language → TEMPLATE_NAME_TAKEN', async () => {
    const { service } = setup();
    await service.create(base);
    expect(await codeOf(service.create({ ...base, nameAr: 'آخر', nameEn: 'FULL-TIME CONTRACT' }))).toBe(ErrorCode.TEMPLATE_NAME_TAKEN);
  });
});
