import { SettingsEvent } from '@school-erp/shared';
import type { AuditService } from '../audit';
import type { DomainEvents } from '../events';
import { SettingsHistory, type ListHistoryChange } from './settings-history';

function makeHistory(record: jest.Mock = jest.fn(() => Promise.resolve())) {
  // DomainEvents holds the event until the commit itself (its own spec).
  const events = { publish: jest.fn(() => Promise.resolve()) };
  const history = new SettingsHistory(
    { record } as unknown as AuditService,
    events as unknown as DomainEvents,
  );
  return { history, record, events };
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
    ['lists', 'hr.employee_grades', 'hr.employee_grade.update', 'employee_grade'],
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

  it('core.settings.changed is published (fire-and-forget), only for a real change', async () => {
    const { history, events } = makeHistory();
    await history.record(change());
    expect(events.publish).toHaveBeenCalledWith(
      SettingsEvent.CHANGED,
      expect.objectContaining({
        key: 'hr.departments',
        newValue: dept,
        changedAt: expect.any(String),
      }),
    );

    events.publish.mockClear();
    await history.record(change({ oldValue: dept, newValue: { ...dept } }));
    expect(events.publish).not.toHaveBeenCalled();
  });

  it('a failing audit write is thrown back, so the caller’s transaction rolls back', async () => {
    const { history, events } = makeHistory(
      jest.fn(() => Promise.reject(new Error('db down'))),
    );
    await expect(history.record(change())).rejects.toThrow('db down');
    expect(events.publish).not.toHaveBeenCalled();
  });

  it('refuses an unknown key instead of writing a bad entry', async () => {
    const { history, record } = makeHistory();
    await expect(history.record(change({ key: 'hr.unknown' }))).rejects.toThrow(
      /No history action/,
    );
    expect(record).not.toHaveBeenCalled();
  });
});
