import type { TransactionHost } from '@nestjs-cls/transactional';
import type { AuthUser } from '@school-erp/shared';
import { CLS_REQ, type ClsService } from 'nestjs-cls';
import type { DbAdapter } from '../../database/transactions';
import type { PermissionsService } from '../permissions';
import { AuditRecordAccess } from './audit-record-access';
import { AUDIT_RECORDED, AuditOutsideTransactionError, AuditService } from './audit.service';
import type {
  AuditEntryRepository,
  AuditEntryRow,
  NewAuditEntry,
} from './repositories/audit-entry.repository';

const USER: AuthUser = { id: 'u1', email: 'mona@x.test', name: 'Mona', mustChangePassword: false };

function makeService(
  opts: {
    inTx?: boolean;
    user?: AuthUser | null;
    clsActive?: boolean;
    /** The viewer's `hr.employees.view_salary` scope; null: not held. */
    salaryScope?: string | null;
    /** The employees whose entries the viewer may read (P4); absent: every one. */
    visibleEmployees?: readonly string[];
    /** The viewer's `hr.payroll.view` scope; null: not held. */
    payrollScope?: string | null;
  } = {},
) {
  const {
    inTx = true,
    user = USER,
    clsActive = true,
    salaryScope = 'all',
    visibleEmployees,
    payrollScope = 'all',
  } = opts;
  const created: NewAuditEntry[] = [];
  const entries = {
    create: jest.fn((e: NewAuditEntry) => {
      created.push(e);
      return Promise.resolve();
    }),
    findPage: jest.fn(),
    findActors: jest.fn().mockResolvedValue([]),
    findFields: jest.fn().mockResolvedValue([]),
    countPerPeriod: jest.fn().mockResolvedValue([0]),
    summary: jest.fn().mockResolvedValue({ actions: 0, people: 0, money: 0, failedSignIns: 0 }),
    findLinkedEmployees: jest.fn((ids: readonly string[]) =>
      Promise.resolve(new Map(ids.includes('u1') ? [['u1', 'emp-1']] : [])),
    ),
    findUserName: jest.fn((id: string) => Promise.resolve(id === 'u9' ? 'Karim' : null)),
  };
  const recorded: string[] = [];
  const req = {
    user: user ?? undefined,
    ip: '10.0.0.7',
    headers: { 'user-agent': 'Firefox/140' },
  };
  const store = new Map<unknown, unknown>([
    [CLS_REQ, req],
    [AUDIT_RECORDED, recorded],
  ]);
  const cls = {
    isActive: () => clsActive,
    get: (key: unknown) => store.get(key),
    getId: () => 'req-123',
  };
  const txHost = { isTransactionActive: () => inTx };
  // The actor's name is read through the entries repository (no dependency on core/users).
  const users = { findName: entries.findUserName };
  const permissions = {
    scopeFor: jest.fn((_user: unknown, key: string) =>
      Promise.resolve(
        key === 'hr.employees.view_salary' && salaryScope
          ? { scope: salaryScope, employeeId: null, stageId: null }
          : key === 'hr.payroll.view' && payrollScope
            ? { scope: payrollScope, employeeId: null, stageId: null }
            : null,
      ),
    ),
  };
  const recordAccess = new AuditRecordAccess();
  if (visibleEmployees) recordAccess.register('employee', () => Promise.resolve(visibleEmployees));
  // HR's registrations, as HrAuditAccess makes them: e1's penalties; search by employee code.
  recordAccess.registerRelated('employee', 'penalty', (id) => Promise.resolve(id === 'e1' ? ['p1', 'p2'] : []));
  recordAccess.registerSearch('employee', (q) => Promise.resolve(q === 'EMP-0007' ? ['e7'] : []));
  recordAccess.registerSearch('penalty', (q) => Promise.resolve(q === 'EMP-0007' ? ['p7'] : []));
  const service = new AuditService(
    entries as unknown as AuditEntryRepository,
    txHost as unknown as TransactionHost<DbAdapter>,
    cls as unknown as ClsService,
    permissions as unknown as PermissionsService,
    recordAccess,
  );
  return { service, entries, created, recorded, users };
}

