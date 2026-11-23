import { ErrorCode } from '@school-erp/shared';
import type { AuditService } from '../../../../core/audit';
import type { AfterCommit } from '../../../../database/transactions';
import type { PermissionsService, UserScope } from '../../../../core/permissions';
import type { UsersService } from '../../../../core/users';
import type { EmployeesService } from '../../employees/services/employees.service';
import type { MonthLockService } from '../../month-lock/month-lock.service';
import type { HrNotificationsService } from '../../notifications/hr-notifications.service';
import type { HrSettingsService } from '../../settings/hr-settings.service';
import type { PenaltyRecordsRepository } from '../repositories/penalty-records.repository';
import type { PenaltyCatalogueService } from './penalty-catalogue.service';
import { PenaltyRecordsService } from './penalty-records.service';
import { fakeAccess } from '../../access/hr-access.testing';

const LEVELS = [
  { level: 1, action: 'NOTICE', days: null },
  { level: 2, action: 'DEDUCT_DAYS', days: '2' },
];

const row = (over: Record<string, unknown> = {}) => ({
  id: 'r1',
  employeeId: 'e1',
  violationId: 'v1',
  date: new Date('2025-11-10T00:00:00Z'),
  status: 'WAITING_HR',
  stageId: 'primary',
  stage: { id: 'primary', nameEn: 'Primary', nameAr: 'الابتدائية' },
  level: 1,
  action: 'NOTICE',
  days: null,
  note: null,
  cancelReason: null,
  createdAt: new Date('2025-11-10T08:00:00Z'),
  createdById: 'recorder',
  reviewedAt: null,
  reviewNote: null,
  reviewSkip: null,
  approvedAt: null,
  approvalNote: null,
  rejectedAt: null,
  rejectedStep: null,
  rejectionReason: null,
  cancelledAt: null,
  employee: { id: 'e1', code: 'EMP-0001', nameEn: 'A', nameAr: 'أ', managerId: null },
  violation: { id: 'v1', nameEn: 'Late', nameAr: 'تأخر', oncePerDay: true, levels: LEVELS },
  createdBy: null,
  reviewedBy: null,
  approvedBy: null,
  rejectedBy: null,
  ...over,
});

/** A holder of the stage review: a stage head (own_stage) of `stageIds`, linked to `employeeId`. */
const head = (userId: string, employeeId: string | null, stageIds: string[]) => ({
  userId,
  scope: { scope: 'own_stage', employeeId, stageId: stageIds[0] ?? null, stageIds } as UserScope,
});

/** An APPROVED record of the same pair, dated and recorded at `iso`. */
const approvedAt = (id: string, iso: string) => ({
  id,
  employeeId: 'e1',
  violationId: 'v1',
  status: 'APPROVED',
  date: iso.slice(0, 10),
  recordedAt: new Date(iso),
});

function makeService(
  repo: Record<string, jest.Mock> = {},
  oncePerDay = true,
  access = fakeAccess(),
  employees: Record<string, jest.Mock> = {},
  reviewHolders: ReturnType<typeof head>[] = [],
  employeeAccount: { id: string; name: string } | null = null,
) {
  const repository = {
    findOne: jest.fn().mockResolvedValue(row()),
    findStatus: jest.fn().mockResolvedValue({ status: 'WAITING_HR', date: '2025-11-10' }),
    review: jest.fn().mockResolvedValue(true),
    reject: jest.fn().mockResolvedValue(true),
    approvedCandidates: jest.fn().mockResolvedValue([]),
    approve: jest.fn().mockResolvedValue('APPROVED'),
    sameDayStatuses: jest.fn().mockResolvedValue([]),
    createRecord: jest.fn().mockResolvedValue(row()),
    cancel: jest.fn().mockResolvedValue(true),
    ...repo,
  };
  const monthLock = {
    assertMonthOpen: jest.fn().mockResolvedValue(undefined),
    isMonthLocked: jest.fn().mockResolvedValue(false),
  };
  const settings = {
    get: jest.fn().mockResolvedValue({ penalties: { repetitionWindow: 'CONTRACT_YEAR' } }),
  };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  // Stands in for the request transaction: runs the work, counting how often one was opened.
  const tx = { inTransaction: jest.fn((fn: () => Promise<unknown>) => fn()) };
  const notifications = {
    penaltyRecorded: jest.fn().mockResolvedValue(undefined),
    penaltyReviewed: jest.fn().mockResolvedValue(undefined),
    penaltyApproved: jest.fn().mockResolvedValue(undefined),
    penaltyRejected: jest.fn().mockResolvedValue(undefined),
    penaltyCancelled: jest.fn().mockResolvedValue(undefined),
  };
  const permissions = { holdersWithScope: jest.fn().mockResolvedValue(reviewHolders) };
  const users = { accountOfEmployee: jest.fn().mockResolvedValue(employeeAccount) };
  const service = new PenaltyRecordsService(
    repository as unknown as PenaltyRecordsRepository,
    {
      getUsable: jest.fn().mockResolvedValue({ id: 'v1', levels: LEVELS.map((l) => ({ ...l, days: l.days && Number(l.days) })), oncePerDay }),
    } as unknown as PenaltyCatalogueService,
    {
      assertActive: jest.fn(),
      assertInScope: jest.fn(),
      assertScopeFirst: jest.fn(),
      stagesOf: jest.fn().mockResolvedValue({ managerId: null, stages: [{ id: 'primary', nameEn: 'Primary', nameAr: 'الابتدائية' }] }),
      ...employees,
    } as unknown as EmployeesService,
    settings as unknown as HrSettingsService,
    monthLock as unknown as MonthLockService,
    access,
    audit as unknown as AuditService,
    tx as unknown as AfterCommit,
    notifications as unknown as HrNotificationsService,
    permissions as unknown as PermissionsService,
    users as unknown as UsersService,
  );
  return { service, repository, monthLock, audit, tx, notifications, permissions };
}

