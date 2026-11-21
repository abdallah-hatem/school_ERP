import { NotFoundException } from '@nestjs/common';
import { DEFAULT_TAX_RULE } from '@school-erp/shared';
import type { TransactionHost } from '@nestjs-cls/transactional';
import type { AuditService } from '../../../../core/audit';
import type { AfterCommit, DbAdapter } from '../../../../database/transactions';
import type { EmployeesService, PayrollService } from '../../../hr';
import type { AccountingSettingsService } from '../../settings/accounting-settings.service';
import type { AccountingPayrollRepository } from '../repositories/accounting-payroll.repository';
import { AccountingPayrollService } from './accounting-payroll.service';

/** An approved HR line: the net and the insurance HR took at approval. */
const line = (employeeId: string, net: number, insuredSalary: number | null = null) => ({
  employeeId,
  employeeCode: `EMP-${employeeId}`,
  nameEn: `Name ${employeeId}`,
  nameAr: `اسم ${employeeId}`,
  net,
  insuranceStatus: insuredSalary === null ? 'NOT_INSURED' : 'INSURED',
  insuredSalary,
});

const APPROVED_AT = new Date('2026-11-05T10:00:00Z');

function makeService(
  opts: {
    status?: 'DRAFT' | 'APPROVED';
    recorded?: boolean;
    created?: boolean;
    approvedRunId?: string;
    everySalary?: boolean;
    /** Accounting's recorded months of the year, and HR's runs of it (`runStatusesInYear`). */
    inYear?: string[];
    hrYear?: { month: string; status: 'DRAFT' | 'APPROVED' }[];
    /** Accounting's stored month (`findByMonth`), its lines, and HR's breakdown of them. */
    storedMonth?: boolean;
    /** The stored month was finalized (transfer made). */
    finalized?: boolean;
    storedLines?: unknown[];
    breakdowns?: Map<string, unknown> | null;
    /** Employees whose salary the viewer may see, without every salary. */
    inScope?: string[];
  } = {},
) {
  const run =
    (opts.status ?? 'APPROVED') === 'APPROVED'
      ? {
          month: '2026-11',
          approvedAt: APPROVED_AT,
          lines: [line('a', 1_200_000), line('b', 1_200_000, 500_000), line('c', 0, 500_000)],
        }
      : null;
  const stored = {
    id: 'acc-run',
    hrRunId: 'hr-run',
    month: '2026-11',
    taxRule: DEFAULT_TAX_RULE,
    recordedAt: APPROVED_AT,
    finalizedAt: opts.finalized ? APPROVED_AT : null,
  };
  const repository = {
    findByHrRun: jest.fn(() => Promise.resolve(opts.recorded ? { id: 'acc-run' } : null)),
    findByMonth: jest.fn(() => Promise.resolve(opts.storedMonth ? stored : null)),
    findInYear: jest.fn(() =>
      Promise.resolve((opts.inYear ?? []).map((month) => ({ ...stored, id: `acc-${month}`, month }))),
    ),
    findLines: jest.fn(() => Promise.resolve(opts.storedLines ?? [])),
    findLinesPage: jest.fn((_runId: string, _filter: unknown, page: number, limit: number) =>
      Promise.resolve({ rows: opts.storedLines ?? [], total: 42, page, limit }),
    ),
    sumLines: jest.fn(() =>
      Promise.resolve({ employees: 42, net: 4200, insuranceAmount: 420, incomeTax: 42, martyrTax: 4, gross: 4666 }),
    ),
    findLineEmployeeIds: jest.fn(() => Promise.resolve(['a', 'b', 'c'])),
    totalsFor: jest.fn((ids: string[]) =>
      Promise.resolve(
        new Map<string, unknown>([
          ['acc-run', { employees: 3 }],
          ...ids.map((id): [string, unknown] => [id, { employees: 3, net: 100, insuranceAmount: 10, incomeTax: 5, martyrTax: 1, gross: 116 }]),
        ]),
      ),
    ),
    create: jest.fn(() => Promise.resolve(opts.created === false ? null : stored)),
    deletePending: jest.fn(() => Promise.resolve(true)),
    finalize: jest.fn(() => Promise.resolve(true)),
  };
  const hrPayroll = {
    approvedLinesForAccounting: jest.fn(() => Promise.resolve(run)),
    approvedRunIdForMonth: jest.fn(() => Promise.resolve(opts.approvedRunId ?? null)),
    runStatusesInYear: jest.fn(() => Promise.resolve(opts.hrYear ?? [])),
    approvedLineBreakdowns: jest.fn(() => Promise.resolve(opts.breakdowns ?? null)),
    returnFromAccounting: jest.fn(() => Promise.resolve()),
    markTransferred: jest.fn(() => Promise.resolve()),
  };
  // Today's employee record isn't read: the insurance comes from HR's approved lines.
  const employees = {
    seesEverySalary: jest.fn(() => Promise.resolve(opts.everySalary ?? true)),
    filterInScope: jest.fn(() => Promise.resolve(new Set(opts.inScope ?? []))),
  };
  const settings = { taxRuleAt: jest.fn((_at: Date) => Promise.resolve(DEFAULT_TAX_RULE)) };
  const audit = { record: jest.fn(() => Promise.resolve()) };
  // Joins the delivery's (or the read path's) transaction: no propagation option.
  const txHost = { withTransaction: jest.fn((fn: () => unknown) => fn()) };
  const afterCommit = { inTransaction: jest.fn((fn: () => unknown) => fn()) };
  const service = new AccountingPayrollService(
    repository as unknown as AccountingPayrollRepository,
    settings as unknown as AccountingSettingsService,
    hrPayroll as unknown as PayrollService,
    employees as unknown as EmployeesService,
    audit as unknown as AuditService,
    txHost as unknown as TransactionHost<DbAdapter>,
    afterCommit as unknown as AfterCommit,
  );
  return { service, repository, hrPayroll, audit, settings, employees };
}