const EMPLOYEE = { type: 'employee' as const, id: 'e1', label: 'Mona Khalil' };

describe('AuditService.record', () => {
  it('D2 — throws when called outside a transaction, writing nothing', async () => {
    const { service, entries } = makeService({ inTx: false });
    await expect(
      service.record({
        action: 'hr.employee.update',
        entity: EMPLOYEE,
        before: { a: 1 },
        after: { a: 2 },
      }),
    ).rejects.toBeInstanceOf(AuditOutsideTransactionError);
    expect(entries.create).not.toHaveBeenCalled();
  });

  it('D4 — who, IP, user agent and request id come from the request; only changed fields are stored', async () => {
    const { service, created, recorded } = makeService();
    await service.record({
      action: 'hr.employee.update',
      entity: EMPLOYEE,
      before: { phone: '010', nameEn: 'Mona Khalil', passwordHash: 'x' },
      after: { phone: '011', nameEn: 'Mona Khalil', passwordHash: 'y' },
    });
    expect(created).toEqual([
      {
        action: 'hr.employee.update',
        module: 'hr',
        entityType: 'employee',
        entityId: 'e1',
        entityLabel: 'Mona Khalil',
        entityLabelAr: null,
        actorId: 'u1',
        actorName: 'Mona',
        changes: [{ field: 'phone', before: '010', after: '011' }],
        meta: { ip: '10.0.0.7', userAgent: 'Firefox/140', requestId: 'req-123' },
        at: expect.any(Date),
      },
    ]);
    expect(recorded).toEqual(['hr.employee.update']);
  });

  it('edge case 3 — equal before / after writes no entry, but still counts as recorded', async () => {
    const { service, entries, recorded } = makeService();
    await service.record({
      action: 'hr.employee.update',
      entity: EMPLOYEE,
      before: { a: 1 },
      after: { a: 1 },
    });
    await service.record({
      action: 'core.settings.update',
      entity: { type: 'school_settings', id: 'school', label: '' },
      changes: [],
    });
    expect(entries.create).not.toHaveBeenCalled();
    expect(recorded).toEqual(['hr.employee.update', 'core.settings.update']);
  });

  it('an action with no values (sign-out) is always written, with no changes', async () => {
    const { service, created } = makeService();
    await service.record({
      action: 'core.auth.sign_out',
      entity: { type: 'user', id: 'u1', label: 'mona@x.test' },
    });
    expect(created).toHaveLength(1);
    expect(created[0].changes).toEqual([]);
  });

  it('finding 3 — a record with two names stores both; one name, or the same twice, stores one', async () => {
    const { service, created } = makeService();
    const violation = (label: { en: string; ar: string }) =>
      service.record({
        action: 'hr.violation.update',
        entity: { type: 'violation', id: 'v1', label },
        changes: [{ field: 'hr.violations', before: 1, after: 2 }],
      });
    await violation({ en: 'Strike', ar: 'إضراب' });
    await violation({ en: 'Same', ar: 'Same' });
    await violation({ en: '', ar: 'إضراب' });
    expect(created.map((e) => [e.entityLabel, e.entityLabelAr])).toEqual([
      ['Strike', 'إضراب'],
      ['Same', null],
      ['إضراب', null],
    ]);
  });

  it('a request with no signed-in user (sign-in) records a null actor', async () => {
    const { service, created } = makeService({ user: null });
    await service.record({
      action: 'core.auth.sign_in_failed',
      entity: { type: 'user', id: 'nobody@x.test', label: 'nobody@x.test' },
    });
    expect(created[0]).toMatchObject({
      actorId: null,
      actorName: null,
      entityLabel: 'nobody@x.test',
    });
  });

  it('a given actor wins (successful sign-in), its name looked up when missing; null forces none', async () => {
    const { service, created, users } = makeService({ user: null });
    const entity = { type: 'user' as const, id: 'u9', label: 'karim@x.test' };
    await service.record({ action: 'core.auth.sign_in', entity, actor: { id: 'u9' } });
    await service.record({ action: 'core.auth.sign_in', entity, actor: { id: 'u9', name: 'K' } });
    expect(created.map((e) => [e.actorId, e.actorName])).toEqual([
      ['u9', 'Karim'],
      ['u9', 'K'],
    ]);
    expect(users.findName).toHaveBeenCalledTimes(1);

    const signedIn = makeService();
    await signedIn.service.record({ action: 'core.auth.sign_out', entity, actor: null });
    expect(signedIn.created[0]).toMatchObject({ actorId: null, actorName: null });
  });

  it('two writes in one request record two entries, in order', async () => {
    const { service, created, recorded } = makeService();
    await service.record({
      action: 'hr.employee.create',
      entity: EMPLOYEE,
      after: { nameEn: 'A' },
    });
    await service.record({
      action: 'hr.employee.deactivate',
      entity: EMPLOYEE,
      before: { status: 'ACTIVE' },
      after: { status: 'INACTIVE' },
    });
    expect(created.map((e) => e.action)).toEqual(['hr.employee.create', 'hr.employee.deactivate']);
    expect(created[0].at.getTime()).toBeLessThanOrEqual(created[1].at.getTime());
    expect(recorded).toEqual(['hr.employee.create', 'hr.employee.deactivate']);
  });

  it('edge case 2 — the audit write fails: the error reaches the caller (its transaction rolls back)', async () => {
    const { service, entries, recorded } = makeService();
    entries.create.mockRejectedValueOnce(new Error('disk full'));
    await expect(
      service.record({ action: 'hr.employee.create', entity: EMPLOYEE, after: { nameEn: 'A' } }),
    ).rejects.toThrow('disk full');
    expect(recorded).toEqual([]);
  });

  it('refuses an unknown action or a record of the wrong type', async () => {
    const { service } = makeService();
    await expect(
      service.record({ action: 'hr.employee.delete' as never, entity: EMPLOYEE }),
    ).rejects.toThrow(/Unknown audit action/);
    await expect(
      service.record({ action: 'hr.payroll.approve', entity: EMPLOYEE }),
    ).rejects.toThrow(/is about "payroll_run"/);
  });

  it('outside a request (no CLS context) it still records, with no actor or request meta', async () => {
    const { service, created } = makeService({ clsActive: false });
    await service.record({
      action: 'hr.employee.create',
      entity: EMPLOYEE,
      after: { nameEn: 'A' },
    });
    expect(created[0]).toMatchObject({
      actorId: null,
      meta: { ip: null, userAgent: null, requestId: null },
    });
  });
});