describe('PenaltyRecordsService', () => {
  it('a PENDING record is shown with today’s count and catalogue; an APPROVED one with its stored values', async () => {
    const { service } = makeService({
      findOne: jest.fn().mockResolvedValue(row()),
      approvedCandidates: jest.fn().mockResolvedValue([approvedAt('r0', '2025-11-03T08:00:00Z')]),
    });
    expect(await service.get('r1')).toMatchObject({ level: 2, action: 'DEDUCT_DAYS', days: 2 });

    const approved = makeService({
      findOne: jest.fn().mockResolvedValue(row({ status: 'APPROVED', level: 1, action: 'NOTICE' })),
    });
    expect(await approved.service.get('r1')).toMatchObject({ level: 1, action: 'NOTICE', days: null });
    expect(approved.repository.approvedCandidates).not.toHaveBeenCalled();
  });

  it('approve passes the window [1 June, record date] and counts same-date ones recorded earlier', async () => {
    const { service, repository, monthLock } = makeService();
    await service.approve('r1', 'u1');
    expect(monthLock.assertMonthOpen).toHaveBeenCalledWith('2025-11');
    const [, key, window, by, resolve] = repository.approve.mock.calls[0] as [
      string,
      { employeeId: string },
      unknown,
      string,
      (approved: unknown[]) => unknown,
    ];
    expect(key.employeeId).toBe('e1');
    expect(window).toEqual({ from: '2025-06-01', upTo: '2025-11-10' });
    expect(by).toBe('u1');
    // The record was recorded at 08:00 on 2025-11-10.
    expect(resolve([approvedAt('r0', '2025-11-10T07:00:00Z')])).toEqual({
      level: 2,
      action: 'DEDUCT_DAYS',
      days: 2,
    });
    expect(resolve([approvedAt('r2', '2025-11-10T09:00:00Z')])).toMatchObject({ level: 1 });
  });

  it('approve losing a race to a cancel → 409 PENALTY_CANCELLED', async () => {
    const { service } = makeService({
      approve: jest.fn().mockResolvedValue('NOT_PENDING'),
      findStatus: jest.fn().mockResolvedValue({ status: 'CANCELLED', date: '2025-11-10' }),
    });
    await expect(service.approve('r1', null)).rejects.toMatchObject({
      code: ErrorCode.PENALTY_CANCELLED,
    });
  });

  describe('approve in date order (§4, owner 2026-11-20)', () => {
    type Earlier = (records: unknown[]) => { id: string } | null;
    const pendingAt = (id: string, iso: string) => ({ ...approvedAt(id, iso), status: 'WAITING_HR' });

    it('an earlier pending one → 409 PENALTY_EARLIER_PENDING naming its date; nothing audited or notified', async () => {
      const { service, audit, notifications } = makeService({
        approve: jest.fn().mockResolvedValue({ earlierPending: '2025-11-09' }),
      });
      await expect(service.approve('r1', 'u1')).rejects.toMatchObject({
        status: 409,
        code: ErrorCode.PENALTY_EARLIER_PENDING,
        params: { date: '2025-11-09' },
      });
      expect(audit.record).not.toHaveBeenCalled();
      expect(notifications.penaltyApproved).not.toHaveBeenCalled();
    });

    it('the check the repository runs under the lock: earlier pending blocks, approved / later do not', async () => {
      const { service, repository } = makeService();
      await service.approve('r1', 'u1');
      const earlier = repository.approve.mock.calls[0][6] as Earlier;
      // r1 is dated 2025-11-10, recorded 08:00.
      expect(earlier([pendingAt('r0', '2025-11-09T08:00:00Z')])?.id).toBe('r0');
      expect(earlier([pendingAt('r0', '2025-11-10T07:00:00Z')])?.id).toBe('r0');
      expect(earlier([pendingAt('r2', '2025-11-10T09:00:00Z')])).toBeNull();
      expect(earlier([approvedAt('r0', '2025-11-09T08:00:00Z')])).toBeNull();
    });

    it('a pending row carries its blocker; one with none (or an approved row) carries null', async () => {
      const blocked = makeService({
        approvedCandidates: jest.fn().mockResolvedValue([pendingAt('r0', '2025-11-09T08:00:00Z')]),
      });
      expect(await blocked.service.get('r1')).toMatchObject({
        level: 1,
        earlierPending: { id: 'r0', date: '2025-11-09' },
      });
      // Every date of the pair: later approved ones are what approving it would recount (§4).
      expect(blocked.repository.approvedCandidates).toHaveBeenCalledWith(
        [{ employeeId: 'e1', violationId: 'v1' }],
        undefined,
        undefined,
        { withPending: true },
      );
      const free = makeService();
      expect(await free.service.get('r1')).toMatchObject({ earlierPending: null });
      const approved = makeService({ findOne: jest.fn().mockResolvedValue(row({ status: 'APPROVED' })) });
      expect(await approved.service.get('r1')).toMatchObject({ earlierPending: null });
    });
  });

  it('cancel checks the month lock before writing', async () => {
    const { service, repository, monthLock } = makeService();
    monthLock.assertMonthOpen.mockRejectedValue(new Error('locked'));
    await expect(service.cancel('r1', { reason: 'x' }, null)).rejects.toThrow('locked');
    expect(repository.cancel).not.toHaveBeenCalled();
  });

  describe('once per day (§4, owner 2026-11-18)', () => {
    const dto = { employeeId: 'e1', violationId: 'v1', date: '2025-11-10' };
    type Refuse = (statuses: string[]) => boolean;
    const refuseOf = (mock: jest.Mock, at: number): Refuse =>
      mock.mock.calls[0][at] as Refuse;

    it('recording: a second same-day penalty is refused while the first is pending or approved', async () => {
      const { service, repository } = makeService({ createRecord: jest.fn().mockResolvedValue(null) });
      await expect(service.create(dto, 'u1')).rejects.toMatchObject({
        code: ErrorCode.VIOLATION_ONCE_PER_DAY,
        status: 409,
      });
      const refuse = refuseOf(repository.createRecord, 1);
      expect(refuse(['PENDING_REVIEW'])).toBe(true);
      expect(refuse(['WAITING_HR'])).toBe(true);
      expect(refuse(['APPROVED'])).toBe(true);
      // A cancelled one doesn't block.
      expect(refuse(['CANCELLED'])).toBe(false);
    });

    it('recording a violation that repeats within a day is never refused', async () => {
      const { service, repository } = makeService({}, false);
      await service.create(dto, 'u1');
      expect(refuseOf(repository.createRecord, 1)(['APPROVED', 'WAITING_HR'])).toBe(false);
    });

    it('preview says so before submitting', async () => {
      const { service } = makeService({ sameDayStatuses: jest.fn().mockResolvedValue(['PENDING_REVIEW']) });
      await expect(service.preview(dto)).rejects.toMatchObject({
        code: ErrorCode.VIOLATION_ONCE_PER_DAY,
      });
      const cancelled = makeService({ sameDayStatuses: jest.fn().mockResolvedValue(['CANCELLED']) });
      await expect(cancelled.service.preview(dto)).resolves.toMatchObject({ level: 1 });
      const off = makeService({ sameDayStatuses: jest.fn().mockResolvedValue(['APPROVED']) }, false);
      await expect(off.service.preview(dto)).resolves.toMatchObject({ level: 1 });
      expect(off.repository.sameDayStatuses).not.toHaveBeenCalled();
    });

    it('approval re-checks: refused when another one that day is already approved', async () => {
      const { service, repository } = makeService({
        approve: jest.fn().mockResolvedValue('ONCE_PER_DAY'),
      });
      await expect(service.approve('r1', 'u1')).rejects.toMatchObject({
        code: ErrorCode.VIOLATION_ONCE_PER_DAY,
      });
      const refuse = refuseOf(repository.approve, 5);
      expect(refuse(['APPROVED'])).toBe(true);
      // Another waiting one doesn't block approving this one.
      expect(refuse(['WAITING_HR'])).toBe(false);
    });

    it('approval follows the violation’s flag today', async () => {
      const { service, repository } = makeService({
        findOne: jest.fn().mockResolvedValue(
          row({ violation: { id: 'v1', nameEn: 'Late', nameAr: 'تأخر', oncePerDay: false, levels: LEVELS } }),
        ),
      });
      await service.approve('r1', 'u1');
      expect(refuseOf(repository.approve, 5)(['APPROVED'])).toBe(false);
    });
  });
});

