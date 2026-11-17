import { Propagation, type TransactionHost } from '@nestjs-cls/transactional';
import type { SettingsChangedEvent } from '@school-erp/shared';
import type { DbAdapter } from '../../database/transactions';
import type { AuditService } from '../audit';
import { SettingsHistoryListener } from './settings-history.listener';

function makeListener(record: jest.Mock = jest.fn(() => Promise.resolve())) {
  const txHost = {
    withTransaction: jest.fn((_p: Propagation, fn: () => Promise<unknown>) => fn()),
  };
  const listener = new SettingsHistoryListener(
    { record } as unknown as AuditService,
    txHost as unknown as TransactionHost<DbAdapter>,
  );
  return { listener, record, txHost };
}

const dept = { id: 'd1', nameEn: 'Science', nameAr: 'العلوم', sortOrder: 1, isActive: true };

const event = (over: Partial<SettingsChangedEvent> = {}): SettingsChangedEvent => ({
  scope: 'lists',
  key: 'hr.departments',
  oldValue: null,
  newValue: dept,
  changedById: 'user-1',
  changedAt: '2026-11-17T10:00:00.000Z',
  ...over,
});

describe('SettingsHistoryListener (list and catalogue edits, until T28)', () => {
  it('records a list create as hr.department.create in its own transaction, keyed like the old history row', async () => {
    const { listener, record, txHost } = makeListener();
    await listener.record(event());
    expect(txHost.withTransaction).toHaveBeenCalledWith(
      Propagation.RequiresNew,
      expect.any(Function),
    );
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
    const { listener, record } = makeListener();
    await listener.record(
      event({ scope, key, oldValue: dept, newValue: { ...dept, nameEn: 'X' } }),
    );
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({ action, entity: { type, id: 'd1', label: { en: 'X', ar: 'العلوم' } } }),
    );
  });

  it('a stage edit takes its id from the key', async () => {
    const { listener, record } = makeListener();
    await listener.record(
      event({
        key: 'lists.stages.s9',
        oldValue: { ...dept, id: 's9' },
        newValue: { ...dept, id: 's9' },
      }),
    );
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'core.stage.update',
        entity: { type: 'stage', id: 's9', label: { en: 'Science', ar: 'العلوم' } },
      }),
    );
  });

  it('no actor on the event → recorded with no actor', async () => {
    const { listener, record } = makeListener();
    await listener.record(event({ changedById: null }));
    expect(record).toHaveBeenCalledWith(expect.objectContaining({ actor: null }));
  });

  it('school and HR settings are ignored: SettingsService records them in their own transaction', async () => {
    const { listener, record } = makeListener();
    await listener.record(event({ scope: 'school', key: 'school.workStart' }));
    await listener.record(event({ scope: 'hr', key: 'hr.payroll.dayDivisor' }));
    expect(record).not.toHaveBeenCalled();
  });

  it('ignores an unknown scope or key instead of writing a bad entry', async () => {
    const { listener, record } = makeListener();
    jest.spyOn(listener['logger'], 'warn').mockImplementation(() => undefined);
    await listener.record(event({ scope: 'payroll' as never }));
    await listener.record(event({ key: 'hr.unknown' }));
    expect(record).not.toHaveBeenCalled();
  });

  it('never throws back at the emitter when the write fails', async () => {
    const { listener } = makeListener(jest.fn(() => Promise.reject(new Error('db down'))));
    jest.spyOn(listener['logger'], 'error').mockImplementation(() => undefined);
    await expect(listener.record(event())).resolves.toBeUndefined();
  });
});
