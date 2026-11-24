import { NotFoundException } from '@nestjs/common';
import { ErrorCode, type ContractDocument } from '@school-erp/shared';
import { CodedException } from '../../../../common/errors/coded.exception';
import type { PdfRenderer } from '../../../../common/pdf/pdf-renderer.service';
import type { AuditService } from '../../../../core/audit';
import type { FileStorageService, SettingsService } from '../../../../core/settings';
import type { AfterCommit } from '../../../../database/transactions';
import type { EmployeeScope } from '../../access/employee-scope.pure';
import type { HrAccessService } from '../../access/hr-access.service';
import type { ContractTemplatesRepository } from '../../contract-templates/repositories/contract-templates.repository';
import type { ContractCopiesRepository } from '../repositories/contract-copies.repository';
import type { ContractsRepository } from '../repositories/contracts.repository';
import { ContractPrintService } from './contract-print.service';

const TODAY = '2026-06-02';
const doc = (...keys: string[]): ContractDocument =>
  ({
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x ' }, ...keys.map((key) => ({ type: 'field', attrs: { key } }))] }],
  }) as ContractDocument;

const ALL: EmployeeScope = { kind: 'all' };
const NONE: EmployeeScope = { kind: 'none' };

function setup(opts: { view?: EmployeeScope; manage?: EmployeeScope; salary?: EmployeeScope; actorEmployee?: string | null; status?: string; hidden?: boolean; version?: number; bodyEn?: ContractDocument | null; body?: ContractDocument } = {}) {
  const row = {
    id: 'c1',
    employeeId: 'e1',
    startsOn: new Date('2026-06-01'),
    endsOn: new Date('2027-05-31'),
    endedOn: null,
    status: opts.status ?? 'ACTIVE',
    employee: { id: 'e1', code: 'EMP-0006', nameEn: 'Nadia', nameAr: 'نادية', managerId: null, stage: { id: 's1' }, otherStages: [] },
  };
  const contracts = { findOne: jest.fn().mockResolvedValue(row) };
  const employee = {
    id: 'e1',
    code: 'EMP-0006',
    nameEn: 'Nadia',
    nameAr: 'نادية',
    nationalId: null,
    address: null,
    hireDate: new Date('2021-09-01'),
    workSystem: 'FULL_TIME',
    basicSalary: 950_000,
    managerId: null,
    jobTitle: { nameEn: 'Accountant', nameAr: 'محاسبة' },
    department: { nameEn: 'Finance', nameAr: 'المالية' },
    stage: { id: 's1', nameEn: 'Primary', nameAr: 'الابتدائي', isNoStage: false },
    otherStages: [],
  };
  const copies = {
    findEmployee: jest.fn().mockResolvedValue(employee),
    ofContracts: jest.fn().mockResolvedValue([]),
    create: jest.fn((data: Record<string, unknown>) =>
      Promise.resolve({
        ...data,
        id: 'copy1',
        printedAt: new Date(),
        templateVersion: { version: opts.version ?? 1 },
        contract: { startsOn: new Date('2026-06-01') },
        employee: { code: 'EMP-0006' },
      }),
    ),
  };
  const template = {
    template: { id: 't1', nameEn: 'Full-time contract', nameAr: 'عقد', currentVersion: opts.version ?? 1, hiddenAt: opts.hidden ? new Date() : null, defaultForWorkSystem: 'FULL_TIME' },
    version: { id: 'v1', bodyAr: opts.body ?? doc('contract.salary', 'employee.nameAr'), bodyEn: opts.bodyEn ?? null, usesSalary: true },
  };
  const templates = { findOne: jest.fn().mockResolvedValue(template) };
  const access = {
    scope: jest.fn((key: string) => Promise.resolve(key === 'hr.contracts.view' ? (opts.view ?? ALL) : (opts.manage ?? ALL))),
    salaryScope: jest.fn().mockResolvedValue(opts.salary ?? ALL),
    assertLinkedForPay: jest.fn().mockResolvedValue(undefined),
    actor: jest.fn().mockResolvedValue({ userId: 'u1', employeeId: opts.actorEmployee ?? null }),
    actorName: jest.fn().mockReturnValue('Mona'),
  };
  const settings = {
    getSchoolSettings: jest.fn().mockResolvedValue({
      nameEn: 'Sample School',
      nameAr: 'مدرسة',
      logoUrl: null,
      addressEn: '',
      addressAr: '',
      signatoryNameEn: '',
      signatoryNameAr: '',
      signatoryTitleEn: '',
      signatoryTitleAr: '',
    }),
  };
  const files = { save: jest.fn((f: string, n: string) => Promise.resolve(`/files/${f}/${n}`)), readUrl: jest.fn(), remove: jest.fn() };
  const pdf = { render: jest.fn().mockResolvedValue({ pdf: Buffer.from('%PDF'), pageCount: 2 }) };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const afterCommit = { inTransaction: jest.fn((fn: () => Promise<unknown>) => fn()), onRollback: jest.fn() };
  const service = new ContractPrintService(
    contracts as unknown as ContractsRepository,
    copies as unknown as ContractCopiesRepository,
    templates as unknown as ContractTemplatesRepository,
    access as unknown as HrAccessService,
    settings as unknown as SettingsService,
    files as unknown as FileStorageService,
    pdf as unknown as PdfRenderer,
    audit as unknown as AuditService,
    afterCommit as unknown as AfterCommit,
  );
  jest.spyOn(service, 'today').mockReturnValue(TODAY);
  return { service, copies, pdf, files, audit, afterCommit };
}

