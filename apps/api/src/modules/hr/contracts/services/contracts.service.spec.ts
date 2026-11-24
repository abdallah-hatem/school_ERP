import { NotFoundException } from '@nestjs/common';
import { ErrorCode, type SchoolCalendarDates } from '@school-erp/shared';
import { CodedException } from '../../../../common/errors/coded.exception';
import type { AuditService } from '../../../../core/audit';
import type { NotificationsService } from '../../../../core/notifications';
import type { FileStorageService } from '../../../../core/settings';
import type { AfterCommit } from '../../../../database/transactions';
import type { EmployeeScope } from '../../access/employee-scope.pure';
import { fakeAccess } from '../../access/hr-access.testing';
import type { EmployeesService } from '../../employees/services/employees.service';
import type { MonthLockService } from '../../month-lock/month-lock.service';
import type { HrRemindersService } from '../../reminders/hr-reminders.service';
import type { ContractRow, ContractsRepository } from '../repositories/contracts.repository';
import { ContractRecords } from './contract-records.service';
import { ContractPrintService } from './contract-print.service';
import { ContractsService } from './contracts.service';
import type { SchoolCalendarService } from './school-calendar.service';

/*
 * Contracts (spec docs/specs/2026-11-24-contracts.md): every rule and edge case of the service, with
 * its collaborators faked. The database side (row locks, the partial unique index) is checked by
 * the API e2e spec `hr-contracts.e2e-spec.ts`.
 */

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const TODAY = '2026-11-24';
const CAL: SchoolCalendarDates = {
  term1Start: '2026-09-15',
  term1End: '2027-01-28',
  term2Start: '2027-02-07',
  nonRenewalDeadline: '2027-04-30',
};

function row(over: Partial<ContractRow> & { id?: string; employeeId?: string; employeeStatus?: 'ACTIVE' | 'INACTIVE'; stageId?: string } = {}): ContractRow {
  const { employeeStatus = 'ACTIVE', stageId = 'st-1', ...rest } = over;
  const id = rest.id ?? 'c1';
  const employeeId = rest.employeeId ?? 'e1';
  return {
    id,
    employeeId,
    startsOn: d('2026-06-01'),
    endsOn: d('2027-05-31'),
    status: 'ACTIVE',
    nonRenewalBy: null,
    noticeReceivedOn: null,
    noticeTiming: null,
    noticeFileUrl: null,
    note: null,
    earlyTerminationStatus: null,
    earlyTerminationRequestedOn: null,
    earlyTerminationTiming: null,
    earlyTerminationNote: null,
    earlyTerminationFileUrl: null,
    earlyTerminationDecidedAt: null,
    earlyTerminationRejectReason: null,
    endedOn: null,
    endReason: null,
    endNote: null,
    endFileUrl: null,
    decidedAt: null,
    nextContractId: null,
    createdAt: d('2026-06-01'),
    employee: {
      id: employeeId,
      code: 'EMP-0001',
      nameEn: 'Mona',
      nameAr: 'منى',
      photoUrl: null,
      gender: 'FEMALE',
      status: employeeStatus,
      managerId: null,
      contractStart: d('2026-06-01'),
      contractEnd: d('2027-05-31'),
      stage: { id: stageId, nameEn: 'Primary', nameAr: 'ابتدائي', isNoStage: false },
      jobTitle: { id: 'j1', nameEn: 'Teacher', nameAr: 'معلم' },
      otherStages: [],
      contracts: [],
    },
    decidedBy: null,
    earlyTerminationDecidedBy: null,
    nextContract: null,
    previousContract: null,
    ...rest,
  };
}

interface Setup {
  rows?: ContractRow[];
  calendar?: SchoolCalendarDates | null;
  approvedMonths?: string[];
  scopes?: Parameters<typeof fakeAccess>[0];
  actor?: { userId: string; employeeId: string | null };
}

