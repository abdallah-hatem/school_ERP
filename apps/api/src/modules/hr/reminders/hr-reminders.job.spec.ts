import { HR_SETTINGS_DEFAULTS } from '@school-erp/shared';
import type { NotificationsService } from '../../../core/notifications';
import type { AfterCommit } from '../../../database/transactions';
import type { HrSettingsService } from '../settings/hr-settings.service';
import { HrRemindersJob } from './hr-reminders.job';
import { REMINDER_TYPES, type ReminderEmployee } from './reminders.pure';
import type { RemindersRepository } from './repositories/reminders.repository';

/* The daily job's wiring (plan N3): today on the school's clock, one transaction per type, resolves before sends. */

function makeJob(opts: { employees?: ReminderEmployee[]; open?: Record<string, unknown[]>; failOn?: string } = {}) {
  const calls: string[] = [];
  let inTx = false;
  const notifications = {
    openItems: jest.fn((type: string) => {
      if (!inTx) throw new Error('outside a transaction');
      if (type === opts.failOn) return Promise.reject(new Error('db down'));
      return Promise.resolve(opts.open?.[type] ?? []);
    }),
    resolve: jest.fn((input: { dedupeKey: string }) => {
      calls.push(`resolve ${input.dedupeKey}`);
      return Promise.resolve({ resolved: 1 });
    }),
    notify: jest.fn((input: { dedupeKey: string }) => {
      calls.push(`notify ${input.dedupeKey}`);
      return Promise.resolve({ created: 1 });
    }),
  };
  const repository = {
    activeEmployees: jest.fn().mockResolvedValue(opts.employees ?? []),
    months: jest.fn((months: string[]) =>
      Promise.resolve(new Map(months.map((m) => [m, { latenessSaved: false, run: null }]))),
    ),
  };
  const transactions: string[] = [];
  const afterCommit = {
    inTransaction: jest.fn(async (fn: () => Promise<unknown>) => {
      transactions.push('tx');
      inTx = true;
      try {
        return await fn();
      } finally {
        inTx = false;
      }
    }),
  };
  const settings = { reminders: jest.fn().mockResolvedValue(HR_SETTINGS_DEFAULTS.reminders) };
  const job = new HrRemindersJob(
    notifications as unknown as NotificationsService,
    repository as unknown as RemindersRepository,
    settings as unknown as HrSettingsService,
    afterCommit as unknown as AfterCommit,
  );
  return { job, notifications, repository, transactions, calls };
}

describe('HrRemindersJob', () => {
  it('one transaction per reminder type, in turn', async () => {
    const { job, transactions, notifications } = makeJob();
    await job.run();
    expect(transactions).toHaveLength(REMINDER_TYPES.length);
    expect(notifications.openItems.mock.calls.map(([t]) => t)).toEqual([...REMINDER_TYPES]);
  });

  it('edge 5 — "today" is the school’s day: 22:30 UTC on 30 Nov is 1 Dec in Cairo', async () => {
    const { job, repository } = makeJob();
    jest.spyOn(job, 'now').mockReturnValue(new Date('2026-11-30T22:30:00Z'));
    await job.run();
    expect(repository.months).toHaveBeenCalledWith(['2026-12']);
  });

  it('resolves what no longer holds before sending what is due (the 30-day item, then the 7-day one)', async () => {
    const { job, calls, notifications } = makeJob({
      employees: [{ id: 'a', nameEn: 'A', nameAr: 'أ', contractEnd: '2027-05-31', probationEnd: null }],
      open: {
        'hr.contract.ending_soon': [
          { entityType: 'employee', entityId: 'a', dedupeKey: 'contract_end:a:2027-05-31:30' },
        ],
      },
    });
    jest.spyOn(job, 'now').mockReturnValue(new Date('2027-05-24T05:00:00Z'));
    await job.run();
    expect(calls).toEqual(['resolve contract_end:a:2027-05-31:30', 'notify contract_end:a:2027-05-31:7']);
    expect(notifications.resolve).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'hr.contract.ending_soon', resolution: 'done', byUserId: null }),
    );
    expect(notifications.notify).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: null, groupKey: '2027-05-24:7' }),
    );
  });

  it('edge 18 — a failing type fails the run (recorded failed) but the other types still run', async () => {
    const { job, transactions } = makeJob({ failOn: 'hr.probation.ending_soon' });
    await expect(job.run()).rejects.toThrow(/hr\.probation\.ending_soon/);
    expect(transactions).toHaveLength(REMINDER_TYPES.length);
  });
});
