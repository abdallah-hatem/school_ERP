import type { EventEmitter2 } from '@nestjs/event-emitter';
import { SettingsEvent } from '@school-erp/shared';
import type { AfterCommit } from '../../database/transactions';
import type { AuditService } from '../audit';
import { SettingsHistory, type ListHistoryChange } from './settings-history';

function makeHistory(record: jest.Mock = jest.fn(() => Promise.resolve())) {
  /** What `AfterCommit.run` queued: it runs only once the transaction commits. */
  const queued: (() => unknown)[] = [];
  const afterCommit = { run: jest.fn((fn: () => unknown) => (queued.push(fn), Promise.resolve())) };
  const events = { emitAsync: jest.fn(() => Promise.resolve([])) };
  const history = new SettingsHistory(
    { record } as unknown as AuditService,
    afterCommit as unknown as AfterCommit,
    events as unknown as EventEmitter2,
  );
  const commit = async () => {
    for (const fn of queued.splice(0)) await fn();
  };
  return { history, record, afterCommit, events, commit };
}

const dept = { id: 'd1', nameEn: 'Science', nameAr: 'العلوم', sortOrder: 1, isActive: true };

const change = (over: Partial<ListHistoryChange> = {}): ListHistoryChange => ({
  scope: 'lists',
  key: 'hr.departments',
  oldValue: null,
  newValue: dept,
  changedById: 'user-1',
  ...over,
});

describe('SettingsHistory (list and catalogue edits, in the change’s transaction)', () => {
  it('records a list create as hr.department.create, keyed like the old history row', async () => {
    const { history, record } = makeHistory();
    await history.record(change());
    expect(record).toHaveBeenCalledWith({
      action: 'hr.department.create',
      entity: { type: 'department', id: 'd1', label: { en: 'Science', ar: 'العلوم' } },
      changes: [{ field: 'hr.departments', before: null, after: dept }],
      actor: { id: 'user-1' },
    });
  });

  it.each([
    ['lists', 'hr.jobTitles', 'hr.job_title.update', 'job_title'],
    ['catalogue', 'hr.penaltyGroups', 'hr.penalty_group.update', 'penalty_group'],
    ['catalogue', 'hr.violations', 'hr.violation.update', 'violation'],
  ] as const)('%s %s with an old value → %s', async (scope, key, action, type) => {
    const { history, record } = makeHistory();
    await history.record(
      change({ scope, key, oldValue: dept, newValue: { ...dept, nameEn: 'X' } }),
    );
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        action,
        entity: { type, id: 'd1', label: { en: 'X', ar: 'العلوم' } },
      }),
    );
  });

  it('a stage edit takes its id from the key', async () => {
    const { history, record } = makeHistory();
    const s9 = { ...dept, id: 's9' };
    await history.record(change({ key: 'lists.stages.s9', oldValue: s9, newValue: s9 }));
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'core.stage.update',
        entity: { type: 'stage', id: 's9', label: { en: 'Science', ar: 'العلوم' } },
      }),
    );
  });

  it('no changedById → the actor is left to the request (none outside one)', async () => {
    const { history, record } = makeHistory();
    await history.record(change({ changedById: null }));
    expect(record.mock.calls[0][0]).not.toHaveProperty('actor');
  });

  it('settings.changed fires only after the commit, and only for a real change', async () => {
    const { history, events, commit } = makeHistory();
    await history.record(change());
    expect(events.emitAsync).not.toHaveBeenCalled();
    await commit();
    expect(events.emitAsync).toHaveBeenCalledWith(
      SettingsEvent.CHANGED,
      expect.objectContaining({
        key: 'hr.departments',
        newValue: dept,
        changedAt: expect.any(String),
      }),
    );

    events.emitAsync.mockClear();
    await history.record(change({ oldValue: dept, newValue: { ...dept } }));
    await commit();
    expect(events.emitAsync).not.toHaveBeenCalled();
  });

  it('a failing audit write is thrown back, so the caller’s transaction rolls back', async () => {
    const { history, afterCommit } = makeHistory(
      jest.fn(() => Promise.reject(new Error('db down'))),
    );
    await expect(history.record(change())).rejects.toThrow('db down');
    expect(afterCommit.run).not.toHaveBeenCalled();
  });

  it('refuses an unknown key instead of writing a bad entry', async () => {
    const { history, record } = makeHistory();
    await expect(history.record(change({ key: 'hr.unknown' }))).rejects.toThrow(
      /No history action/,
    );
    expect(record).not.toHaveBeenCalled();
  });
});