describe('PenaltyRecordsService — scopes (R5, edge case 3)', () => {
  const PRIMARY = { kind: 'stage', stageIds: ['primary'] } as const;
  const STAGE_HEAD = fakeAccess({
    'hr.penalties.view': PRIMARY,
    'hr.penalties.record': PRIMARY,
    'hr.penalties.approve': PRIMARY,
    'hr.penalties.cancel': PRIMARY,
  });

  it('approve: the record is looked up inside the approve scope; outside → 404, nothing approved', async () => {
    const { service, repository } = makeService({ findOne: jest.fn().mockResolvedValue(null) }, true, STAGE_HEAD);
    await expect(service.approve('r9', 'u1')).rejects.toMatchObject({ status: 404 });
    expect(repository.findOne).toHaveBeenCalledWith('r9', { stageId: { in: ['primary'] } });
    expect(repository.approve).not.toHaveBeenCalled();
  });

  it('cancel: outside the cancel scope → 404, nothing cancelled', async () => {
    const { service, repository } = makeService({ findOne: jest.fn().mockResolvedValue(null) }, true, STAGE_HEAD);
    await expect(service.cancel('r9', { reason: 'x' }, 'u1')).rejects.toMatchObject({ status: 404 });
    expect(repository.findOne).toHaveBeenCalledWith('r9', { stageId: { in: ['primary'] } });
    expect(repository.cancel).not.toHaveBeenCalled();
  });

  it('get and list read inside the view scope', async () => {
    const { service, repository } = makeService(
      {
        list: jest.fn().mockResolvedValue({ data: [], total: 0, page: 1, limit: 10, hasNextPage: false, hasPreviousPage: false }),
        findOne: jest.fn().mockResolvedValue(null),
      },
      true,
      STAGE_HEAD,
    );
    await service.list({});
    expect((repository as unknown as { list: jest.Mock }).list.mock.calls[0][3]).toEqual({ stageId: { in: ['primary'] } });
    await expect(service.get('r9')).rejects.toMatchObject({ status: 404 });
  });

  it('recording: the scope is checked first — outside → 404 even for an inactive employee', async () => {
    const assertScopeFirst = jest.fn().mockRejectedValue(Object.assign(new Error('nf'), { status: 404 }));
    const assertActive = jest.fn();
    const { service } = makeService({}, true, STAGE_HEAD, { assertScopeFirst, assertActive });
    await expect(
      service.create({ employeeId: 'e9', violationId: 'v1', date: '2025-11-10' }, 'u1'),
    ).rejects.toMatchObject({ status: 404 });
    expect(assertScopeFirst).toHaveBeenCalledWith('hr.penalties.record', ['e9']);
    expect(assertActive).not.toHaveBeenCalled();
  });
});

describe('PenaltyRecordsService — audit entries (§9, T29)', () => {
  const dto = { employeeId: 'e1', violationId: 'v1', date: '2025-11-10', note: 'Came at 9' };
  const label = { en: 'A', ar: 'أ' };
  // The employee is the label only (not a line repeating the sentence).
  const names = { violationId: { nameEn: 'Late', nameAr: 'تأخر' } };

  it('recording: one hr.penalty.record entry on the penalty, from nothing, by names — in one transaction', async () => {
    const { service, audit, tx } = makeService({ createRecord: jest.fn().mockResolvedValue(row({ note: 'Came at 9' })) });
    await service.create(dto, 'u1');
    expect(tx.inTransaction).toHaveBeenCalledTimes(1);
    expect(audit.record).toHaveBeenCalledTimes(1);
    expect(audit.record).toHaveBeenCalledWith({
      action: 'hr.penalty.record',
      entity: { type: 'penalty', id: 'r1', label },
      before: null,
      after: {
        ...names,
        date: '2025-11-10',
        stage: { nameEn: 'Primary', nameAr: 'الابتدائية' },
        level: 1,
        action: 'NOTICE',
        days: null,
        status: 'WAITING_HR',
        note: 'Came at 9',
        reviewSkip: null,
        reviewNote: null,
        approvalNote: null,
        rejectedStep: null,
        rejectionReason: null,
        cancelReason: null,
      },
    });
  });

  it('approving: the status and the level fixed at approval, before → after', async () => {
    const pending = row();
    const approved = row({ status: 'APPROVED', level: 2, action: 'DEDUCT_DAYS', days: '2' });
    const { service, audit } = makeService({
      findOne: jest.fn().mockResolvedValueOnce(pending).mockResolvedValue(approved),
    });
    await service.approve('r1', 'u1');
    const [input] = audit.record.mock.calls[0] as [{ action: string; before: object; after: object }];
    expect(input.action).toBe('hr.penalty.approve');
    expect(input.before).toMatchObject({ ...names, status: 'WAITING_HR', level: 1, action: 'NOTICE', days: null });
    expect(input.after).toMatchObject({ ...names, status: 'APPROVED', level: 2, action: 'DEDUCT_DAYS', days: 2 });
  });

  it('cancelling: the status and the reason', async () => {
    const cancelled = row({ status: 'CANCELLED', cancelReason: 'Recorded twice' });
    const { service, audit } = makeService({
      findOne: jest.fn().mockResolvedValueOnce(row()).mockResolvedValue(cancelled),
    });
    await service.cancel('r1', { reason: 'Recorded twice' }, 'u1');
    const [input] = audit.record.mock.calls[0] as [{ action: string; entity: object; before: object; after: object }];
    expect(input).toMatchObject({
      action: 'hr.penalty.cancel',
      entity: { type: 'penalty', id: 'r1', label },
      before: { status: 'WAITING_HR', cancelReason: null },
      after: { status: 'CANCELLED', cancelReason: 'Recorded twice' },
    });
  });

  it('a refused write records nothing (once per day, lost race, locked month)', async () => {
    const sameDay = makeService({ createRecord: jest.fn().mockResolvedValue(null) });
    await expect(sameDay.service.create(dto, 'u1')).rejects.toMatchObject({ status: 409 });
    expect(sameDay.audit.record).not.toHaveBeenCalled();

    const race = makeService({
      approve: jest.fn().mockResolvedValue('NOT_PENDING'),
      findStatus: jest.fn().mockResolvedValue({ status: 'APPROVED', date: '2025-11-10' }),
    });
    await expect(race.service.approve('r1', 'u1')).rejects.toMatchObject({ status: 409 });
    expect(race.audit.record).not.toHaveBeenCalled();

    const locked = makeService();
    locked.monthLock.assertMonthOpen.mockRejectedValue(new Error('locked'));
    await expect(locked.service.cancel('r1', { reason: 'x' }, 'u1')).rejects.toThrow('locked');
    expect(locked.audit.record).not.toHaveBeenCalled();
  });

  describe('approval notifications (§11, plan N2)', () => {
    it('recording tells the approvers, in the recording transaction, with the names and the level', async () => {
      const { service, notifications, tx } = makeService();
      await service.create(dto, 'u1');
      expect(tx.inTransaction).toHaveBeenCalledTimes(1);
      expect(notifications.penaltyRecorded).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'r1',
          employee: expect.objectContaining({ id: 'e1', nameEn: 'A', nameAr: 'أ' }),
          violation: expect.objectContaining({ nameEn: 'Late', nameAr: 'تأخر' }),
          level: 1,
          month: '2025-11',
        }),
        'u1',
        [],
      );
    });

    it('approving resolves it as approved by the approver (edge 4)', async () => {
      const { service, notifications } = makeService();
      await service.approve('r1', 'u1');
      expect(notifications.penaltyApproved).toHaveBeenCalledWith('r1', 'u1');
    });

    it('cancelling a pending one resolves it as cancelled (edge 5); an approved one sends nothing (edge 6)', async () => {
      const pending = makeService();
      await pending.service.cancel('r1', { reason: 'x' }, 'u1');
      expect(pending.notifications.penaltyCancelled).toHaveBeenCalledWith('r1', 'u1');

      const approved = makeService({
        findOne: jest.fn().mockResolvedValue(row({ status: 'APPROVED' })),
      });
      await approved.service.cancel('r1', { reason: 'x' }, 'u1');
      expect(approved.notifications.penaltyCancelled).not.toHaveBeenCalled();
    });

    it('a refused recording or approval tells no one (edge 7)', async () => {
      const sameDay = makeService({ createRecord: jest.fn().mockResolvedValue(null) });
      await expect(sameDay.service.create(dto, 'u1')).rejects.toMatchObject({ status: 409 });
      expect(sameDay.notifications.penaltyRecorded).not.toHaveBeenCalled();

      const locked = makeService();
      locked.monthLock.assertMonthOpen.mockRejectedValue(new Error('locked'));
      await expect(locked.service.create(dto, 'u1')).rejects.toThrow('locked');
      expect(locked.notifications.penaltyRecorded).not.toHaveBeenCalled();

      const race = makeService({
        approve: jest.fn().mockResolvedValue('NOT_PENDING'),
        findStatus: jest.fn().mockResolvedValue({ status: 'APPROVED', date: '2025-11-10' }),
      });
      await expect(race.service.approve('r1', 'u1')).rejects.toMatchObject({ status: 409 });
      expect(race.notifications.penaltyApproved).not.toHaveBeenCalled();
    });
  });

  it('an employee History asked for a non-UUID record id has no penalties (no query on the uuid column)', async () => {
    const findIdsOfEmployees = jest.fn().mockResolvedValue(['p1']);
    const { service } = makeService({ findIdsOfEmployees });
    await expect(service.idsOfEmployee('act-123')).resolves.toEqual([]);
    expect(findIdsOfEmployees).not.toHaveBeenCalled();
    await expect(service.idsOfEmployee('33333333-3333-4333-8333-333333333333')).resolves.toEqual(['p1']);
  });
});