async function codeOf(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'resolved';
  } catch (e) {
    if (e instanceof CodedException) return e.code;
    if (e instanceof NotFoundException) return 'NOT_FOUND';
    throw e;
  }
}

describe('ContractPrintService', () => {
  it('edge case 1 — your own contract → OWN_CONTRACT', async () => {
    const { service } = setup({ actorEmployee: 'e1' });
    expect(await codeOf(service.preview('c1', 't1', 'AR'))).toBe(ErrorCode.OWN_CONTRACT);
  });

  it('edge case 3 — outside the view or the manage scope → not found', async () => {
    expect(await codeOf(setup({ view: NONE }).service.preview('c1', 't1', 'AR'))).toBe('NOT_FOUND');
    expect(await codeOf(setup({ manage: NONE }).service.preview('c1', 't1', 'AR'))).toBe('NOT_FOUND');
  });

  it('edge case 4 — a salary template without salary access → SALARY_NOT_VISIBLE; a salary field added in Edit text too', async () => {
    const { service } = setup({ salary: NONE });
    expect(await codeOf(service.preview('c1', 't1', 'AR'))).toBe(ErrorCode.SALARY_NOT_VISIBLE);
    const plain = setup({ salary: NONE, body: doc('employee.nameAr') });
    const p = await plain.service.preview('c1', 't1', 'AR');
    expect(p.values['contract.salary']).toBeNull();
    const res = plain.service.createCopy('c1', { templateId: 't1', templateVersion: 1, language: 'AR', valuesHash: p.valuesHash, bodyEdited: doc('contract.salaryWords'), output: 'PDF' });
    expect(await codeOf(res)).toBe(ErrorCode.SALARY_NOT_VISIBLE);
    expect(plain.pdf.render).not.toHaveBeenCalled();
  });

  it('edge case 5 — no salary in the text, no salary access → the copy is kept, contains_salary false', async () => {
    const { service, copies } = setup({ salary: NONE, body: doc('employee.nameAr') });
    const p = await service.preview('c1', 't1', 'AR');
    const copy = await service.createCopy('c1', { templateId: 't1', templateVersion: 1, language: 'AR', valuesHash: p.valuesHash, output: 'PRINT' });
    expect(copy.containsSalary).toBe(false);
    expect(copies.create).toHaveBeenCalledWith(expect.objectContaining({ containsSalary: false, textEdited: false, output: 'PRINT', printedByName: 'Mona' }));
  });

  it('edge case 9 — English from a template with no English text → NO_ENGLISH_TEXT', async () => {
    expect(await codeOf(setup().service.preview('c1', 't1', 'EN'))).toBe(ErrorCode.NO_ENGLISH_TEXT);
  });

  it('edge case 10 — a hidden template can’t be printed → TEMPLATE_HIDDEN', async () => {
    expect(await codeOf(setup({ hidden: true }).service.preview('c1', 't1', 'AR'))).toBe(ErrorCode.TEMPLATE_HIDDEN);
  });

  it('edge case 13 — a cancelled contract → CONTRACT_CANCELLED; an ended one prints with its last day', async () => {
    expect(await codeOf(setup({ status: 'CANCELLED' }).service.preview('c1', 't1', 'AR'))).toBe(ErrorCode.CONTRACT_CANCELLED);
    const { service } = setup();
    jest.spyOn(service, 'today').mockReturnValue('2027-07-01');
    expect((await service.preview('c1', 't1', 'AR')).contract.endedOn).toBe('2027-05-31');
  });

  it('edge case 15 — a stale version → TEMPLATE_CHANGED; changed values → VALUES_CHANGED; nothing rendered', async () => {
    const { service, pdf } = setup({ version: 2 });
    const p = await service.preview('c1', 't1', 'AR');
    expect(await codeOf(service.createCopy('c1', { templateId: 't1', templateVersion: 1, language: 'AR', valuesHash: p.valuesHash, output: 'PDF' }))).toBe(
      ErrorCode.TEMPLATE_CHANGED,
    );
    expect(await codeOf(service.createCopy('c1', { templateId: 't1', templateVersion: 2, language: 'AR', valuesHash: 'f'.repeat(64), output: 'PDF' }))).toBe(
      ErrorCode.VALUES_CHANGED,
    );
    expect(pdf.render).not.toHaveBeenCalled();
  });

  it('edge case 16 — the render fails → no file, no copy, no entry, no transaction', async () => {
    const { service, pdf, files, copies, audit, afterCommit } = setup();
    pdf.render.mockRejectedValueOnce(new CodedException(503, ErrorCode.PDF_RENDER_FAILED));
    const p = await service.preview('c1', 't1', 'AR');
    expect(await codeOf(service.createCopy('c1', { templateId: 't1', templateVersion: 1, language: 'AR', valuesHash: p.valuesHash, output: 'PDF' }))).toBe(
      ErrorCode.PDF_RENDER_FAILED,
    );
    expect(files.save).not.toHaveBeenCalled();
    expect(copies.create).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
    expect(afterCommit.inTransaction).not.toHaveBeenCalled();
  });

  it('keeps the file, the copy and its entry in one transaction; the file is deleted on a rollback; the entry has no amounts', async () => {
    const { service, files, audit, afterCommit } = setup();
    const p = await service.preview('c1', 't1', 'AR');
    const copy = await service.createCopy('c1', { templateId: 't1', templateVersion: 1, language: 'AR', valuesHash: p.valuesHash, output: 'PDF' });
    expect(copy).toMatchObject({ containsSalary: true, pageCount: 2, downloadName: 'EMP-0006-2026-27-full-time-contract.pdf' });
    expect(files.save).toHaveBeenCalledWith('contract-copies', expect.stringMatching(/^[0-9a-f-]{36}\.pdf$/), expect.any(Buffer));
    expect(afterCommit.onRollback).toHaveBeenCalledTimes(1);
    const entry = audit.record.mock.calls[0][0] as { action: string; changes: unknown[] };
    expect(entry.action).toBe('hr.contract.copy_print');
    expect(JSON.stringify(entry.changes)).not.toContain('9,500');
  });

  it('edge case 6 — empty fields and left-out phrases are listed; printing is not blocked', async () => {
    const body = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'field', attrs: { key: 'employee.nationalId' } },
            { type: 'optional', content: [{ type: 'text', text: ' at ' }, { type: 'field', attrs: { key: 'school.address' } }] },
          ],
        },
      ],
    } as ContractDocument;
    const { service } = setup({ body });
    const p = await service.preview('c1', 't1', 'AR');
    expect(p.emptyFields).toEqual(['employee.nationalId']);
    expect(p.phrasesLeftOut).toEqual([['school.address']]);
  });
});
