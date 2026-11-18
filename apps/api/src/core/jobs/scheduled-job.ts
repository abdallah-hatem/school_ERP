import { DiscoveryService } from '@nestjs/core';

/** A scheduled job's name and clock (docs/ARCHITECTURE.md → Scheduled jobs). */
export interface JobDefinition {
  /** Unique, `<area>.<what>` (e.g. `login-attempts.cleanup`). Also the advisory lock's key. */
  name: string;
  /** A cron expression read on the school's clock (`SCHOOL_TIME_ZONE`), e.g. `0 3 * * *` = 03:00. */
  cron: string;
  /**
   * Default true: each run holds the job's advisory lock, so two containers never run it at once.
   * False for a job that is safe to run concurrently on its own (e.g. it claims rows with
   * `FOR UPDATE SKIP LOCKED`): the lock's transaction would hold a pooled connection for the whole
   * run while the job's own work needs another.
   */
  lock?: boolean;
}

/**
 * What a job does. Throwing marks the run `failed`; it never reaches the API. Returning `'idle'`
 * says it found nothing to do: the run is not recorded in `job_runs` (a frequent poll).
 */
export interface JobHandler {
  run(): Promise<void | 'idle'>;
}

/**
 * Marks a provider as a scheduled job: `@ScheduledJob({ name, cron })` on a class that implements
 * `JobHandler`, listed in its module's providers. `JobRunner` finds it at boot.
 */
export const ScheduledJob = DiscoveryService.createDecorator<JobDefinition>();

export const JOB_RUN_STATUSES = ['success', 'failed'] as const;
export type JobRunStatus = (typeof JOB_RUN_STATUSES)[number];

/**
 * What `JobRunner.run` did: ran it (and how it ended), skipped it — another API held the lock — or
 * ran it and it had nothing to do (`idle`, not recorded).
 */
export type JobRunOutcome = JobRunStatus | 'skipped' | 'idle';