describe('AccountingPayrollService.recordApprovedRun', () => {
  it('works out every line of an approved month with the rule in force at approval and the insurance on HR\'s lines, and records it', async () => {
    const { service, repository, audit, settings } = makeService();
    await service.recordApprovedRun('hr-run');
    expect(settings.taxRuleAt).toHaveBeenCalledWith(APPROVED_AT);
    const [data, lines] = (repository.create.mock.calls[0] as unknown as [unknown, unknown[]]);
    expect(data).toEqual({ hrRunId: 'hr-run', month: '2026-11', taxRule: DEFAULT_TAX_RULE });
    // Net 12,000 not insured → 1,517.32 / 6.76 / 13,524.08; insured 5,000 → 550 / 1,517.38 / 7.04 / 14,074.42.
    expect(lines).toEqual([
      expect.objectContaining({ employeeId: 'a', net: 1_200_000, insuranceStatus: 'NOT_INSURED', insuranceAmount: 0, incomeTax: 151_732, martyrTax: 676, gross: 1_352_408 }),
      expect.objectContaining({ employeeId: 'b', insuranceStatus: 'INSURED', insuredSalary: 500_000, insuranceAmount: 55_000, incomeTax: 151_738, martyrTax: 704, gross: 1_407_442 }),
      // Net floored at 0, insured: the school still pays the insurance share and its fund.
      expect.objectContaining({ employeeId: 'c', net: 0, insuranceAmount: 55_000, incomeTax: 0, martyrTax: 28, gross: 55_028 }),
    ]);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'accounting.payroll.record', actor: null }),
    );
  });

  it('a month already recorded (the event delivered twice) is left alone', async () => {
    const { service, repository, hrPayroll } = makeService({ recorded: true });
    await expect(service.recordApprovedRun('hr-run')).resolves.toBeNull();
    expect(hrPayroll.approvedLinesForAccounting).not.toHaveBeenCalled();
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('a run that is not approved records nothing', async () => {
    const { service, repository } = makeService({ status: 'DRAFT' });
    await expect(service.recordApprovedRun('hr-run')).resolves.toBeNull();
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('lost the race to another delivery (unique key) → no audit entry', async () => {
    const { service, audit } = makeService({ created: false });
    await expect(service.recordApprovedRun('hr-run')).resolves.toBeNull();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('missed at approval: worked out on first read, still with the rule in force at the approval', async () => {
    const { service, repository, settings } = makeService({ approvedRunId: 'hr-run' });
    const month = await service.getMonth('2026-11');
    expect(month.month).toBe('2026-11');
    expect(settings.taxRuleAt).toHaveBeenCalledWith(APPROVED_AT);
    expect(repository.create).toHaveBeenCalledTimes(1);
  });

  it('a month HR never approved → 404', async () => {
    const { service } = makeService();
    await expect(service.getMonth('2026-12')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('AccountingPayrollService.returnToHr / finalize', () => {
  it("returns a pending month: HR's run goes back to draft with the reason, the taxes are dropped, audited", async () => {
    const { service, repository, hrPayroll, audit } = makeService({ storedMonth: true });
    await service.returnToHr('2026-11', 'Penalty for EMP-0003 missing', 'u1');
    expect(hrPayroll.returnFromAccounting).toHaveBeenCalledWith('hr-run', 'Penalty for EMP-0003 missing', 'u1');
    expect(repository.deletePending).toHaveBeenCalledWith('acc-run');
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'accounting.payroll.return',
        changes: expect.arrayContaining([{ field: 'reason', before: null, after: 'Penalty for EMP-0003 missing' }]),
      }),
    );
  });

  it("locks like finalize: this month's row is dropped before HR's run is touched (no deadlock)", async () => {
    const { service, repository, hrPayroll } = makeService({ storedMonth: true });
    await service.returnToHr('2026-11', 'Penalty missing', 'u1');
    expect(repository.deletePending.mock.invocationCallOrder[0]).toBeLessThan(
      hrPayroll.returnFromAccounting.mock.invocationCallOrder[0],
    );
  });

  it('HR refusing the return fails the whole return (the drop rolls back with it), nothing audited', async () => {
    const { service, hrPayroll, audit } = makeService({ storedMonth: true });
    hrPayroll.returnFromAccounting.mockRejectedValueOnce(Object.assign(new Error('refused'), { status: 409 }));
    await expect(service.returnToHr('2026-11', 'x', 'u1')).rejects.toMatchObject({ status: 409 });
    expect(audit.record).not.toHaveBeenCalled();
  });

  it("return and finalize are recorded against the month, which outlives the dropped row", async () => {
    const { service, audit } = makeService({ storedMonth: true });
    await service.returnToHr('2026-11', 'Penalty missing', 'u1');
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ entity: { type: 'accounting_payroll', id: '2026-11', label: '2026-11' } }),
    );
    const other = makeService({ storedMonth: true });
    await other.service.finalize('2026-11', 'u1');
    expect(other.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ entity: { type: 'accounting_payroll', id: '2026-11', label: '2026-11' } }),
    );
  });

  it('a finalized month is never returned (409 PAYROLL_FINALIZED), and HR is not touched', async () => {
    const { service, hrPayroll, repository } = makeService({ storedMonth: true, finalized: true });
    await expect(service.returnToHr('2026-11', 'late', 'u1')).rejects.toMatchObject({ status: 409 });
    expect(hrPayroll.returnFromAccounting).not.toHaveBeenCalled();
    expect(repository.deletePending).not.toHaveBeenCalled();
  });

  it('a month not in accounting → 404 for both', async () => {
    const { service } = makeService();
    await expect(service.returnToHr('2026-12', 'x', 'u1')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.finalize('2026-12', 'u1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('finalize: marks the month and HR\'s run transferred, audited; the month reads FINALIZED', async () => {
    const { service, repository, hrPayroll, audit } = makeService({ storedMonth: true });
    await service.finalize('2026-11', 'u1');
    expect(repository.finalize).toHaveBeenCalledWith('acc-run', 'u1', expect.any(Date));
    expect(hrPayroll.markTransferred).toHaveBeenCalledWith('hr-run', expect.any(Date));
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'accounting.payroll.finalize' }));
  });

  it('finalize twice → 409 PAYROLL_FINALIZED', async () => {
    const { service, repository } = makeService({ storedMonth: true, finalized: true });
    await expect(service.finalize('2026-11', 'u1')).rejects.toMatchObject({ status: 409 });
    expect(repository.finalize).not.toHaveBeenCalled();
  });

  it('a finalized month reads FINALIZED with its date; a pending one PENDING', async () => {
    expect((await makeService({ storedMonth: true, finalized: true }).service.getMonth('2026-11')).status).toBe('FINALIZED');
    const pending = await makeService({ storedMonth: true }).service.getMonth('2026-11');
    expect(pending).toMatchObject({ status: 'PENDING', finalizedAt: null });
  });
});

describe('AccountingPayrollService.monthSheet / lines (HR breakdown)', () => {
  const stored = (employeeId: string) => ({
    employeeId,
    employeeCode: `EMP-${employeeId}`,
    nameEn: `Name ${employeeId}`,
    nameAr: `اسم ${employeeId}`,
    insuranceStatus: 'NOT_INSURED',
    insuredSalary: null,
    net: 1_000_000,
    insuranceAmount: 0,
    incomeTax: 100,
    martyrTax: 10,
    gross: 1_000_110,
  });
  const breakdown = {
    departmentNameEn: 'Teaching',
    departmentNameAr: 'التدريس',
    monthSalary: 1_100_000,
    penaltyDays: 1,
    penaltyAmount: 50_000,
    latenessDays: 0.5,
    latenessAmount: 25_000,
    adjustmentAdditions: 0,
    adjustmentDeductions: 25_000,
  };

  it("adds HR's breakdown of each approved line, read from HR's approved run", async () => {
    const { service, hrPayroll } = makeService({
      storedMonth: true,
      storedLines: [stored('a')],
      breakdowns: new Map([['a', breakdown]]),
    });
    const month = await service.monthSheet('2026-11');
    expect(hrPayroll.approvedLineBreakdowns).toHaveBeenCalledWith('hr-run');
    expect(month.lines[0]).toEqual(expect.objectContaining({ employeeId: 'a', net: 1_000_000, gross: 1_000_110, hr: breakdown }));
  });

  it("outside the viewer's salary scope: HR's money is hidden with the line's, the days and department stay", async () => {
    const { service } = makeService({
      storedMonth: true,
      everySalary: false,
      inScope: ['b'],
      storedLines: [stored('a'), stored('b')],
      breakdowns: new Map([['a', breakdown], ['b', breakdown]]),
    });
    const [a, b] = (await service.monthSheet('2026-11')).lines;
    expect(a).not.toHaveProperty('net');
    expect(a.hr).toEqual({ departmentNameEn: 'Teaching', departmentNameAr: 'التدريس', penaltyDays: 1, latenessDays: 0.5 });
    expect(b.hr).toEqual(breakdown);
  });

  it('no breakdown from HR: the line comes without one', async () => {
    const { service } = makeService({ storedMonth: true, storedLines: [stored('a')], breakdowns: null });
    const [a] = (await service.monthSheet('2026-11')).lines;
    expect(a).not.toHaveProperty('hr');
  });

  it('lines: the repository pages, searches and narrows to one group; the totals cover every match', async () => {
    const { service, repository } = makeService({ storedMonth: true, storedLines: [stored('a')] });
    const page = await service.lines('2026-11', { page: 2, limit: 25, search: 'mona', insurance: 'INSURED' });
    expect(repository.findLinesPage).toHaveBeenCalledWith('acc-run', { search: 'mona', insurance: 'INSURED' }, 2, 25);
    expect(repository.sumLines).toHaveBeenCalledWith('acc-run', { search: 'mona', insurance: 'INSURED' });
    expect(page).toMatchObject({ total: 42, page: 2, limit: 25 });
    expect(page.items).toHaveLength(1);
    expect(page.totals).toEqual({ employees: 42, net: 4200, insuranceAmount: 420, incomeTax: 42, martyrTax: 4, gross: 4666 });
  });

  it('lines without every salary: the totals keep only the count, lines outside the scope hide their money', async () => {
    const { service } = makeService({
      storedMonth: true,
      everySalary: false,
      inScope: ['b'],
      storedLines: [stored('a'), stored('b')],
    });
    const page = await service.lines('2026-11', {});
    expect(page.totals).toEqual({ employees: 42 });
    expect(page.items[0]).toMatchObject({ employeeId: 'a', salaryVisible: false });
    expect(page.items[0]).not.toHaveProperty('gross');
    expect(page.items[1]).toMatchObject({ employeeId: 'b', salaryVisible: true, gross: 1_000_110 });
  });

  it('lines of a month HR never approved → 404', async () => {
    const { service } = makeService();
    await expect(service.lines('2026-12', {})).rejects.toBeInstanceOf(NotFoundException);
  });

  it('the month itself carries no lines, and how many the viewer sees the amounts of', async () => {
    const all = await makeService({ storedMonth: true }).service.getMonth('2026-11');
    expect(all).not.toHaveProperty('lines');
    expect(all.visibleLines).toBe(3);
    const some = await makeService({ storedMonth: true, everySalary: false, inScope: ['b'] }).service.getMonth('2026-11');
    expect(some.visibleLines).toBe(1);
  });
});

describe('AccountingPayrollService.year (the year board)', () => {
  it('twelve months, January first: approved with totals, a draft in HR, or nothing yet', async () => {
    const { service, hrPayroll, repository } = makeService({
      inYear: ['2026-09'],
      hrYear: [
        { month: '2026-09', status: 'APPROVED' },
        { month: '2026-10', status: 'DRAFT' },
      ],
    });
    const year = await service.year(2026);
    expect(hrPayroll.runStatusesInYear).toHaveBeenCalledWith(2026);
    expect(repository.findInYear).toHaveBeenCalledWith(2026);
    expect(year.year).toBe(2026);
    expect(year.months.map((m) => m.month)).toEqual(
      Array.from({ length: 12 }, (_, i) => `2026-${String(i + 1).padStart(2, '0')}`),
    );
    expect(year.months[8]).toMatchObject({
      month: '2026-09',
      state: 'APPROVED',
      summary: { salaryVisible: true, totals: { employees: 3, gross: 116 } },
    });
    expect(year.months[9]).toEqual({ month: '2026-10', state: 'DRAFT' });
    expect(year.months[0]).toEqual({ month: '2026-01', state: 'NONE' });
    // Read only: nothing is worked out or recorded from the board.
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('approved in HR but never worked out (a missed event): approved, with no summary', async () => {
    const { service, repository } = makeService({ hrYear: [{ month: '2026-03', status: 'APPROVED' }] });
    const year = await service.year(2026);
    expect(year.months[2]).toEqual({ month: '2026-03', state: 'APPROVED' });
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('salary data (§2, P4): without every salary the totals are the head count only', async () => {
    const { service } = makeService({ everySalary: false, inYear: ['2026-09'] });
    const year = await service.year(2026);
    expect(year.months[8]?.summary).toMatchObject({ salaryVisible: false, totals: { employees: 3 } });
    expect(year.months[8]?.summary?.totals).not.toHaveProperty('gross');
  });

  it('an empty year: twelve months, none of them started', async () => {
    const { service } = makeService();
    const year = await service.year(2030);
    expect(year.months.every((m) => m.state === 'NONE' && !m.summary)).toBe(true);
  });
});
