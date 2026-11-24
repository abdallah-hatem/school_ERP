import { NotFoundException } from '@nestjs/common';
import { ErrorCode } from '@school-erp/shared';
import { CodedException } from '../../../../common/errors/coded.exception';
import type { AuditService } from '../../../../core/audit';
import type { FileStorageService } from '../../../../core/settings';
import type { AfterCommit } from '../../../../database/transactions';
import type { EmployeeScope } from '../../access/employee-scope.pure';
import type { HrAccessService } from '../../access/hr-access.service';
import type { ContractFileRow, ContractFilesRepository } from '../repositories/contract-files.repository';
import type { ContractRow, ContractsRepository } from '../repositories/contracts.repository';
import { CONTRACT_SIGNED_COPY_FOLDER, ContractSignedCopyService, uploadedName, type UploadedPage } from './contract-signed-copy.service';
import type { ContractsService } from './contracts.service';

/*
 * A contract's signed copy (owner, 2026-11-24), as a timeline: pages added in order, a refused file,
 * a page removed with a reason, the openings — with the contract's own checks (scope, own contract,
 * locks) faked through `ContractsService.loadForWrite`. The database side is the API e2e spec
 * `hr-contract-signed-copy.e2e-spec.ts`.
 */

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
const PDF = Buffer.from('%PDF-1.7\n');

/** The contract row, as far as the signed copy reads it. */
function contractRow(over: { status?: ContractRow['status']; stageId?: string } = {}): ContractRow {
  return {
    id: 'c1',
    employeeId: 'e1',
    status: over.status ?? 'ACTIVE',
    employee: {
      id: 'e1',
      nameEn: 'Mona',
      nameAr: 'منى',
      managerId: null,
      stage: { id: over.stageId ?? 'st-1', nameEn: 'Primary', nameAr: 'ابتدائي', isNoStage: false },
      otherStages: [],
    },
  } as unknown as ContractRow;
}

function setup(opts: { row?: ContractRow; viewScope?: EmployeeScope; loadForWrite?: () => Promise<ContractRow[]> } = {}) {
  const row = opts.row ?? contractRow();
  const pages: (ContractFileRow & { removedReason?: string; removedById?: string | null })[] = [];
  const repository = {
    listActive: jest.fn((contractId: string) =>
      Promise.resolve(pages.filter((p) => p.contractId === contractId && !p.removedAt).sort((a, b) => a.pageOrder - b.pageOrder)),
    ),
    nextPageOrder: jest.fn((contractId: string) =>
      Promise.resolve(Math.max(0, ...pages.filter((p) => p.contractId === contractId).map((p) => p.pageOrder)) + 1),
    ),
    create: jest.fn((data: { contractId: string; url: string; name: string; mimeType: string; sizeBytes: number; pageOrder: number }) => {
      const page = { id: `f${pages.length + 1}`, ...data, uploadedAt: new Date('2026-11-24T09:00:00Z'), removedAt: null, uploadedBy: { id: 'u-hr', name: 'Laila' } };
      pages.push(page);
      return Promise.resolve(page);
    }),
    findActive: jest.fn((contractId: string, id: string) =>
      Promise.resolve(pages.find((p) => p.id === id && p.contractId === contractId && !p.removedAt) ?? null),
    ),
    markRemoved: jest.fn((id: string, by: string | null, reason: string) => {
      Object.assign(pages.find((p) => p.id === id)!, { removedAt: new Date(), removedById: by, removedReason: reason });
      return Promise.resolve();
    }),
    findByUrl: jest.fn((url: string) => Promise.resolve(pages.find((p) => p.url === url) ?? null)),
  };
  const contracts = { loadForWrite: jest.fn(opts.loadForWrite ?? (() => Promise.resolve([row]))) };
  const contractRows = { findOne: jest.fn((id: string) => Promise.resolve(id === row.id ? row : null)) };
  const scope = opts.viewScope ?? { kind: 'all' };
  const access = {
    scope: jest.fn(() => Promise.resolve(scope)),
    scopeOf: jest.fn(() => Promise.resolve(scope)),
    actor: jest.fn(() => Promise.resolve({ userId: 'u-hr', employeeId: 'e-hr' })),
  };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const files = { save: jest.fn((folder: string, name: string) => Promise.resolve(`/files/${folder}/${name}`)) };
  const afterCommit = { inTransaction: (fn: () => Promise<unknown>) => fn() };
  const service = new ContractSignedCopyService(
    contracts as unknown as ContractsService,
    contractRows as unknown as ContractsRepository,
    repository as unknown as ContractFilesRepository,
    access as unknown as HrAccessService,
    audit as unknown as AuditService,
    files as unknown as FileStorageService,
    afterCommit as unknown as AfterCommit,
  );
  return { service, pages, repository, contracts, audit, files };
}