function makeService(opts: Setup = {}) {
  const store = new Map((opts.rows ?? [row()]).map((r) => [r.id, r]));
  /** Each employee's record dates (contract start / end), as the repository last wrote them. */
  const recordDates = new Map<string, { start: string; end: string }>();
  for (const r of store.values()) {
    if (!recordDates.has(r.employeeId)) {
      recordDates.set(r.employeeId, {
        start: r.employee.contractStart.toISOString().slice(0, 10),
        end: r.employee.contractEnd.toISOString().slice(0, 10),
      });
    }
  }
  const periodsOf = (employeeId: string) =>
    [...store.values()]
      .filter((r) => r.employeeId === employeeId)
      .map((r) => ({ status: r.status, startsOn: r.startsOn, endsOn: r.endsOn, endedOn: r.endedOn }));
  const datesOf = (id: string) => ({
    id,
    nameEn: 'Mona',
    nameAr: 'منى',
    contractStart: d(recordDates.get(id)!.start),
    contractEnd: d(recordDates.get(id)!.end),
    contracts: periodsOf(id),
  });
  const repository = {
    lockForUpdate: jest.fn().mockResolvedValue(undefined),
    findMany: jest.fn((ids: string[]) => Promise.resolve(ids.map((id) => store.get(id)).filter(Boolean))),
    findOne: jest.fn((id: string) => Promise.resolve(store.get(id) ?? null)),
    create: jest.fn((data: { employeeId: string; startsOn: Date; endsOn: Date }) => {
      const created = row({ id: `next-${data.employeeId}`, employeeId: data.employeeId, startsOn: data.startsOn, endsOn: data.endsOn });
      store.set(created.id, created);
      return Promise.resolve(created);
    }),
    // A renewal links the old contract to the new one: the new one knows what it renews.
    update: jest.fn((id: string, data: Record<string, unknown>) => {
      const next = { ...store.get(id)!, ...data };
      store.set(id, next);
      if (typeof data.nextContractId === 'string' && store.has(data.nextContractId)) {
        store.set(data.nextContractId, { ...store.get(data.nextContractId)!, previousContract: { id } });
      }
      return Promise.resolve(next);
    }),
    setEmployeeContractDates: jest.fn((employeeId: string, start: string, end: string) => {
      recordDates.set(employeeId, { start, end });
      return Promise.resolve();
    }),
    contractDatesOfAll: jest.fn(() => Promise.resolve([...recordDates.keys()].map((id) => datesOf(id)))),
    contractDatesOf: jest.fn((id: string) => Promise.resolve(recordDates.has(id) ? datesOf(id) : null)),
    lockContractsOfEmployee: jest.fn().mockResolvedValue(undefined),
    moveEmployeeContractDates: jest.fn((id: string, from: { start: string; end: string }, to: { start: string; end: string }) => {
      const r = recordDates.get(id);
      if (!r || r.start !== from.start || r.end !== from.end) return Promise.resolve(0);
      recordDates.set(id, to);
      return Promise.resolve(1);
    }),
    listPage: jest.fn().mockResolvedValue({ rows: [], total: 0 }),
    totals: jest.fn().mockResolvedValue({}),
    listOfEmployee: jest.fn().mockResolvedValue({ rows: [], total: 0 }),
    findByDocument: jest.fn().mockResolvedValue(null),
    lockEmployee: jest.fn().mockResolvedValue(undefined),
    periodsOfEmployee: jest.fn((employeeId: string) => Promise.resolve(periodsOf(employeeId))),
  };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const records = new ContractRecords(repository as unknown as ContractsRepository, audit as unknown as AuditService);
  const calendars = { dates: jest.fn().mockResolvedValue(opts.calendar === undefined ? CAL : opts.calendar) };
  const employees = {
    assertActive: jest.fn().mockResolvedValue(undefined),
    assertInScope: jest.fn().mockResolvedValue(undefined),
    deactivate: jest.fn().mockResolvedValue({}),
  };
  const monthLock = { approvedMonthsFrom: jest.fn().mockResolvedValue(opts.approvedMonths ?? []) };
  const reminders = {
    contractChanged: jest.fn().mockResolvedValue(undefined),
    employeeDeactivated: jest.fn().mockResolvedValue(undefined),
  };
  const notifications = {
    notify: jest.fn().mockResolvedValue({ created: 1 }),
    resolve: jest.fn().mockResolvedValue({ resolved: 1 }),
  };
  const files = { save: jest.fn((f: string, n: string) => Promise.resolve(`/files/${f}/${n}`)), read: jest.fn().mockResolvedValue(Buffer.from('x')) };
  const afterCommit = { inTransaction: (fn: () => Promise<unknown>) => fn() };
  const service = new ContractsService(
    repository as unknown as ContractsRepository,
    records,
    calendars as unknown as SchoolCalendarService,
    fakeAccess(opts.scopes ?? {}, opts.actor ?? { userId: 'u-hr', employeeId: 'e-hr' }),
    employees as unknown as EmployeesService,
    monthLock as unknown as MonthLockService,
    reminders as unknown as HrRemindersService,
    notifications as unknown as NotificationsService,
    audit as unknown as AuditService,
    files as unknown as FileStorageService,
    afterCommit as unknown as AfterCommit,
    { copiesOf: jest.fn((rows: { id: string }[]) => Promise.resolve(new Map(rows.map((r) => [r.id, { copies: [], copiesTotal: 0 }])))) } as unknown as ContractPrintService,
  );
  jest.spyOn(service, 'today').mockReturnValue(TODAY);
  return { service, repository, audit, store, calendars, employees, reminders, notifications, files, records, recordDates };
}

const actions = (audit: { record: jest.Mock }) =>
  audit.record.mock.calls.map(([input]) => (input as { action: string }).action);

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