describe('AuditService reads', () => {
  const row = (over: Partial<AuditEntryRow> = {}): AuditEntryRow => ({
    id: 'a1',
    action: 'hr.employee.update',
    module: 'hr',
    entityType: 'employee',
    entityId: 'e1',
    entityLabel: 'Mona Khalil',
    entityLabelAr: null,
    actorId: 'u1',
    actorName: 'Mona (then)',
    changes: [{ field: 'phone', before: '010', after: '011' }],
    meta: { ip: '10.0.0.7', userAgent: 'Firefox/140', requestId: 'r' },
    at: new Date('2026-11-17T08:00:00.000Z'),
    ...over,
  });
  const pageOf = (data: AuditEntryRow[]) => ({
    data,
    total: data.length,
    page: 1,
    limit: 10,
    hasNextPage: false,
    hasPreviousPage: false,
  });

  it('edge case 4 — the actor name is the snapshot stored with the entry, not the user today', async () => {
    const { service, entries, users } = makeService();
    entries.findPage.mockResolvedValueOnce(pageOf([row()]));
    const page = await service.list({}, 1, 10);
    expect(page.data[0].actor).toEqual({ id: 'u1', name: 'Mona (then)', employeeId: 'emp-1' });
    expect(users.findName).not.toHaveBeenCalled();
  });

  it("gives the actor's linked employee (null when the user has none), read once per page", async () => {
    const { service, entries } = makeService();
    entries.findPage.mockResolvedValueOnce(
      pageOf([row(), row({ id: 'a2', actorId: 'u2', actorName: 'Karim' }), row({ id: 'a3' })]),
    );
    const page = await service.list({}, 1, 10);
    expect(page.data.map((e) => e.actor?.employeeId)).toEqual(['emp-1', null, 'emp-1']);
    expect(entries.findLinkedEmployees).toHaveBeenCalledTimes(1);
    expect(entries.findLinkedEmployees).toHaveBeenCalledWith(['u1', 'u2']);
  });

  it('maps a row to the AuditEntry contract: meta without the request id, ISO time', async () => {
    const { service, entries } = makeService();
    entries.findPage.mockResolvedValueOnce(pageOf([row({ actorId: null, actorName: null })]));
    const page = await service.list({ module: 'hr' }, 1, 10);
    expect(page.data[0]).toEqual({
      id: 'a1',
      action: 'hr.employee.update',
      module: 'hr',
      entityType: 'employee',
      entityId: 'e1',
      entityLabel: { en: 'Mona Khalil', ar: 'Mona Khalil' },
      actor: null,
      changes: [{ field: 'phone', before: '010', after: '011' }],
      meta: { ip: '10.0.0.7', userAgent: 'Firefox/140' },
      at: '2026-11-17T08:00:00.000Z',
    });
    expect(entries.findPage).toHaveBeenCalledWith({ module: 'hr', restricted: [] }, 1, 10);
  });

  it('finding 3 — a label kept in both languages reads back as both names', async () => {
    const { service, entries } = makeService();
    entries.findPage.mockResolvedValueOnce(pageOf([row({ entityLabel: 'Strike', entityLabelAr: 'إضراب' })]));
    const page = await service.list({}, 1, 10);
    expect(page.data[0].entityLabel).toEqual({ en: 'Strike', ar: 'إضراب' });
  });

  it('dry run 2026-11-18 — an older catalogue entry reads its Arabic name from its own snapshot', async () => {
    const { service, entries } = makeService();
    const snapshot = { id: 'v1', nameEn: 'Late to class', nameAr: 'التأخر عن الحصة', isActive: true };
    entries.findPage.mockResolvedValueOnce(
      pageOf([
        row({
          action: 'hr.violation.update',
          entityType: 'violation',
          entityId: 'v1',
          entityLabel: 'Late to class',
          entityLabelAr: null,
          changes: [{ field: 'hr.violations', before: snapshot, after: { ...snapshot, isActive: false } }],
        }),
      ]),
    );
    const page = await service.list({}, 1, 10);
    expect(page.data[0].entityLabel).toEqual({ en: 'Late to class', ar: 'التأخر عن الحصة' });
  });

  it('a record history filters by entity type and id', async () => {
    const { service, entries } = makeService();
    entries.findPage.mockResolvedValueOnce(pageOf([]));
    await service.listForRecord('payroll_run', 'r1', 2, 5);
    expect(entries.findPage).toHaveBeenCalledWith(
      { records: [{ entityType: 'payroll_run', ids: ['r1'] }], restricted: [] },
      2,
      5,
    );
  });

  it('a payroll run’s History (its tab, 2026-11-20): only the run’s entries, with the field and person filters', async () => {
    const { service, entries } = makeService();
    entries.findPage.mockResolvedValueOnce(pageOf([]));
    await service.listForRecord('payroll_run', 'r1', 1, 10, { field: 'amount', actorId: 'u1' });
    const records = [{ entityType: 'payroll_run', ids: ['r1'] }];
    expect(entries.findPage).toHaveBeenCalledWith({ records, field: 'amount', actorId: 'u1', restricted: [] }, 1, 10);
    await service.listActors({ entityType: 'payroll_run', entityId: 'r1' });
    expect(entries.findActors).toHaveBeenCalledWith({ records }, []);
    await service.listFields('payroll_run', 'r1');
    expect(entries.findFields).toHaveBeenCalledWith(records);
  });

  it('an employee’s History lists their penalties’ entries too (T29) — list, people and fields', async () => {
    const { service, entries } = makeService();
    entries.findPage.mockResolvedValueOnce(pageOf([]));
    await service.listForRecord('employee', 'e1', 1, 10, { field: 'status' });
    const records = [
      { entityType: 'employee', ids: ['e1'] },
      { entityType: 'penalty', ids: ['p1', 'p2'] },
    ];
    expect(entries.findPage).toHaveBeenCalledWith({ records, field: 'status', restricted: [] }, 1, 10);
    await service.listActors({ entityType: 'employee', entityId: 'e1' });
    expect(entries.findActors).toHaveBeenCalledWith({ records }, []);
    await service.listFields('employee', 'e1');
    expect(entries.findFields).toHaveBeenCalledWith(records);
    // An employee with no penalties: only their own entries.
    entries.findPage.mockResolvedValueOnce(pageOf([]));
    await service.listForRecord('employee', 'e2', 1, 10);
    expect(entries.findPage).toHaveBeenLastCalledWith(
      { records: [{ entityType: 'employee', ids: ['e2'] }], restricted: [] },
      1,
      10,
    );
  });

  it('T31 — search matches employee codes: the employee’s entries and their penalties’ (list and day totals)', async () => {
    const { service, entries } = makeService();
    entries.findPage.mockResolvedValueOnce(pageOf([]));
    await service.list({ q: 'EMP-0007' }, 1, 10);
    const qRecords = [
      { entityType: 'employee', ids: ['e7'] },
      { entityType: 'penalty', ids: ['p7'] },
    ];
    expect(entries.findPage).toHaveBeenCalledWith({ q: 'EMP-0007', qRecords, restricted: [] }, 1, 10);
    const periods = [{ from: new Date('2026-11-17T00:00:00Z'), to: new Date('2026-11-18T00:00:00Z') }];
    await service.countPerPeriod({ q: 'EMP-0007' }, periods);
    expect(entries.countPerPeriod).toHaveBeenCalledWith(
      { q: 'EMP-0007', qRecords, restricted: [] },
      periods,
    );
    // No code matches: the labels alone.
    entries.findPage.mockResolvedValueOnce(pageOf([]));
    await service.list({ q: 'Mona' }, 1, 10);
    expect(entries.findPage).toHaveBeenLastCalledWith({ q: 'Mona', qRecords: [], restricted: [] }, 1, 10);
  });

  describe('P4 — what the viewer may see', () => {
    const salaryChanges = [
      { field: 'phone', before: '010', after: '011' },
      { field: 'basicSalary', before: 500000, after: 600000 },
      { field: 'iban', before: null, after: 'EG380019000500000000263180002' },
    ];

    it('edge case 4 — without every salary, salary-type changes say "changed" with no values', async () => {
      const { service, entries } = makeService({ salaryScope: null });
      entries.findPage.mockResolvedValueOnce(pageOf([row({ changes: salaryChanges })]));
      const page = await service.list({}, 1, 10);
      expect(page.data[0].changes).toEqual([
        { field: 'phone', before: '010', after: '011' },
        { field: 'basicSalary', hidden: true },
        { field: 'iban', hidden: true },
      ]);
    });

    it('a salary scope narrower than the whole school still hides the values (the log is school-wide)', async () => {
      const { service, entries } = makeService({ salaryScope: 'own_stage' });
      entries.findPage.mockResolvedValueOnce(pageOf([row({ changes: salaryChanges })]));
      const page = await service.list({}, 1, 10);
      expect(page.data[0].changes[1]).toEqual({ field: 'basicSalary', hidden: true });
    });

    it('with hr.employees.view_salary at scope all, the values are shown', async () => {
      const { service, entries } = makeService({ salaryScope: 'all' });
      entries.findPage.mockResolvedValueOnce(pageOf([row({ changes: salaryChanges })]));
      const page = await service.list({}, 1, 10);
      expect(page.data[0].changes).toEqual(salaryChanges);
    });

    it('entries about employees outside the scope are left out of the list', async () => {
      const { service, entries } = makeService({ visibleEmployees: ['e1'] });
      entries.findPage.mockResolvedValueOnce(pageOf([]));
      await service.list({}, 1, 10);
      expect(entries.findPage).toHaveBeenCalledWith(
        { restricted: [{ entityType: 'employee', ids: ['e1'] }] },
        1,
        10,
      );
    });

    it('edge case 3 — the History of an employee outside the scope is 404', async () => {
      const { service, entries } = makeService({ visibleEmployees: ['e1'] });
      await expect(service.listForRecord('employee', 'e2', 1, 10)).rejects.toMatchObject({
        status: 404,
      });
      expect(entries.findPage).not.toHaveBeenCalled();
      await expect(service.listFields('employee', 'e2')).rejects.toMatchObject({ status: 404 });
      await expect(
        service.listActors({ entityType: 'employee', entityId: 'e2' }),
      ).rejects.toMatchObject({ status: 404 });
    });

    it('"Today at a glance" and the people picker count only entries in the scope', async () => {
      const { service, entries } = makeService({ visibleEmployees: ['e1'] });
      const from = new Date('2026-11-17T00:00:00Z');
      const to = new Date('2026-11-18T00:00:00Z');
      await service.summary(from, to);
      expect(entries.summary).toHaveBeenCalledWith(from, to, [{ entityType: 'employee', ids: ['e1'] }]);
      await service.listActors();
      expect(entries.findActors).toHaveBeenCalledWith({}, [{ entityType: 'employee', ids: ['e1'] }]);
    });

    it('…and are unrestricted for a whole-school viewer', async () => {
      const { service, entries } = makeService();
      await service.listActors();
      expect(entries.findActors).toHaveBeenCalledWith({}, []);
    });

    it('the picker’s search, one person and the cap go to the query, inside the same scope', async () => {
      const { service, entries } = makeService({ visibleEmployees: ['e1'] });
      await service.listActors(undefined, { search: 'mona', limit: 20 });
      expect(entries.findActors).toHaveBeenCalledWith({ search: 'mona', limit: 20 }, [{ entityType: 'employee', ids: ['e1'] }]);
      await service.listActors(undefined, { id: 'u1' });
      expect(entries.findActors).toHaveBeenLastCalledWith({ id: 'u1' }, [{ entityType: 'employee', ids: ['e1'] }]);
    });

    it('a payroll run’s totals follow the Payroll screen: shown to the principal (payroll at all, no salary)', async () => {
      const { service, entries } = makeService({ salaryScope: null, payrollScope: 'all' });
      const changes = [
        { field: 'totals', before: { net: 1 }, after: { net: 2 } },
        { field: 'amount', before: null, after: 5000 },
      ];
      entries.findPage.mockResolvedValueOnce(pageOf([row({ entityType: 'payroll_run', action: 'hr.payroll.recalculate', changes })]));
      const page = await service.list({}, 1, 10);
      expect(page.data[0].changes).toEqual([changes[0], { field: 'amount', hidden: true }]);
    });

    it('…and hidden without payroll at scope all, or on another kind of record', async () => {
      const { service, entries } = makeService({ salaryScope: null, payrollScope: 'own_stage' });
      entries.findPage.mockResolvedValueOnce(
        pageOf([row({ entityType: 'payroll_run', changes: [{ field: 'totals', before: 1, after: 2 }] })]),
      );
      expect((await service.list({}, 1, 10)).data[0].changes).toEqual([{ field: 'totals', hidden: true }]);
    });

    it('the History of an employee inside the scope reads as before', async () => {
      const { service, entries } = makeService({ visibleEmployees: ['e1'] });
      entries.findPage.mockResolvedValueOnce(pageOf([row()]));
      const page = await service.listForRecord('employee', 'e1', 1, 10);
      expect(page.data).toHaveLength(1);
    });
  });
});