const file = (buffer: Buffer, mimetype: string, originalname: string): UploadedPage => ({ buffer, mimetype, size: buffer.length, originalname });

async function codeOf(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    if (e instanceof CodedException) return e.code;
    if (e instanceof NotFoundException) return 'NOT_FOUND';
    return (e as { code?: string }).code ?? String(e);
  }
  throw new Error('expected a refusal');
}

describe('ContractSignedCopyService', () => {
  it('two pages in upload order → one removed with a reason (kept) → the copy reads one; each write is one entry', async () => {
    const { service, pages, contracts, audit, files } = setup();
    await service.add('c1', file(PNG, 'image/png', 'IMG_2041.png'));
    const two = await service.add('c1', file(PDF, 'application/pdf', 'page-2.pdf'));
    expect(two.files.map((f) => [f.page, f.name, f.mimeType])).toEqual([
      [1, 'IMG_2041.png', 'image/png'],
      [2, 'page-2.pdf', 'application/pdf'],
    ]);
    // Stored in the sensitive folder under the contract's id; the contract's checks ran first (lock, scope, own).
    expect(files.save.mock.calls[0][0]).toBe(CONTRACT_SIGNED_COPY_FOLDER);
    expect(files.save.mock.calls[0][1]).toMatch(/^c1-[0-9a-f-]{36}\.png$/);
    expect(contracts.loadForWrite).toHaveBeenCalledWith(['c1']);
    expect(audit.record.mock.calls.map(([e]) => [e.action, e.before, e.after])).toEqual([
      ['hr.contract.signed_copy_add', { signedCopyPages: 0 }, { signedCopyPages: 1, signedCopyFile: 'IMG_2041.png' }],
      ['hr.contract.signed_copy_add', { signedCopyPages: 1 }, { signedCopyPages: 2, signedCopyFile: 'page-2.pdf' }],
    ]);

    const after = await service.remove('c1', 'f1', 'Blurry photo');
    expect(after.files.map((f) => [f.page, f.name])).toEqual([[2, 'page-2.pdf']]);
    expect(pages[0]).toMatchObject({ removedReason: 'Blurry photo', removedById: 'u-hr' });
    expect(audit.record.mock.calls[2]![0]).toMatchObject({
      action: 'hr.contract.signed_copy_remove',
      entity: { type: 'employee_contract', id: 'c1', label: { en: 'Mona', ar: 'منى' } },
      before: { signedCopyPages: 2, signedCopyFile: 'IMG_2041.png' },
      after: { signedCopyPages: 1, signedCopyFile: null, reason: 'Blurry photo' },
    });
    // A page added later goes after every page the contract ever had (the removed one keeps its place).
    const three = await service.add('c1', file(PNG, 'image/png', 'again.png'));
    expect(three.files.map((f) => f.page)).toEqual([2, 3]);
    // Reopened: the same pages.
    expect((await service.get('c1')).files.map((f) => f.name)).toEqual(['page-2.pdf', 'again.png']);
  });

  it('a page removed twice, or of another contract, is not found', async () => {
    const { service } = setup();
    await service.add('c1', file(PNG, 'image/png', 'a.png'));
    await service.remove('c1', 'f1', 'x');
    expect(await codeOf(service.remove('c1', 'f1', 'again'))).toBe('NOT_FOUND');
    expect(await codeOf(service.remove('c1', 'f-unknown', 'x'))).toBe('NOT_FOUND');
  });

  it('a wrong type, a renamed file or one over 10 MB is refused before anything is stored', async () => {
    const { service, files, audit } = setup();
    expect(await codeOf(service.add('c1', file(Buffer.from('text'), 'image/png', 'x.png')))).toBe(ErrorCode.INVALID_FILE_TYPE);
    expect(await codeOf(service.add('c1', file(Buffer.from('<html>'), 'application/pdf', 'x.pdf')))).toBe(ErrorCode.INVALID_FILE_TYPE);
    expect(await codeOf(service.add('c1', file(PNG, 'application/pdf', 'x.pdf')))).toBe(ErrorCode.INVALID_FILE_TYPE);
    const big = { ...file(PDF, 'application/pdf', 'big.pdf'), size: 10 * 1024 * 1024 + 1 };
    expect(await codeOf(service.add('c1', big))).toBe(ErrorCode.FILE_TOO_LARGE);
    expect(files.save).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('a cancelled contract gets no signed copy (409); past and upcoming ones do', async () => {
    const cancelled = setup({ row: contractRow({ status: 'CANCELLED' }) });
    expect(await codeOf(cancelled.service.add('c1', file(PNG, 'image/png', 'x.png')))).toBe(ErrorCode.CONTRACT_CANCELLED);
    for (const status of ['RENEWED', 'NOT_RENEWED', 'ENDED_EARLY'] as const) {
      const { service } = setup({ row: contractRow({ status }) });
      expect((await service.add('c1', file(PNG, 'image/png', 'x.png'))).files).toHaveLength(1);
    }
  });

  it('own contract, out of scope or unlinked: refused as the contract refuses (nothing stored)', async () => {
    const own = setup({ loadForWrite: () => Promise.reject(new CodedException(403, ErrorCode.OWN_CONTRACT)) });
    expect(await codeOf(own.service.add('c1', file(PNG, 'image/png', 'x.png')))).toBe(ErrorCode.OWN_CONTRACT);
    expect(await codeOf(own.service.remove('c1', 'f1', 'x'))).toBe(ErrorCode.OWN_CONTRACT);
    expect(own.files.save).not.toHaveBeenCalled();
    const outside = setup({ loadForWrite: () => Promise.reject(new NotFoundException()) });
    expect(await codeOf(outside.service.add('c1', file(PNG, 'image/png', 'x.png')))).toBe('NOT_FOUND');
  });

  it('viewing: a stage head sees their stage’s copy and its pages open; another stage’s is not found; a removed page opens for nobody', async () => {
    const mine = setup({ viewScope: { kind: 'stage', stageIds: ['st-1'] } });
    await mine.service.add('c1', file(PNG, 'image/png', 'a.png'));
    await mine.service.add('c1', file(PNG, 'image/png', 'b.png'));
    const [a, b] = mine.pages;
    expect((await mine.service.get('c1')).files).toHaveLength(2);
    expect(await mine.service.canOpen({ id: 'u-head' }, a.url)).toBe(true);
    await mine.service.remove('c1', b.id, 'duplicate');
    expect(await mine.service.canOpen({ id: 'u-head' }, b.url)).toBe(false);
    expect(await mine.service.canOpen({ id: 'u-head' }, '/files/contract-signed-copies/unknown.png')).toBe(false);

    const other = setup({ row: contractRow({ stageId: 'st-2' }), viewScope: { kind: 'stage', stageIds: ['st-1'] } });
    await other.service.add('c1', file(PNG, 'image/png', 'c.png'));
    expect(await codeOf(other.service.get('c1'))).toBe('NOT_FOUND');
    expect(await other.service.canOpen({ id: 'u-head' }, other.pages[0].url)).toBe(false);
    expect(await codeOf(mine.service.get('c-unknown'))).toBe('NOT_FOUND');
  });

  it('each opening is one entry on the contract, naming the page', async () => {
    const { service, pages, audit } = setup();
    await service.add('c1', file(PNG, 'image/png', 'a.png'));
    audit.record.mockClear();
    await service.recordOpened(pages[0].url);
    expect(audit.record).toHaveBeenCalledWith({
      action: 'hr.contract.document_open',
      entity: { type: 'employee_contract', id: 'c1', label: { en: 'Mona', ar: 'منى' } },
      changes: [{ field: 'document', before: null, after: 'a.png' }],
    });
    expect(await codeOf(service.recordOpened('/files/contract-signed-copies/unknown.png'))).toBe('NOT_FOUND');
  });

  it('the picked name: Latin-1 multipart bytes read back as UTF-8, no path, no control characters; none → page.<ext>', () => {
    const arabic = Buffer.from('عقد-١.jpg', 'utf8').toString('latin1');
    expect(uploadedName(arabic, 'jpg')).toBe('عقد-١.jpg');
    expect(uploadedName('عقد.png', 'png')).toBe('عقد.png');
    expect(uploadedName('C:\\scans\\page\u0007.pdf', 'pdf')).toBe('page.pdf');
    expect(uploadedName('../../etc/x.png', 'png')).toBe('x.png');
    expect(uploadedName(undefined, 'png')).toBe('page.png');
    expect(uploadedName('a'.repeat(300), 'png')).toHaveLength(200);
  });
});