describe('PenaltyRecordsService — backdated penalty recount (§4, owner 2026-11-20)', () => {
  // r1 is dated 2025-11-10, recorded 08:00; LEVELS: 1 NOTICE, 2 DEDUCT_DAYS 2.
  const laterApproved = (id: string, date: string, level = 1) => ({
    ...approvedAt(id, `${date}T08:00:00Z`),
    level,
    action: level === 1 ? 'NOTICE' : 'DEDUCT_DAYS',
    days: level === 1 ? null : 2,
  });
  const change = {
    id: 'r2',
    date: '2025-11-12',
    before: { level: 1, action: 'NOTICE', days: null },
    after: { level: 2, action: 'DEDUCT_DAYS', days: 2 },
  };
  const ack = [{ id: 'r2', level: 2, action: 'DEDUCT_DAYS' as const, days: 2 }];
  /** A repository `approve` that runs the service's recount plan on `pair`, then approves. */
  const approveRunning = (pair: unknown[], updates: unknown[] = []) =>
    jest.fn(async (...args: unknown[]) => {
      const plan = args[7] as (records: unknown[]) => Promise<unknown[]>;
      updates.push(...(await plan(pair)));
      return 'APPROVED';
    });
  const dto = { employeeId: 'e1', violationId: 'v1', date: '2025-11-10' };

  it('the preview lists what approving would change; recording changes nothing', async () => {
    const { service, repository } = makeService({
      approvedCandidates: jest.fn().mockResolvedValue([laterApproved('r2', '2025-11-12')]),
    });
    expect(await service.preview(dto)).toEqual({
      level: 1,
      action: 'NOTICE',
      days: null,
      priorCount: 0,
      recount: [change],
      recountElsewhere: 0,
      startsAs: 'WAITING_HR',
      reviewSkip: 'NO_STAGE_HEAD',
    });
    // From the window's start, every later date included.
    expect(repository.approvedCandidates).toHaveBeenCalledWith([dto], undefined, '2025-06-01');
    await service.create(dto, 'u1');
    expect(repository.approve).not.toHaveBeenCalled();
  });

  it('one of them in an approved payroll month → the preview and the recording are refused naming the month', async () => {
    const { service, repository, monthLock } = makeService({
      approvedCandidates: jest.fn().mockResolvedValue([laterApproved('r2', '2025-12-02')]),
    });
    monthLock.isMonthLocked.mockImplementation((m: string) => Promise.resolve(m === '2025-12'));
    const refusal = { code: ErrorCode.PENALTY_RECOUNT_MONTH_LOCKED, status: 409, params: { month: '2025-12' } };
    await expect(service.preview(dto)).rejects.toMatchObject(refusal);
    await expect(service.create(dto, 'u1')).rejects.toMatchObject(refusal);
    expect(repository.createRecord).not.toHaveBeenCalled();
  });

  it('a pending record carries its recount and the locked month among it; an approved one none', async () => {
    const { service, monthLock } = makeService({
      approvedCandidates: jest.fn().mockResolvedValue([laterApproved('r2', '2025-11-12')]),
    });
    expect(await service.get('r1')).toMatchObject({ recount: [change], recountLockedMonth: null });
    monthLock.isMonthLocked.mockResolvedValue(true);
    expect(await service.get('r1')).toMatchObject({ recountLockedMonth: '2025-11' });
    const approved = makeService({ findOne: jest.fn().mockResolvedValue(row({ status: 'APPROVED' })) });
    expect(await approved.service.get('r1')).toMatchObject({ recount: [], recountLockedMonth: null });
  });

  it('approving without confirming the changes → 409 PENALTY_RECOUNT_UNCONFIRMED with the list; nothing audited', async () => {
    const { service, audit, notifications } = makeService({
      approve: approveRunning([laterApproved('r2', '2025-11-12')]),
    });
    await expect(service.approve('r1', 'u1')).rejects.toMatchObject({
      code: ErrorCode.PENALTY_RECOUNT_UNCONFIRMED,
      status: 409,
      params: { count: 1 },
      data: { recount: [change] },
    });
    expect(audit.record).not.toHaveBeenCalled();
    expect(notifications.penaltyApproved).not.toHaveBeenCalled();
  });

  it('a stale confirmation → 409 PENALTY_RECOUNT_CHANGED with the fresh list', async () => {
    const { service } = makeService({
      approve: approveRunning([laterApproved('r2', '2025-11-12'), laterApproved('r3', '2025-11-13')]),
    });
    await expect(service.approve('r1', 'u1', ack)).rejects.toMatchObject({
      code: ErrorCode.PENALTY_RECOUNT_CHANGED,
      params: { count: 2 },
      data: { recount: [change, { ...change, id: 'r3', date: '2025-11-13' }] },
    });
    // Confirming changes when there are none now is stale too.
    const none = makeService({ approve: approveRunning([]) });
    await expect(none.service.approve('r1', 'u1', ack)).rejects.toMatchObject({ code: ErrorCode.PENALTY_RECOUNT_CHANGED });
  });

  it('a locked month among the changes refuses the approval (it may have been approved since recording)', async () => {
    const { service, monthLock } = makeService({ approve: approveRunning([laterApproved('r2', '2025-12-02')]) });
    monthLock.isMonthLocked.mockResolvedValue(true);
    await expect(service.approve('r1', 'u1', ack)).rejects.toMatchObject({
      code: ErrorCode.PENALTY_RECOUNT_MONTH_LOCKED,
      params: { month: '2025-12' },
    });
  });

  it('confirmed: the repository writes the moves; one hr.penalty.recount entry each after the approval, linked to the employee', async () => {
    const updates: unknown[] = [];
    const approved = row({ status: 'APPROVED' });
    const { service, audit } = makeService({
      approve: approveRunning([laterApproved('r2', '2025-11-12')], updates),
      findOne: jest.fn().mockResolvedValueOnce(row()).mockResolvedValue(approved),
    });
    await service.approve('r1', 'u1', ack);
    expect(updates).toEqual([{ id: 'r2', fromLevel: 1, level: 2, action: 'DEDUCT_DAYS', days: 2 }]);
    expect(audit.record).toHaveBeenCalledTimes(2);
    expect(audit.record.mock.calls[0][0]).toMatchObject({ action: 'hr.penalty.approve' });
    expect(audit.record.mock.calls[1][0]).toEqual({
      action: 'hr.penalty.recount',
      entity: { type: 'penalty', id: 'r2', label: { en: 'A', ar: 'أ' } },
      changes: [
        { field: 'penaltyDate', before: null, after: '2025-11-12' },
        { field: 'level', before: 1, after: 2 },
        { field: 'action', before: 'NOTICE', after: 'DEDUCT_DAYS' },
        { field: 'days', before: null, after: 2 },
        { field: 'recountedAfter', before: null, after: '2025-11-10' },
      ],
    });
  });

  it('nothing to recount: approving needs no confirmation and writes one entry', async () => {
    const updates: unknown[] = [];
    const { service, audit } = makeService({ approve: approveRunning([laterApproved('r0', '2025-11-03')], updates) });
    await service.approve('r1', 'u1');
    expect(updates).toEqual([]);
    expect(audit.record).toHaveBeenCalledTimes(1);
  });

  it('cancel runs under the pair lock (the record is the key)', async () => {
    const { service, repository } = makeService();
    await service.cancel('r1', { reason: 'x' }, 'u1');
    expect(repository.cancel).toHaveBeenCalledWith('r1', 'x', 'u1', expect.objectContaining({ employeeId: 'e1', violationId: 'v1' }));
  });
});

