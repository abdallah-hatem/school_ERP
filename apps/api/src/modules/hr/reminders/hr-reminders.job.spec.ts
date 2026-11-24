import { HR_SETTINGS_DEFAULTS } from '@school-erp/shared';
import type { NotificationsService } from '../../../core/notifications';
import type { AfterCommit } from '../../../database/transactions';
import type { ContractRecords } from '../contracts/services/contract-records.service';
import type { HrSettingsService } from '../settings/hr-settings.service';
import { HrRemindersJob } from './hr-reminders.job';
import { REMINDER_TYPES, type ReminderEmployee } from './reminders.pure';
import type { RemindersRepository } from './repositories/reminders.repository';

/* The daily job's wiring (plan N3): today on the school's clock, one transaction per type, resolves before sends. */

function makeJob(
  opts: { employees?: ReminderEmployee[]; open?: Record<string, unknown[]>; failOn?: string; syncFails?: boolean } = {},
) {
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
    season: jest.fn((year: number) => Promise.resolve({ year, undecided: 0, calendar: null })),
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
  const contracts = {
    syncAllCurrentDates: jest.fn((today: string) => {
      if (!inTx) throw new Error('outside a transaction');
      calls.push(`sync ${today}`);
      return opts.syncFails ? Promise.reject(new Error('db down')) : Promise.resolve(0);
    }),
  };
  const job = new HrRemindersJob(
    notifications as unknown as NotificationsService,
    repository as unknown as RemindersRepository,
    settings as unknown as HrSettingsService,
    afterCommit as unknown as AfterCommit,
    contracts as unknown as ContractRecords,
  );
  return { job, notifications, repository, transactions, calls, contracts };
}

describe('HrRemindersJob', () => {
  it('one transaction for the contract dates, then one per reminder type, in turn', async () => {
    const { job, transactions, notifications } = makeJob();
    await job.run();
    expect(transactions).toHaveLength(REMINDER_TYPES.length + 1);
    expect(notifications.openItems.mock.calls.map(([t]) => t)).toEqual([...REMINDER_TYPES]);
  });

  it('bug 2026-11-24 — first moves the records’ contract dates to the contract in force on the school’s day, then reminds', async () => {
    const { job, calls, contracts, repository } = makeJob();
    jest.spyOn(job, 'now').mockReturnValue(new Date('2027-05-31T22:30:00Z'));
    await job.run();
    expect(contracts.syncAllCurrentDates).toHaveBeenCalledWith('2027-06-01');
    expect(calls[0]).toBe('sync 2027-06-01');
    expect(repository.activeEmployees).toHaveBeenCalledWith('2027-06-01');
  });

  it('a failing contract-dates step fails the run, but the reminders still run', async () => {
    const { job, notifications } = makeJob({ syncFails: true });
    await expect(job.run()).rejects.toThrow(/contract dates/);
    expect(notifications.openItems).toHaveBeenCalledTimes(REMINDER_TYPES.length);
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
    expect(calls).toEqual(['sync 2027-05-24', 'resolve contract_end:a:2027-05-31:30', 'notify contract_end:a:2027-05-31:7']);
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
    expect(transactions).toHaveLength(REMINDER_TYPES.length + 1);
  });
});
