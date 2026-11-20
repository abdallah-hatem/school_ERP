import type { ConfigService } from '@nestjs/config';
import type { DiscoveryService } from '@nestjs/core';
import type { SchedulerRegistry } from '@nestjs/schedule';
import { JOB_ERROR_MAX_LENGTH, JobRunner, jobErrorText } from './job-runner.service';
import { JobScheduler } from './job-scheduler.service';
import type { JobRunsRepository, NewJobRun } from './repositories/job-runs.repository';

const START = new Date('2026-11-18T01:00:00Z');
const END = new Date('2026-11-18T01:00:02Z');

function makeRunner(opts: { lockTaken?: boolean; lockFails?: boolean } = {}) {
  const recorded: NewJobRun[] = [];
  const runs = {
    withLock: jest.fn(async (_name: string, fn: () => Promise<unknown>) => {
      if (opts.lockFails) throw new Error('connection refused');
      if (opts.lockTaken === false) return { taken: false };
      return { taken: true, value: await fn() };
    }),
    record: jest.fn((run: NewJobRun) => {
      recorded.push(run);
      return Promise.resolve();
    }),
  };
  const runner = new JobRunner({} as DiscoveryService, runs as unknown as JobRunsRepository);
  const clock = jest.fn().mockReturnValueOnce(START).mockReturnValue(END);
  return { runner, runs, recorded, clock };
}

describe('JobRunner', () => {
  it('runs the job under its lock and records a success', async () => {
    const { runner, runs, recorded, clock } = makeRunner();
    const run = jest.fn(() => Promise.resolve());
    runner.register({ name: 'demo.job', cron: '0 3 * * *' }, { run });

    await expect(runner.run('demo.job', clock)).resolves.toBe('success');
    expect(runs.withLock).toHaveBeenCalledWith('demo.job', expect.any(Function));
    expect(run).toHaveBeenCalledTimes(1);
    expect(recorded).toEqual([
      { jobName: 'demo.job', startedAt: START, finishedAt: END, status: 'success', error: null },
    ]);
  });

  it('another container holds the lock → skipped: the job does not run and nothing is recorded', async () => {
    const { runner, recorded, clock } = makeRunner({ lockTaken: false });
    const run = jest.fn(() => Promise.resolve());
    runner.register({ name: 'demo.job', cron: '0 3 * * *' }, { run });

    await expect(runner.run('demo.job', clock)).resolves.toBe('skipped');
    expect(run).not.toHaveBeenCalled();
    expect(recorded).toEqual([]);
  });

  it("lock: false — runs without the advisory lock's transaction (no connection held for the run)", async () => {
    const { runner, runs, recorded, clock } = makeRunner();
    const run = jest.fn(() => Promise.resolve());
    runner.register({ name: 'demo.poll', cron: '*/30 * * * * *', lock: false }, { run });

    await expect(runner.run('demo.poll', clock)).resolves.toBe('success');
    expect(runs.withLock).not.toHaveBeenCalled();
    expect(run).toHaveBeenCalledTimes(1);
    expect(recorded).toHaveLength(1);
  });

  it("a job that returns 'idle' had nothing to do: not recorded in job_runs", async () => {
    const { runner, recorded } = makeRunner();
    runner.register(
      { name: 'demo.poll', cron: '*/30 * * * * *', lock: false },
      { run: () => Promise.resolve('idle' as const) },
    );
    runner.register({ name: 'demo.locked', cron: '* * * * *' }, { run: () => Promise.resolve('idle' as const) });
    await expect(runner.run('demo.poll')).resolves.toBe('idle');
    await expect(runner.run('demo.locked')).resolves.toBe('idle');
    expect(recorded).toEqual([]);
  });

  it('a failing job is recorded as failed with its error, and never throws', async () => {
    const { runner, recorded, clock } = makeRunner();
    runner.register(
      { name: 'demo.job', cron: '0 3 * * *' },
      { run: () => Promise.reject(new Error('disk full')) },
    );

    await expect(runner.run('demo.job', clock)).resolves.toBe('failed');
    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({ status: 'failed', startedAt: START, finishedAt: END });
    expect(recorded[0]?.error).toContain('disk full');
  });

  it('the lock itself failing (database down) is a failed run, not a crash', async () => {
    const { runner, recorded } = makeRunner({ lockFails: true });
    const run = jest.fn(() => Promise.resolve());
    runner.register({ name: 'demo.job', cron: '0 3 * * *' }, { run });

    await expect(runner.run('demo.job')).resolves.toBe('failed');
    expect(run).not.toHaveBeenCalled();
    expect(recorded[0]?.error).toContain('connection refused');
  });

  it('a run that cannot be recorded is logged, not thrown', async () => {
    const { runner, runs } = makeRunner();
    runs.record.mockRejectedValueOnce(new Error('db gone'));
    runner.register({ name: 'demo.job', cron: '0 3 * * *' }, { run: () => Promise.resolve() });
    await expect(runner.run('demo.job')).resolves.toBe('success');
  });

  it('an unknown name and two jobs with one name are programming errors', async () => {
    const { runner } = makeRunner();
    await expect(runner.run('nope')).rejects.toThrow(/No scheduled job named "nope"/);
    runner.register({ name: 'demo.job', cron: '* * * * *' }, { run: () => Promise.resolve() });
    expect(() =>
      runner.register({ name: 'demo.job', cron: '* * * * *' }, { run: () => Promise.resolve() }),
    ).toThrow(/Two scheduled jobs/);
  });

  it('error text keeps the stack, cut to a sane length', () => {
    expect(jobErrorText('plain')).toBe('plain');
    expect(jobErrorText(new Error('boom'))).toContain('boom');
    expect(jobErrorText(new Error('x'.repeat(10_000)))).toHaveLength(JOB_ERROR_MAX_LENGTH);
  });
});

describe('JobScheduler', () => {
  function makeScheduler(enabled: boolean) {
    const { runner } = makeRunner();
    runner.register({ name: 'demo.job', cron: '0 3 * * *' }, { run: () => Promise.resolve() });
    const added: string[] = [];
    const jobs: { stop: () => unknown }[] = [];
    const registry = {
      addCronJob: jest.fn((name: string, job: { stop: () => unknown }) => {
        added.push(name);
        jobs.push(job);
      }),
    };
    const config = { getOrThrow: () => ({ enabled }) } as unknown as ConfigService;
    const scheduler = new JobScheduler(runner, registry as unknown as SchedulerRegistry, config);
    return { scheduler, added, jobs };
  }

  it('off (tests): nothing is put on a clock', () => {
    const { scheduler, added } = makeScheduler(false);
    scheduler.onApplicationBootstrap();
    expect(added).toEqual([]);
  });

  it('on: every job is scheduled by name in the school time zone', () => {
    const { scheduler, added, jobs } = makeScheduler(true);
    scheduler.onApplicationBootstrap();
    expect(added).toEqual(['demo.job']);
    const job = jobs[0] as unknown as { cronTime: { timeZone?: string } };
    expect(job.cronTime.timeZone).toBe('Africa/Cairo');
    for (const j of jobs) void j.stop();
  });
});