describe('PenaltyRecordsService — the two steps (§4, owner 2026-11-21)', () => {
  const dto = { employeeId: 'e1', violationId: 'v1', date: '2025-11-10' };
  const PRIMARY = { kind: 'stage', stageIds: ['primary'] } as const;
  const PREP = { kind: 'stage', stageIds: ['prep'] } as const;
  const primaryHead = head('u-head', 'e-head', ['primary']);
  const prepHead = head('u-prep', 'e-prep', ['prep']);
  const officer = () => fakeAccess({ 'hr.penalties.review': null }, { userId: 'u-officer', employeeId: null });
  const twoStages = () => ({
    stagesOf: jest.fn().mockResolvedValue({
      managerId: null,
      stages: [
        { id: 'primary', nameEn: 'Primary', nameAr: 'الابتدائية' },
        { id: 'prep', nameEn: 'Preparatory', nameAr: 'الإعدادية' },
      ],
    }),
  });
  const created = (repository: { createRecord: jest.Mock }) =>
    repository.createRecord.mock.calls[0][0] as { stageId: string; status: string; reviewSkip: string | null };

  describe('recording: where it starts', () => {
    it('a stage with a stage head → Pending stage review; whoever acts next is told, never the penalised employee', async () => {
      const { service, repository, notifications } = makeService(
        { createRecord: jest.fn().mockResolvedValue(row({ status: 'PENDING_REVIEW' })) },
        true,
        officer(),
        {},
        [primaryHead],
        { id: 'u-e1', name: 'A' },
      );
      await service.create(dto, 'u-officer');
      expect(created(repository)).toMatchObject({ stageId: 'primary', status: 'PENDING_REVIEW', reviewSkip: null });
      expect(notifications.penaltyRecorded).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'r1', status: 'PENDING_REVIEW' }),
        'u-officer',
        ['u-e1'],
      );
    });

    it('the recorder is a stage head of the penalty stage → skip: Waiting for HR (RECORDER_IS_HEAD)', async () => {
      const access = fakeAccess({ 'hr.penalties.review': PRIMARY }, { userId: 'u-head', employeeId: 'e-head' });
      const { service, repository } = makeService({}, true, access, {}, [primaryHead]);
      await service.create(dto, 'u-head');
      expect(created(repository)).toMatchObject({ status: 'WAITING_HR', reviewSkip: 'RECORDER_IS_HEAD' });
    });

    it('a recorder who heads another stage is no reviewer here → Pending stage review', async () => {
      const access = fakeAccess({ 'hr.penalties.review': PREP }, { userId: 'u-prep', employeeId: 'e-prep' });
      const { service, repository } = makeService({}, true, access, {}, [primaryHead, prepHead]);
      await service.create(dto, 'u-prep');
      expect(created(repository)).toMatchObject({ status: 'PENDING_REVIEW', reviewSkip: null });
    });

    it('no stage head → skip: Waiting for HR (NO_STAGE_HEAD); a school-wide reviewer (System admin) heads no stage', async () => {
      const admin = { userId: 'u-admin', scope: { scope: 'all', employeeId: null, stageId: null, stageIds: [] } as UserScope };
      const { service, repository } = makeService({}, true, officer(), {}, [admin, prepHead]);
      await service.create(dto, 'u-officer');
      expect(created(repository)).toMatchObject({ status: 'WAITING_HR', reviewSkip: 'NO_STAGE_HEAD' });
    });

    it('penalty against a stage head (edge case 1) → Waiting for HR (EMPLOYEE_IS_HEAD), also when they record it themselves', async () => {
      const against = { ...dto, employeeId: 'e-head' };
      const a = makeService({}, true, officer(), {}, [primaryHead]);
      await a.service.create(against, 'u-officer');
      expect(created(a.repository)).toMatchObject({ status: 'WAITING_HR', reviewSkip: 'EMPLOYEE_IS_HEAD' });

      const self = fakeAccess({ 'hr.penalties.review': PRIMARY }, { userId: 'u-head', employeeId: 'e-head' });
      const b = makeService({}, true, self, {}, [primaryHead]);
      await b.service.create(against, 'u-head');
      expect(created(b.repository)).toMatchObject({ status: 'WAITING_HR', reviewSkip: 'EMPLOYEE_IS_HEAD' });
    });

    it('the system recording (seed, no signed-in user) is nobody’s review', async () => {
      const { service, repository } = makeService({}, true, fakeAccess(), {}, [primaryHead]);
      await service.create(dto, null);
      expect(created(repository)).toMatchObject({ status: 'PENDING_REVIEW' });
    });

    it('several stages: the recorder must choose one of the employee’s stages', async () => {
      const none = makeService({}, true, officer(), twoStages(), [primaryHead]);
      await expect(none.service.create(dto, 'u-officer')).rejects.toMatchObject({ status: 400, code: ErrorCode.PENALTY_STAGE_REQUIRED });
      await expect(none.service.create({ ...dto, stageId: 'kg' }, 'u-officer')).rejects.toMatchObject({
        code: ErrorCode.PENALTY_STAGE_INVALID,
      });
      expect(none.repository.createRecord).not.toHaveBeenCalled();
      const prep = makeService({}, true, officer(), twoStages(), [primaryHead, prepHead]);
      await prep.service.create({ ...dto, stageId: 'prep' }, 'u-officer');
      expect(created(prep.repository)).toMatchObject({ stageId: 'prep', status: 'PENDING_REVIEW' });
    });

    it('the preview says where it goes, and waits for the stage choice when there are several', async () => {
      const { service } = makeService({}, true, officer(), twoStages(), [primaryHead]);
      expect(await service.preview(dto)).toMatchObject({ startsAs: null, reviewSkip: null });
      expect(await service.preview({ ...dto, stageId: 'primary' })).toMatchObject({ startsAs: 'PENDING_REVIEW' });
      expect(await service.preview({ ...dto, stageId: 'prep' })).toMatchObject({ startsAs: 'WAITING_HR', reviewSkip: 'NO_STAGE_HEAD' });
    });
  });

  describe('the stage review', () => {
    const asHead = () => fakeAccess({ 'hr.penalties.review': PRIMARY }, { userId: 'u-head', employeeId: 'e-head' });
    const reviewing = (over: Record<string, jest.Mock> = {}, access = asHead()) =>
      makeService(
        {
          findOne: jest
            .fn()
            .mockResolvedValueOnce(row({ status: 'PENDING_REVIEW' }))
            .mockResolvedValue(row({ status: 'WAITING_HR', reviewNote: 'ok' })),
          ...over,
        },
        true,
        access,
        {},
        [primaryHead],
        { id: 'u-e1', name: 'A' },
      );

    it('approve: Pending stage review → Waiting for HR with the note; audited; HR told, not the employee', async () => {
      const { service, repository, audit, notifications } = reviewing();
      await service.reviewApprove('r1', 'u-head', '  ok ');
      expect(repository.review).toHaveBeenCalledWith('r1', 'u-head', 'ok');
      expect(audit.record.mock.calls[0][0]).toMatchObject({
        action: 'hr.penalty.review',
        before: { status: 'PENDING_REVIEW' },
        after: { status: 'WAITING_HR', reviewNote: 'ok' },
      });
      expect(notifications.penaltyReviewed).toHaveBeenCalledWith(expect.objectContaining({ id: 'r1' }), 'u-head', ['u-e1']);
    });

    it('reject: a reason is required and recorded with the step; the recorder is told', async () => {
      const { service, repository, audit, notifications } = reviewing({
        findOne: jest
          .fn()
          .mockResolvedValueOnce(row({ status: 'PENDING_REVIEW' }))
          .mockResolvedValue(row({ status: 'REJECTED', rejectedStep: 'REVIEW', rejectionReason: 'كان في مهمة' })),
      });
      await service.reject('r1', 'REVIEW_REJECT', ' كان في مهمة ', 'u-head');
      expect(repository.reject).toHaveBeenCalledWith('r1', ['PENDING_REVIEW'], 'u-head', 'كان في مهمة', 'REVIEW', expect.anything());
      expect(audit.record.mock.calls[0][0]).toMatchObject({
        action: 'hr.penalty.reject',
        after: { status: 'REJECTED', rejectedStep: 'REVIEW', rejectionReason: 'كان في مهمة' },
      });
      expect(notifications.penaltyRejected).toHaveBeenCalledWith(expect.objectContaining({ id: 'r1', createdById: 'recorder' }), 'u-head');
    });

    it('reject reasons (edge case 7): blank is refused; nothing written', async () => {
      const { service, repository } = reviewing();
      await expect(service.reject('r1', 'REVIEW_REJECT', '   ', 'u-head')).rejects.toMatchObject({ status: 400 });
      expect(repository.reject).not.toHaveBeenCalled();
    });

    it('L2 — multi-stage visibility (edge cases 11, 12): the other stage’s head gets 404 on the actions and on the detail', async () => {
      const asPrep = fakeAccess(
        { 'hr.penalties.review': PREP, 'hr.penalties.view': PREP },
        { userId: 'u-prep', employeeId: 'e-prep' },
      );
      const { service, repository } = reviewing({ findOne: jest.fn().mockResolvedValue(null) }, asPrep);
      await expect(service.reviewApprove('r1', 'u-prep', null)).rejects.toMatchObject({ status: 404 });
      await expect(service.reject('r1', 'REVIEW_REJECT', 'x', 'u-prep')).rejects.toMatchObject({ status: 404 });
      expect(repository.findOne).toHaveBeenCalledWith('r1', { stageId: { in: ['prep'] } });
      await expect(service.get('r1')).rejects.toMatchObject({ status: 404 });
      expect(repository.review).not.toHaveBeenCalled();
    });

    it('an unknown penalty → 404', async () => {
      const { service } = reviewing({ findOne: jest.fn().mockResolvedValue(null), findStatus: jest.fn().mockResolvedValue(null) });
      await expect(service.reviewApprove('r9', 'u-head', null)).rejects.toMatchObject({ status: 404 });
    });

    it('own penalty (edge case 1): a stage head never reviews a penalty given to them — 403 PENALTY_OWN', async () => {
      const { service, repository } = reviewing({
        findOne: jest.fn().mockResolvedValue(row({ status: 'PENDING_REVIEW', employeeId: 'e-head' })),
      });
      await expect(service.reviewApprove('r1', 'u-head', null)).rejects.toMatchObject({ status: 403, code: ErrorCode.PENALTY_OWN });
      await expect(service.reject('r1', 'REVIEW_REJECT', 'x', 'u-head')).rejects.toMatchObject({ code: ErrorCode.PENALTY_OWN });
      expect(repository.review).not.toHaveBeenCalled();
    });

    it('two reviews at once (edge case 5): the loser gets 409 PENALTY_WRONG_STEP with the fresh status, nothing audited', async () => {
      const { service, audit, notifications } = reviewing({
        review: jest.fn().mockResolvedValue(false),
        findStatus: jest.fn().mockResolvedValue({ status: 'WAITING_HR', date: '2025-11-10' }),
      });
      await expect(service.reviewApprove('r1', 'u-head', null)).rejects.toMatchObject({
        status: 409,
        code: ErrorCode.PENALTY_WRONG_STEP,
        data: { status: 'WAITING_HR' },
      });
      expect(audit.record).not.toHaveBeenCalled();
      expect(notifications.penaltyReviewed).not.toHaveBeenCalled();

      const lostToReject = reviewing({
        reject: jest.fn().mockResolvedValue(false),
        findStatus: jest.fn().mockResolvedValue({ status: 'REJECTED', date: '2025-11-10' }),
      });
      await expect(lostToReject.service.reject('r1', 'REVIEW_REJECT', 'x', 'u-head')).rejects.toMatchObject({
        code: ErrorCode.PENALTY_REJECTED,
      });
    });

    it('a penalty past the review (waiting for HR, approved), rejected or cancelled is refused (409)', async () => {
      for (const [status, code] of [
        ['WAITING_HR', ErrorCode.PENALTY_WRONG_STEP],
        ['APPROVED', ErrorCode.PENALTY_WRONG_STEP],
        ['REJECTED', ErrorCode.PENALTY_REJECTED],
        ['CANCELLED', ErrorCode.PENALTY_CANCELLED],
      ] as const) {
        const { service } = reviewing({ findOne: jest.fn().mockResolvedValue(row({ status })) });
        await expect(service.reviewApprove('r1', 'u-head', null)).rejects.toMatchObject({ status: 409, code });
      }
    });

    it('the stage head changes while it waits (edge case 3): the new head acts; with none left, HR may decide directly', async () => {
      const newHead = head('u-new', 'e-new', ['primary']);
      const asNew = fakeAccess({ 'hr.penalties.review': PRIMARY }, { userId: 'u-new', employeeId: 'e-new' });
      const a = makeService({ findOne: jest.fn().mockResolvedValue(row({ status: 'PENDING_REVIEW' })) }, true, asNew, {}, [newHead]);
      await a.service.reviewApprove('r1', 'u-new', null);
      expect(a.repository.review).toHaveBeenCalled();

      // Nobody heads primary any more: the record says so, and HR's approval takes it from Pending stage review.
      const asHr = () => fakeAccess({}, { userId: 'u-hr', employeeId: 'e-hr' });
      const hr = makeService({ findOne: jest.fn().mockResolvedValue(row({ status: 'PENDING_REVIEW' })) }, true, asHr(), {}, []);
      expect(await hr.service.get('r1')).toMatchObject({ hrMayDecide: true });
      await hr.service.approve('r1', 'u-hr');
      expect(hr.repository.approve.mock.calls[0][8]).toEqual(['WAITING_HR', 'PENDING_REVIEW']);
      // While a head is there, HR waits for the review.
      const waits = makeService({ findOne: jest.fn().mockResolvedValue(row({ status: 'PENDING_REVIEW' })) }, true, asHr(), {}, [primaryHead]);
      expect(await waits.service.get('r1')).toMatchObject({ hrMayDecide: false });
      await expect(waits.service.approve('r1', 'u-hr')).rejects.toMatchObject({
        status: 409,
        code: ErrorCode.PENALTY_WRONG_STEP,
        data: { status: 'PENDING_REVIEW' },
      });
    });

    it('the employee’s stages change after recording (edge case 4): the penalty keeps its stage, and its head still reviews it', async () => {
      // Scope and reviewers go by the penalty's stage, whatever the employee's stages are now.
      const { service, repository } = reviewing({
        findOne: jest.fn().mockResolvedValue(row({ status: 'PENDING_REVIEW', stageId: 'primary' })),
      });
      await service.reviewApprove('r1', 'u-head', null);
      expect(repository.findOne).toHaveBeenCalledWith('r1', { stageId: { in: ['primary'] } });
      expect(repository.review).toHaveBeenCalled();
    });

    it('an approved payroll month blocks the review (the existing lock)', async () => {
      const { service, repository, monthLock } = reviewing();
      monthLock.assertMonthOpen.mockRejectedValue(Object.assign(new Error('locked'), { status: 409 }));
      await expect(service.reviewApprove('r1', 'u-head', null)).rejects.toThrow('locked');
      expect(repository.review).not.toHaveBeenCalled();
    });
  });

  describe('the HR step', () => {
    const asHr = () => fakeAccess({}, { userId: 'u-hr', employeeId: 'e-hr' });

    it('approve: only from Waiting for HR, with the optional note; the level is fixed here', async () => {
      const { service, repository } = makeService({}, true, asHr());
      await service.approve('r1', 'u-hr', undefined, '  fine  ');
      expect(repository.approve.mock.calls[0][8]).toEqual(['WAITING_HR']);
      expect(repository.approve.mock.calls[0][9]).toBe('fine');
    });

    it('self-approval at HR (edge case 2): the HR approver who is the penalised employee is refused (403 PENALTY_OWN)', async () => {
      const { service, repository } = makeService({ findOne: jest.fn().mockResolvedValue(row({ employeeId: 'e-hr' })) }, true, asHr());
      await expect(service.approve('r1', 'u-hr')).rejects.toMatchObject({ status: 403, code: ErrorCode.PENALTY_OWN });
      await expect(service.reject('r1', 'HR_REJECT', 'x', 'u-hr')).rejects.toMatchObject({ code: ErrorCode.PENALTY_OWN });
      expect(repository.approve).not.toHaveBeenCalled();
      expect(repository.reject).not.toHaveBeenCalled();
    });

    it('reject: Waiting for HR → Rejected with the reason, step HR; audited; the recorder told', async () => {
      const { service, repository, audit, notifications } = makeService(
        {
          findOne: jest
            .fn()
            .mockResolvedValueOnce(row())
            .mockResolvedValue(row({ status: 'REJECTED', rejectedStep: 'HR', rejectionReason: 'No witness' })),
        },
        true,
        asHr(),
      );
      await service.reject('r1', 'HR_REJECT', 'No witness', 'u-hr');
      expect(repository.reject).toHaveBeenCalledWith('r1', ['WAITING_HR'], 'u-hr', 'No witness', 'HR', expect.anything());
      expect(audit.record.mock.calls[0][0]).toMatchObject({ action: 'hr.penalty.reject', after: { rejectedStep: 'HR' } });
      expect(notifications.penaltyRejected).toHaveBeenCalledTimes(1);
    });

    it('reject reasons (edge case 7): over 1,000 characters refused', async () => {
      const { service, repository } = makeService({}, true, asHr());
      await expect(service.reject('r1', 'HR_REJECT', 'x'.repeat(1001), 'u-hr')).rejects.toMatchObject({ status: 400 });
      expect(repository.reject).not.toHaveBeenCalled();
    });

    it('approved month (edge case 8): the payroll month approved while it was in review blocks the HR step', async () => {
      const { service, repository, monthLock } = makeService({}, true, asHr());
      monthLock.assertMonthOpen.mockRejectedValue(Object.assign(new Error('PAYROLL_APPROVED'), { status: 409 }));
      await expect(service.approve('r1', 'u-hr')).rejects.toThrow('PAYROLL_APPROVED');
      await expect(service.reject('r1', 'HR_REJECT', 'x', 'u-hr')).rejects.toThrow('PAYROLL_APPROVED');
      expect(repository.approve).not.toHaveBeenCalled();
      expect(repository.reject).not.toHaveBeenCalled();
    });

    it('date order (edge case 9): the earlier Pending stage review one blocks, named by date', async () => {
      const { service } = makeService({ approve: jest.fn().mockResolvedValue({ earlierPending: '2025-11-05' }) }, true, asHr());
      await expect(service.approve('r1', 'u-hr')).rejects.toMatchObject({
        code: ErrorCode.PENALTY_EARLIER_PENDING,
        params: { date: '2025-11-05' },
      });
    });

    it('a rejected, cancelled or approved penalty is refused at HR (409)', async () => {
      for (const [status, code] of [
        ['REJECTED', ErrorCode.PENALTY_REJECTED],
        ['CANCELLED', ErrorCode.PENALTY_CANCELLED],
        ['APPROVED', ErrorCode.PENALTY_WRONG_STEP],
      ] as const) {
        const { service } = makeService({ findOne: jest.fn().mockResolvedValue(row({ status })) }, true, asHr());
        await expect(service.approve('r1', 'u-hr')).rejects.toMatchObject({ status: 409, code });
        await expect(service.reject('r1', 'HR_REJECT', 'x', 'u-hr')).rejects.toMatchObject({ status: 409, code });
      }
    });
  });

  describe('cancel (edge case 6)', () => {
    it('cancelling while Pending stage review or Waiting for HR resolves what waited', async () => {
      for (const status of ['PENDING_REVIEW', 'WAITING_HR']) {
        const { service, repository, notifications } = makeService({ findOne: jest.fn().mockResolvedValue(row({ status })) });
        await service.cancel('r1', { reason: 'x' }, 'u1');
        expect(repository.cancel).toHaveBeenCalled();
        expect(notifications.penaltyCancelled).toHaveBeenCalledWith('r1', 'u1');
      }
    });
    it('a rejected or cancelled one is refused', async () => {
      for (const [status, code] of [
        ['REJECTED', ErrorCode.PENALTY_REJECTED],
        ['CANCELLED', ErrorCode.PENALTY_CANCELLED],
      ] as const) {
        const { service, repository } = makeService({ findOne: jest.fn().mockResolvedValue(row({ status })) });
        await expect(service.cancel('r1', { reason: 'x' }, 'u1')).rejects.toMatchObject({ status: 409, code });
        expect(repository.cancel).not.toHaveBeenCalled();
      }
    });
  });

  it('the dashboard tiles (edge case 11): Pending counts both waiting steps, Approved only HR-approved — a stage head by the penalty’s stage', async () => {
    const counts = { PENDING_REVIEW: 2, WAITING_HR: 3, APPROVED: 4, REJECTED: 5, CANCELLED: 6 };
    const countByStatusInMonth = jest.fn().mockResolvedValue(counts);
    const { service } = makeService({ countByStatusInMonth }, true, fakeAccess({ 'hr.penalties.view': PRIMARY }));
    expect(await service.monthCounts('2025-11')).toEqual({ pending: 5, approved: 4 });
    expect(countByStatusInMonth).toHaveBeenCalledWith('2025-11', { stageId: { in: ['primary'] } });
  });

  it('payroll: penalties waiting at either step are “pending”; rejected never count', async () => {
    const { service } = makeService({
      findForPayroll: jest.fn().mockResolvedValue([
        { employeeId: 'e1', status: 'PENDING_REVIEW', action: 'NOTICE', days: null },
        { employeeId: 'e1', status: 'WAITING_HR', action: 'NOTICE', days: null },
        { employeeId: 'e2', status: 'APPROVED', action: 'DEDUCT_DAYS', days: '1' },
      ]),
    });
    const inputs = await service.payrollInputs('2025-11');
    expect(inputs.pending.get('e1')).toBe(2);
    expect(inputs.deductingDays.get('e2')).toEqual([1]);
  });
});

describe('PenaltyRecordsService — fourth review H1: acting on a penalty needs a linked account', () => {
  const unlinked = () => fakeAccess({}, { userId: 'u-unlinked', employeeId: null });

  it('an unlinked account can’t cancel, approve, review or reject (ACCOUNT_NOT_LINKED); nothing is written', async () => {
    const { service, repository } = makeService({ findOne: jest.fn().mockResolvedValue(row()) }, true, unlinked());
    await expect(service.cancel('r1', { reason: 'x' }, 'u-unlinked')).rejects.toMatchObject({ code: 'ACCOUNT_NOT_LINKED' });
    await expect(service.approve('r1', 'u-unlinked')).rejects.toMatchObject({ code: 'ACCOUNT_NOT_LINKED' });
    await expect(service.reviewApprove('r1', 'u-unlinked', null)).rejects.toMatchObject({ code: 'ACCOUNT_NOT_LINKED' });
    await expect(service.reject('r1', 'HR_REJECT', 'Not proven', 'u-unlinked')).rejects.toMatchObject({
      code: 'ACCOUNT_NOT_LINKED',
    });
    expect(repository.cancel).not.toHaveBeenCalled();
    expect(repository.approve).not.toHaveBeenCalled();
  });
});