describe('ContractsService — renewal', () => {
  it('renews: next year 1 Jun – 31 May, the old one RENEWED and linked, the employee dates kept on the one in force, its reminder done', async () => {
    const { service, repository, audit, reminders } = makeService();
    const [renewed] = await service.renew(['c1']);
    expect(renewed).toMatchObject({ status: 'RENEWED', decision: 'RENEWED' });
    expect(repository.create).toHaveBeenCalledWith({ employeeId: 'e1', startsOn: d('2027-06-01'), endsOn: d('2028-05-31') });
    // The old one leaves ACTIVE before the new one is created (one active per employee).
    expect(repository.update.mock.invocationCallOrder[0]).toBeLessThan(repository.create.mock.invocationCallOrder[0]);
    // Bug 2026-11-24: the next contract starts 1 Jun 2027 — the record keeps naming 2026/27 until then.
    expect(repository.setEmployeeContractDates).not.toHaveBeenCalledWith('e1', '2027-06-01', '2028-05-31');
    expect(repository.setEmployeeContractDates).toHaveBeenCalledWith('e1', '2026-06-01', '2027-05-31');
    expect(actions(audit)).toEqual(['hr.contract.create', 'hr.contract.renew']);
    expect(reminders.contractChanged).toHaveBeenCalledWith('e1', 'u-hr');
  });

  it('edge 1 — renewing an employee who is already renewed → refused, "already renewed"', async () => {
    const { service, repository } = makeService({ rows: [row({ status: 'RENEWED' })] });
    expect(await codeOf(service.renew(['c1']))).toBe(ErrorCode.CONTRACT_ALREADY_RENEWED);
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('edge 2 — renewing an inactive employee → refused', async () => {
    const { service, repository } = makeService({ rows: [row({ employeeStatus: 'INACTIVE' })] });
    expect(await codeOf(service.renew(['c1']))).toBe(ErrorCode.EMPLOYEE_INACTIVE);
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('edge 3 — bulk renew with one refused row → nothing is renewed; the refused rows are listed', async () => {
    const { service, repository } = makeService({
      rows: [row({ id: 'c1', employeeId: 'e1' }), row({ id: 'c2', employeeId: 'e2', status: 'RENEWED' }), row({ id: 'c3', employeeId: 'e3', employeeStatus: 'INACTIVE' })],
    });
    try {
      await service.renew(['c1', 'c2', 'c3']);
      throw new Error('expected a refusal');
    } catch (e) {
      expect(e).toBeInstanceOf(CodedException);
      expect((e as CodedException).code).toBe(ErrorCode.CONTRACTS_NOT_RENEWABLE);
      expect((e as CodedException).params).toEqual({ count: 2 });
      expect((e as CodedException).data).toEqual([
        { contractId: 'c2', code: ErrorCode.CONTRACT_ALREADY_RENEWED },
        { contractId: 'c3', code: ErrorCode.EMPLOYEE_INACTIVE },
      ]);
    }
    expect(repository.update).not.toHaveBeenCalled();
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('edge 4 — two HR users renewing at once: the rows are locked first; the second reads "renewed" and gets "already renewed"', async () => {
    const { service, repository, store } = makeService();
    await service.renew(['c1']);
    expect(repository.lockForUpdate).toHaveBeenCalledWith(['c1']);
    // The lock comes before the read the decision is made from.
    expect(repository.lockForUpdate.mock.invocationCallOrder[0]).toBeLessThan(repository.findMany.mock.invocationCallOrder[0]);
    expect(store.get('c1')!.status).toBe('RENEWED');
    expect(await codeOf(service.renew(['c1']))).toBe(ErrorCode.CONTRACT_ALREADY_RENEWED);
  });

  it('edge 5 — a contract started mid-year (1 Sep) renews 1 Sep – 31 Aug and lists on the year it ends', async () => {
    const { service, repository } = makeService({ rows: [row({ startsOn: d('2025-09-01'), endsOn: d('2026-08-31') })] });
    const [renewed] = await service.renew(['c1']);
    expect(repository.create).toHaveBeenCalledWith({ employeeId: 'e1', startsOn: d('2026-09-01'), endsOn: d('2027-08-31') });
    expect(renewed.year).toBe(2026);
  });
});

describe('ContractsService — not renewing and notices', () => {
  it("the school's decision: NOT_RENEWED by SCHOOL, who decided, its reminder done", async () => {
    const { service, audit, reminders } = makeService();
    const c = await service.notRenew('c1', { by: 'SCHOOL', note: 'Budget' });
    expect(c).toMatchObject({ status: 'NOT_RENEWED', decision: 'NOT_RENEWED_SCHOOL', nonRenewalBy: 'SCHOOL', notice: null });
    expect(actions(audit)).toEqual(['hr.contract.not_renew']);
    expect(reminders.contractChanged).toHaveBeenCalledWith('e1', 'u-hr');
  });

  it('edge 6 — a notice dated before term 2 or after 30 April → recorded, marked Early / Late', async () => {
    const early = makeService();
    expect((await early.service.notRenew('c1', { by: 'EMPLOYEE', receivedOn: '2026-11-10' })).notice).toMatchObject({
      receivedOn: '2026-11-10',
      timing: 'EARLY',
    });
    const late = makeService();
    expect((await late.service.notRenew('c1', { by: 'EMPLOYEE', receivedOn: '2027-05-02' })).notice?.timing).toBe('LATE');
    expect(actions(late.audit)).toEqual(['hr.contract.notice_record', 'hr.contract.not_renew']);
  });

  it('edge 7 — the calendar for the year isn’t set → the notice is recorded, marked "calendar not set"', async () => {
    const { service } = makeService({ calendar: null });
    expect((await service.notRenew('c1', { by: 'EMPLOYEE', receivedOn: '2026-11-10' })).notice?.timing).toBe('CALENDAR_NOT_SET');
  });

  it('a letter must be one uploaded for this contract', async () => {
    const { service } = makeService();
    expect(
      await codeOf(service.notRenew('c1', { by: 'EMPLOYEE', receivedOn: '2026-11-10', fileUrl: '/files/contract-documents/other-11111111-1111-1111-1111-111111111111.pdf' })),
    ).toBe(ErrorCode.CONTRACT_FILE_INVALID);
    const ok = await service.notRenew('c1', {
      by: 'EMPLOYEE',
      receivedOn: '2026-11-10',
      fileUrl: '/files/contract-documents/c1-11111111-1111-1111-1111-111111111111.pdf',
    });
    expect(ok.notice?.fileUrl).toBe('/files/contract-documents/c1-11111111-1111-1111-1111-111111111111.pdf');
  });

  it('a notice is withdrawn while the contract runs: active again, the reason in the entry', async () => {
    const { service, audit } = makeService({
      rows: [row({ status: 'NOT_RENEWED', nonRenewalBy: 'EMPLOYEE', noticeReceivedOn: d('2027-03-01'), noticeTiming: 'ON_TIME' })],
    });
    const c = await service.withdrawNotice('c1', 'Changed their mind');
    expect(c).toMatchObject({ status: 'ACTIVE', decision: 'UNDECIDED', notice: null });
    const entry = audit.record.mock.calls[0]![0] as { action: string; after: Record<string, unknown> };
    expect(entry.action).toBe('hr.contract.notice_withdraw');
    expect(entry.after.reason).toBe('Changed their mind');
  });

  it("the school's own decision is not a notice to withdraw", async () => {
    const { service } = makeService({ rows: [row({ status: 'NOT_RENEWED', nonRenewalBy: 'SCHOOL' })] });
    expect(await codeOf(service.withdrawNotice('c1', 'x'))).toBe(ErrorCode.CONTRACT_NO_NOTICE);
  });
});

describe('ContractsService — early termination', () => {
  it('a request inside term 1 is recorded and tells whoever may manage contracts', async () => {
    const { service, notifications, audit } = makeService();
    const c = await service.requestEarlyTermination('c1', { requestedOn: '2026-11-12' });
    expect(c).toMatchObject({ decision: 'EARLY_REQUESTED', earlyTermination: { status: 'REQUESTED', timing: 'ON_TIME', wouldEndOn: '2027-01-28' } });
    expect(notifications.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'hr.contract.early_termination_waiting',
        subject: { entityType: 'employee_contract', entityId: 'c1', employeeId: 'e1' },
        params: { employee: { en: 'Mona', ar: 'منى' }, date: '2026-11-12' },
      }),
    );
    expect(actions(audit)).toEqual(['hr.contract.early_termination_request']);
  });

  it('OPEN default — a request before term 1 starts → refused', async () => {
    const { service } = makeService();
    expect(await codeOf(service.requestEarlyTermination('c1', { requestedOn: '2026-09-01' }))).toBe(
      ErrorCode.EARLY_TERMINATION_OUTSIDE_WINDOW,
    );
  });

  it('edge 7 — no calendar: the request is recorded, marked "calendar not set"; approving it waits for the calendar', async () => {
    const { service } = makeService({ calendar: null });
    const c = await service.requestEarlyTermination('c1', { requestedOn: '2026-11-12' });
    expect(c.earlyTermination?.timing).toBe('CALENDAR_NOT_SET');
    expect(await codeOf(service.approveEarlyTermination('c1'))).toBe(ErrorCode.SCHOOL_CALENDAR_NOT_SET);
  });

  it('approved → the contract ends on the last day of term 1; the employee’s reminders go (edge 10)', async () => {
    const { service, repository, reminders, notifications } = makeService({
      rows: [row({ earlyTerminationStatus: 'REQUESTED', earlyTerminationRequestedOn: d('2026-11-12'), earlyTerminationTiming: 'ON_TIME' })],
    });
    const c = await service.approveEarlyTermination('c1');
    expect(c).toMatchObject({ status: 'ENDED_EARLY', endedOn: '2027-01-28', endReason: 'EARLY_TERMINATION' });
    expect(repository.setEmployeeContractDates).toHaveBeenCalledWith('e1', '2026-06-01', '2027-01-28');
    expect(reminders.employeeDeactivated).toHaveBeenCalledWith('e1', 'u-hr');
    expect(notifications.resolve).toHaveBeenCalledWith(expect.objectContaining({ resolution: 'approved' }));
  });

  it('edge 8 — a rejected request can’t be re-approved; a new request is needed', async () => {
    const { service, notifications } = makeService({
      rows: [row({ earlyTerminationStatus: 'REQUESTED', earlyTerminationRequestedOn: d('2026-11-12') })],
    });
    expect((await service.rejectEarlyTermination('c1', 'Needed for exams')).earlyTermination).toMatchObject({
      status: 'REJECTED',
      rejectReason: 'Needed for exams',
    });
    expect(notifications.resolve).toHaveBeenCalledWith(expect.objectContaining({ resolution: 'rejected' }));
    expect(await codeOf(service.approveEarlyTermination('c1'))).toBe(ErrorCode.EARLY_TERMINATION_NOT_PENDING);
    // A new request may follow.
    expect((await service.requestEarlyTermination('c1', { requestedOn: '2026-11-20' })).earlyTermination?.status).toBe('REQUESTED');
  });

  it('edge 9 — approving cuts into an approved payroll month → refused', async () => {
    const { service } = makeService({
      rows: [row({ earlyTerminationStatus: 'REQUESTED', earlyTerminationRequestedOn: d('2026-11-12') })],
      approvedMonths: ['2027-01'],
    });
    expect(await codeOf(service.approveEarlyTermination('c1'))).toBe(ErrorCode.CONTRACT_END_MONTH_LOCKED);
  });
});

describe('ContractsService — ending a contract', () => {
  it('ends for another reason: the date, the reason, the note; the employee’s future reminders go (edge 10)', async () => {
    const { service, repository, reminders, audit } = makeService();
    const c = await service.end('c1', { reason: 'ARTICLE_148', endsOn: '2026-12-31', note: 'Article 148' });
    expect(c).toMatchObject({ status: 'ENDED_EARLY', endedOn: '2026-12-31', endReason: 'ARTICLE_148', endNote: 'Article 148' });
    expect(repository.setEmployeeContractDates).toHaveBeenCalledWith('e1', '2026-06-01', '2026-12-31');
    expect(reminders.employeeDeactivated).toHaveBeenCalledWith('e1', 'u-hr');
    expect(actions(audit)).toEqual(['hr.contract.end']);
  });

  it('edge 9 — an end date before a payroll month already approved → refused (the paid month stands)', async () => {
    const { service, repository } = makeService({ approvedMonths: ['2026-12'] });
    expect(await codeOf(service.end('c1', { reason: 'OTHER', endsOn: '2026-12-15', note: 'x' }))).toBe(
      ErrorCode.CONTRACT_END_MONTH_LOCKED,
    );
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('an end date in the past or after the contract → refused', async () => {
    const { service } = makeService();
    expect(await codeOf(service.end('c1', { reason: 'OTHER', endsOn: '2026-11-23', note: 'x' }))).toBe(ErrorCode.CONTRACT_END_DATE_INVALID);
    expect(await codeOf(service.end('c1', { reason: 'OTHER', endsOn: '2027-06-01', note: 'x' }))).toBe(ErrorCode.CONTRACT_END_DATE_INVALID);
  });

  it('"To deactivate": only ended contracts past their last day; each through the employees service', async () => {
    const { service, employees } = makeService({
      rows: [row({ status: 'NOT_RENEWED', nonRenewalBy: 'SCHOOL', endsOn: d('2026-08-31') })],
    });
    expect(await service.deactivate(['c1'])).toEqual({ deactivated: 1 });
    expect(employees.deactivate).toHaveBeenCalledWith('e1');
    const running = makeService();
    expect(await codeOf(running.service.deactivate(['c1']))).toBe(ErrorCode.CONTRACT_NOT_TO_DEACTIVATE);
  });
});

describe('ContractsService — access (§2)', () => {
  it('edge 11 — acting on your own contract → refused (OWN_CONTRACT), whatever the action', async () => {
    const own = { actor: { userId: 'u1', employeeId: 'e1' } };
    expect(await codeOf(makeService(own).service.renew(['c1']))).toBe(ErrorCode.OWN_CONTRACT);
    expect(await codeOf(makeService(own).service.notRenew('c1', { by: 'SCHOOL' }))).toBe(ErrorCode.OWN_CONTRACT);
    expect(await codeOf(makeService(own).service.requestEarlyTermination('c1', { requestedOn: '2026-11-12' }))).toBe(
      ErrorCode.OWN_CONTRACT,
    );
    expect(await codeOf(makeService(own).service.end('c1', { reason: 'OTHER', endsOn: '2026-12-31', note: 'x' }))).toBe(
      ErrorCode.OWN_CONTRACT,
    );
    expect(await codeOf(makeService(own).service.uploadDocument('c1', undefined))).toBe(ErrorCode.OWN_CONTRACT);
  });

  it('edge 11 — in a bulk renewal your own contract is a refused row, and nothing is renewed', async () => {
    const { service, repository } = makeService({
      rows: [row({ id: 'c1', employeeId: 'e1' }), row({ id: 'c2', employeeId: 'e2' })],
      actor: { userId: 'u1', employeeId: 'e2' },
    });
    try {
      await service.renew(['c1', 'c2']);
      throw new Error('expected a refusal');
    } catch (e) {
      expect((e as CodedException).data).toEqual([{ contractId: 'c2', code: ErrorCode.OWN_CONTRACT }]);
    }
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('an account not linked to its employee record can’t tell its own contract → refused', async () => {
    const { service } = makeService({ actor: { userId: 'u1', employeeId: null } });
    expect(await codeOf(service.renew(['c1']))).toBe('ACCOUNT_NOT_LINKED');
  });

  it('edge 12 — a contract outside the viewer’s stage is not found (never "forbidden")', async () => {
    const otherStage: EmployeeScope = { kind: 'stage', stageIds: ['st-2'] };
    const { service, repository } = makeService({ scopes: { 'hr.contracts.view': otherStage } });
    expect(await codeOf(service.notRenew('c1', { by: 'SCHOOL' }))).toBe('NOT_FOUND');
    expect(await codeOf(service.renew(['c1', 'unknown']))).toBe('NOT_FOUND');
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('own contracts are marked for the screen (no actions on them)', async () => {
    const { service, repository } = makeService({ actor: { userId: 'u1', employeeId: 'e1' } });
    repository.listPage.mockResolvedValue({ rows: [row()], total: 1 });
    const page = await service.list({ year: 2026 });
    expect(page.items[0].ownContract).toBe(true);
  });
});

describe('ContractsService — the renewal list', () => {
  it('asks the repository for one page of the year, with the viewer’s scope, and returns the tiles and calendar', async () => {
    const stage: EmployeeScope = { kind: 'stage', stageIds: ['st-1'] };
    const { service, repository } = makeService({ scopes: { 'hr.contracts.view': stage } });
    repository.listPage.mockResolvedValue({ rows: [row()], total: 41 });
    repository.totals.mockResolvedValue({ ending: 41 });
    const page = await service.list({ year: 2026, page: 2, limit: 10, decision: 'OPEN', search: 'mona' });
    expect(repository.listPage).toHaveBeenCalledWith(
      { from: '2026-06-01', to: '2027-05-31', today: TODAY, carryOver: true, decision: 'OPEN', stageId: undefined, search: 'mona' },
      stage,
      2,
      10,
    );
    expect(page).toMatchObject({ year: 2026, total: 41, page: 2, limit: 10, totals: { ending: 41 }, calendar: CAL });
  });

  it('defaults to the current contract year (Cairo’s today)', async () => {
    const { service } = makeService();
    expect((await service.list({})).year).toBe(2026);
  });
});

describe('contracts edge 14 — the penalty repetition window is unchanged', () => {
  it('still 1 June – 31 May (§4)', async () => {
    const { repetitionWindowStart } = await import('../../domain/penalties');
    expect(repetitionWindowStart('2027-03-10', 'CONTRACT_YEAR')).toBe('2026-06-01');
    expect(repetitionWindowStart('2026-06-01', 'CONTRACT_YEAR')).toBe('2026-06-01');
  });
});

describe('ContractsService — review fixes (2026-11-24)', () => {
  it('review 1 — a contract outside the manage scope is not found, even inside the view scope', async () => {
    const { service, repository } = makeService({
      scopes: { 'hr.contracts.manage': { kind: 'stage', stageIds: ['st-2'] } },
    });
    expect(await codeOf(service.notRenew('c1', { by: 'SCHOOL' }))).toBe('NOT_FOUND');
    expect(await codeOf(service.renew(['c1']))).toBe('NOT_FOUND');
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('review 2 — ending a renewed contract (Article 148 in April): the next one is cancelled, the link cleared, the dates point back', async () => {
    const old = row({ id: 'c1', status: 'RENEWED', nextContractId: 'c2', decidedAt: d('2026-11-01') });
    const next = row({ id: 'c2', startsOn: d('2027-06-01'), endsOn: d('2028-05-31') });
    const { service, repository, audit, store } = makeService({ rows: [old, next] });
    const c = await service.end('c1', { reason: 'ARTICLE_148', endsOn: '2027-04-15', note: 'Article 148' });
    expect(c).toMatchObject({ status: 'ENDED_EARLY', endedOn: '2027-04-15', next: null });
    expect(store.get('c2')!.status).toBe('CANCELLED');
    expect(store.get('c1')!.nextContractId).toBeNull();
    expect(repository.lockForUpdate).toHaveBeenCalledWith(['c1', 'c2']);
    expect(repository.setEmployeeContractDates).toHaveBeenCalledWith('e1', '2026-06-01', '2027-04-15');
    expect(actions(audit)).toEqual(['hr.contract.cancel', 'hr.contract.end']);
  });

  it('review 2 — a next contract with its own decision → refused, nothing changes', async () => {
    const old = row({ id: 'c1', status: 'RENEWED', nextContractId: 'c2' });
    const next = row({ id: 'c2', status: 'NOT_RENEWED', startsOn: d('2027-06-01'), endsOn: d('2028-05-31') });
    const { service, repository } = makeService({ rows: [old, next] });
    expect(await codeOf(service.end('c1', { reason: 'DEATH', endsOn: '2027-04-15', note: 'x' }))).toBe(ErrorCode.CONTRACT_DECIDED);
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('review 3 — a reactivated employee gets a new contract: 1 June of this year, for one year, audited', async () => {
    const ended = row({ status: 'NOT_RENEWED', nonRenewalBy: 'SCHOOL', startsOn: d('2025-06-01'), endsOn: d('2026-05-31') });
    const { service, repository, audit } = makeService({ rows: [ended] });
    const c = await service.newContract('e1', undefined);
    expect(c).toMatchObject({ startsOn: '2026-06-01', endsOn: '2027-05-31', status: 'ACTIVE' });
    expect(repository.setEmployeeContractDates).toHaveBeenCalledWith('e1', '2026-06-01', '2027-05-31');
    expect(actions(audit)).toEqual(['hr.contract.create']);
  });

  it('review 3 — no new contract while one is active, nor overlapping one, nor your own', async () => {
    expect(await codeOf(makeService().service.newContract('e1', '2027-06-01'))).toBe(ErrorCode.CONTRACT_ACTIVE_EXISTS);
    const ended = row({ status: 'ENDED_EARLY', endedOn: d('2026-12-31') });
    expect(await codeOf(makeService({ rows: [ended] }).service.newContract('e1', '2026-12-31'))).toBe(ErrorCode.CONTRACT_OVERLAP);
    expect((await makeService({ rows: [ended] }).service.newContract('e1', '2027-01-01')).startsOn).toBe('2027-01-01');
    expect(
      await codeOf(makeService({ rows: [ended], actor: { userId: 'u1', employeeId: 'e1' } }).service.newContract('e1', '2027-01-01')),
    ).toBe(ErrorCode.OWN_CONTRACT);
  });

  it("review 3 — the school's not-renewing undone before the end: active again, the reason recorded, its reminder re-armed", async () => {
    const { service, audit, repository } = makeService({ rows: [row({ status: 'NOT_RENEWED', nonRenewalBy: 'SCHOOL', note: 'Budget' })] });
    const c = await service.undoNotRenew('c1', 'Budget found');
    expect(c).toMatchObject({ status: 'ACTIVE', decision: 'UNDECIDED', note: null });
    const entry = audit.record.mock.calls[0]![0] as { action: string; after: Record<string, unknown> };
    expect(entry).toMatchObject({ action: 'hr.contract.not_renew_undo', after: expect.objectContaining({ reason: 'Budget found' }) });
    expect(repository.update.mock.calls[0][1]).toMatchObject({ remindersRearmedAt: expect.any(Date) });
    const notice = makeService({ rows: [row({ status: 'NOT_RENEWED', nonRenewalBy: 'EMPLOYEE', noticeReceivedOn: d('2027-03-01') })] });
    expect(await codeOf(notice.service.undoNotRenew('c1', 'x'))).toBe(ErrorCode.CONTRACT_NOT_SCHOOL_DECISION);
  });

  it('review 13 — withdrawing a notice re-arms the contract-end reminder', async () => {
    const { service, repository } = makeService({
      rows: [row({ status: 'NOT_RENEWED', nonRenewalBy: 'EMPLOYEE', noticeReceivedOn: d('2027-03-01') })],
    });
    await service.withdrawNotice('c1', 'Stays');
    expect(repository.update.mock.calls[0][1]).toMatchObject({ remindersRearmedAt: expect.any(Date) });
  });

  it('review 4 — a 1 Feb – 31 Jan contract: the notice reads the year of its term 2, early termination the year of its term 1', async () => {
    const prev = { term1Start: '2025-09-15', term1End: '2026-01-28', term2Start: '2026-02-07', nonRenewalDeadline: '2026-04-30' };
    const c = row({ startsOn: d('2026-02-01'), endsOn: d('2027-01-31') });
    const { service, calendars } = makeService({ rows: [c] });
    calendars.dates.mockImplementation((year: number) => Promise.resolve(year === 2025 ? prev : CAL));
    const notice = await service.notRenew('c1', { by: 'EMPLOYEE', receivedOn: '2026-03-01' });
    expect(notice.notice?.timing).toBe('ON_TIME');
    expect(notice.calendars).toEqual({ notice: prev, earlyTermination: CAL });
  });

  it('review 10 — the school’s not-renewing note is returned', async () => {
    const { service } = makeService();
    expect((await service.notRenew('c1', { by: 'SCHOOL', note: 'Position closed' })).note).toBe('Position closed');
  });

  it('review 5 — on the current season’s screen, earlier years’ open rows are carried over and marked', async () => {
    const { service, repository } = makeService();
    repository.listPage.mockResolvedValue({ rows: [row({ startsOn: d('2025-06-01'), endsOn: d('2026-05-31') })], total: 1 });
    const page = await service.list({ year: 2026 });
    expect(repository.listPage.mock.calls[0]![0]).toMatchObject({ carryOver: true });
    expect(page.items[0].carriedOver).toBe(true);
    await service.list({ year: 2025 });
    expect(repository.listPage.mock.calls[1]![0]).toMatchObject({ carryOver: false });
  });
});

/*
 * Bug 2026-11-24 (owner, testing): renewing 2026/27 in November made 2027/28 "Current" with Renew and
 * Decide on it, and moved the employee's dates to it a year early. Single edge cases missed it, so one
 * employee is walked through time here — the same store, "today" moving forward.
 */
describe('ContractsService — one employee over time (Current vs Upcoming)', () => {
  const NOV = '2026-11-24';
  const at = (service: ContractsService, today: string) => jest.spyOn(service, 'today').mockReturnValue(today);
  async function history(s: ReturnType<typeof makeService>) {
    s.repository.listOfEmployee.mockResolvedValue({ rows: [...s.store.values()], total: s.store.size });
    const page = await s.service.employeeContracts('e1', {});
    return Object.fromEntries(page.data.map((c) => [c.id, c]));
  }

  it('step 1 — hired: the first contract is CURRENT and actionable; the record names it', async () => {
    const s = makeService();
    at(s.service, '2026-06-01');
    expect((await history(s)).c1).toMatchObject({ phase: 'CURRENT', decision: 'UNDECIDED' });
    expect(s.recordDates.get('e1')).toEqual({ start: '2026-06-01', end: '2027-05-31' });
  });

  it('step 2 — renewed in November: 2027/28 is UPCOMING, not actionable; the record still names 2026/27', async () => {
    const s = makeService();
    at(s.service, NOV);
    await s.service.renew(['c1']);
    const rows = await history(s);
    expect(rows.c1).toMatchObject({ phase: 'CURRENT', status: 'RENEWED' });
    expect(rows['next-e1']).toMatchObject({ phase: 'UPCOMING', startsOn: '2027-06-01', endsOn: '2028-05-31', year: 2027 });
    expect(s.recordDates.get('e1')).toEqual({ start: '2026-06-01', end: '2027-05-31' });
    // Renewing it now would make 2028/29 a year and a half early; deciding on it neither.
    expect(await codeOf(s.service.renew(['next-e1']))).toBe(ErrorCode.CONTRACT_NOT_STARTED);
    expect(await codeOf(s.service.notRenew('next-e1', { by: 'SCHOOL' }))).toBe(ErrorCode.CONTRACT_NOT_STARTED);
    expect(await codeOf(s.service.notRenew('next-e1', { by: 'EMPLOYEE', receivedOn: NOV }))).toBe(ErrorCode.CONTRACT_NOT_STARTED);
    expect(await codeOf(s.service.requestEarlyTermination('next-e1', { requestedOn: NOV }))).toBe(ErrorCode.CONTRACT_NOT_STARTED);
  });

  it('step 2b — a bulk renewal holding the upcoming contract lists it as refused, and renews nothing', async () => {
    const s = makeService({ rows: [row(), row({ id: 'c9', employeeId: 'e9' })] });
    at(s.service, NOV);
    await s.service.renew(['c1']);
    s.repository.create.mockClear();
    try {
      await s.service.renew(['next-e1', 'c9']);
      throw new Error('expected a refusal');
    } catch (e) {
      expect((e as CodedException).code).toBe(ErrorCode.CONTRACTS_NOT_RENEWABLE);
      expect((e as CodedException).data).toEqual([{ contractId: 'next-e1', code: ErrorCode.CONTRACT_NOT_STARTED }]);
    }
    expect(s.repository.create).not.toHaveBeenCalled();
    expect(s.store.get('c9')!.status).toBe('ACTIVE');
  });

  it('step 3 — the daily step on 31 May moves nothing; on 1 Jun 2027 2027/28 becomes CURRENT, actionable, and the record moves (once)', async () => {
    const s = makeService();
    at(s.service, NOV);
    await s.service.renew(['c1']);
    expect(await s.records.syncAllCurrentDates('2027-05-31')).toBe(0);
    expect(s.recordDates.get('e1')).toEqual({ start: '2026-06-01', end: '2027-05-31' });
    expect(await s.records.syncAllCurrentDates('2027-06-01')).toBe(1);
    expect(s.recordDates.get('e1')).toEqual({ start: '2027-06-01', end: '2028-05-31' });
    // Recorded on the employee (actor: the system), so their History shows the 1 June move.
    expect(s.audit.record).toHaveBeenLastCalledWith(
      expect.objectContaining({
        action: 'hr.employee.contract_dates_move',
        entity: expect.objectContaining({ type: 'employee', id: 'e1' }),
        before: { contractStart: '2026-06-01', contractEnd: '2027-05-31' },
        after: { contractStart: '2027-06-01', contractEnd: '2028-05-31' },
      }),
    );
    // Idempotent: a second run (or a restart) moves nothing.
    expect(await s.records.syncAllCurrentDates('2027-06-01')).toBe(0);
    at(s.service, '2027-06-01');
    const rows = await history(s);
    expect(rows.c1).toMatchObject({ phase: 'PAST' });
    expect(rows['next-e1']).toMatchObject({ phase: 'CURRENT', decision: 'UNDECIDED' });
    expect(await s.service.notRenew('next-e1', { by: 'SCHOOL' })).toMatchObject({ status: 'NOT_RENEWED' });
  });

  it('step 4 — the renewed contract ended in April, before 1 June: the upcoming one CANCELLED, the record stays on the ended one', async () => {
    const s = makeService();
    at(s.service, NOV);
    await s.service.renew(['c1']);
    at(s.service, '2027-04-10');
    await s.service.end('c1', { reason: 'DEATH', endsOn: '2027-04-15', note: 'x' });
    expect(s.store.get('next-e1')!.status).toBe('CANCELLED');
    expect(s.recordDates.get('e1')).toEqual({ start: '2026-06-01', end: '2027-04-15' });
    // 1 June comes: a cancelled contract never takes the record.
    expect(await s.records.syncAllCurrentDates('2027-06-01')).toBe(0);
    expect(s.recordDates.get('e1')).toEqual({ start: '2026-06-01', end: '2027-04-15' });
    at(s.service, '2027-06-01');
    expect((await history(s))['next-e1']).toMatchObject({ phase: 'PAST', status: 'CANCELLED' });
  });

  it('step 2c — the upcoming contract can be neither ended nor cancelled on its own; ending the one in force still works', async () => {
    const s = makeService();
    at(s.service, NOV);
    await s.service.renew(['c1']);
    expect(await codeOf(s.service.end('next-e1', { reason: 'OTHER', endsOn: '2027-07-01', note: 'x' }))).toBe(ErrorCode.CONTRACT_NOT_STARTED);
    expect(await codeOf(s.service.cancel('next-e1', 'Changed plans'))).toBe(ErrorCode.CONTRACT_NOT_CANCELLABLE);
    expect(s.store.get('next-e1')!.status).toBe('ACTIVE');
    at(s.service, '2027-05-10');
    await s.service.end('c1', { reason: 'DEATH', endsOn: '2027-05-10', note: 'x' });
    expect(s.store.get('next-e1')!.status).toBe('CANCELLED');
  });

  it('a new contract with a future start is cancelled with a reason (audited, kept); the record stays on the last one', async () => {
    const ended = row({
      status: 'NOT_RENEWED',
      nonRenewalBy: 'SCHOOL',
      startsOn: d('2025-06-01'),
      endsOn: d('2026-05-31'),
      employee: { ...row().employee, contractStart: d('2025-06-01'), contractEnd: d('2026-05-31') },
    });
    const s = makeService({ rows: [ended] });
    at(s.service, NOV);
    const created = await s.service.newContract('e1', '2027-06-01');
    s.audit.record.mockClear();
    const cancelled = await s.service.cancel(created.id, 'Never joined');
    expect(cancelled).toMatchObject({ status: 'CANCELLED', phase: 'PAST' });
    expect(s.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'hr.contract.cancel', after: expect.objectContaining({ reason: 'Never joined' }) }),
    );
    expect(await s.records.syncAllCurrentDates('2027-06-01')).toBe(0);
    expect(s.recordDates.get('e1')).toEqual({ start: '2025-06-01', end: '2026-05-31' });
    expect(await codeOf(s.service.cancel(created.id, 'again'))).toBe(ErrorCode.CONTRACT_DECIDED);
  });

  it('not renewed → ended → reactivated → new contract: the old row is no longer "To deactivate" (nor deactivatable)', async () => {
    const old = row({
      status: 'NOT_RENEWED',
      nonRenewalBy: 'SCHOOL',
      startsOn: d('2025-06-01'),
      endsOn: d('2026-05-31'),
    });
    const s = makeService({ rows: [old] });
    at(s.service, NOV);
    s.repository.listOfEmployee.mockResolvedValue({ rows: [old], total: 1 });
    expect((await s.service.employeeContracts('e1', {})).data[0]).toMatchObject({ toDeactivate: true });
    // Reactivated, then a new contract: the repository now returns it among the employee's contracts.
    const later = { ...old, employee: { ...old.employee, contracts: [{ startsOn: old.startsOn }, { startsOn: d('2026-06-01') }] } };
    s.store.set('c1', later);
    s.repository.listOfEmployee.mockResolvedValue({ rows: [later], total: 1 });
    expect((await s.service.employeeContracts('e1', {})).data[0]).toMatchObject({ toDeactivate: false });
    expect(await codeOf(s.service.deactivate(['c1']))).toBe(ErrorCode.CONTRACT_NOT_TO_DEACTIVATE);
  });

  it('a mid-year contract (1 Sep 2026) renewed in November: 1 Sep 2027 – 31 Aug 2028, UPCOMING until 1 Sep; then the record moves', async () => {
    const s = makeService({
      rows: [
        row({
          startsOn: d('2026-09-01'),
          endsOn: d('2027-08-31'),
          employee: { ...row().employee, contractStart: d('2026-09-01'), contractEnd: d('2027-08-31') },
        }),
      ],
    });
    at(s.service, NOV);
    await s.service.renew(['c1']);
    expect((await history(s))['next-e1']).toMatchObject({ phase: 'UPCOMING', startsOn: '2027-09-01', year: 2028 });
    expect(s.recordDates.get('e1')).toEqual({ start: '2026-09-01', end: '2027-08-31' });
    expect(await s.records.syncAllCurrentDates('2027-09-01')).toBe(1);
    expect(s.recordDates.get('e1')).toEqual({ start: '2027-09-01', end: '2028-08-31' });
  });

  it('a new contract with a future start (reactivated employee): UPCOMING, not actionable; the record moves on its first day', async () => {
    const ended = row({
      status: 'NOT_RENEWED',
      nonRenewalBy: 'SCHOOL',
      startsOn: d('2025-06-01'),
      endsOn: d('2026-05-31'),
      employee: { ...row().employee, contractStart: d('2025-06-01'), contractEnd: d('2026-05-31') },
    });
    const s = makeService({ rows: [ended] });
    at(s.service, NOV);
    const created = await s.service.newContract('e1', '2027-06-01');
    expect(created).toMatchObject({ phase: 'UPCOMING', status: 'ACTIVE' });
    expect(s.recordDates.get('e1')).toEqual({ start: '2025-06-01', end: '2026-05-31' });
    expect(await codeOf(s.service.renew([created.id]))).toBe(ErrorCode.CONTRACT_NOT_STARTED);
    expect(await s.records.syncAllCurrentDates('2027-06-01')).toBe(1);
    expect(s.recordDates.get('e1')).toEqual({ start: '2027-06-01', end: '2028-05-31' });
  });

  it('undo not-renewing: the started contract is CURRENT and renewable again; the record unchanged', async () => {
    const s = makeService({ rows: [row({ status: 'NOT_RENEWED', nonRenewalBy: 'SCHOOL' })] });
    at(s.service, NOV);
    expect(await s.service.undoNotRenew('c1', 'Budget found')).toMatchObject({ phase: 'CURRENT', status: 'ACTIVE' });
    const [renewed] = await s.service.renew(['c1']);
    expect(renewed.status).toBe('RENEWED');
    expect(s.recordDates.get('e1')).toEqual({ start: '2026-06-01', end: '2027-05-31' });
  });
});

describe('ContractsService — deactivating your own record (review 2026-11-24)', () => {
  it('an HR manager can’t deactivate themselves through "To deactivate" → OWN_CONTRACT, nobody deactivated', async () => {
    const mine = row({ status: 'NOT_RENEWED', nonRenewalBy: 'EMPLOYEE', startsOn: d('2025-06-01'), endsOn: d('2026-05-31') });
    const { service, employees } = makeService({ rows: [mine], actor: { userId: 'u1', employeeId: 'e1' } });
    expect(await codeOf(service.deactivate(['c1']))).toBe(ErrorCode.OWN_CONTRACT);
    expect(employees.deactivate).not.toHaveBeenCalled();
  });
});
