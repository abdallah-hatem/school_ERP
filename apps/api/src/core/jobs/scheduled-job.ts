import { DiscoveryService } from '@nestjs/core';

/** A scheduled job's name and clock (docs/ARCHITECTURE.md → Scheduled jobs). */
export interface JobDefinition {
  /** Unique, `<area>.<what>` (e.g. `login-attempts.cleanup`). Also the advisory lock's key. */
  name: string;
  /** A cron expression read on the school's clock (`SCHOOL_TIME_ZONE`), e.g. `0 3 * * *` = 03:00. */
  cron: string;
}

/** What a job does. Throwing marks the run `failed`; it never reaches the API. */
export interface JobHandler {
  run(): Promise<void>;
}

/**
 * Marks a provider as a scheduled job: `@ScheduledJob({ name, cron })` on a class that implements
 * `JobHandler`, listed in its module's providers. `JobRunner` finds it at boot.
 */
export const ScheduledJob = DiscoveryService.createDecorator<JobDefinition>();

export const JOB_RUN_STATUSES = ['success', 'failed'] as const;
export type JobRunStatus = (typeof JOB_RUN_STATUSES)[number];

/** What `JobRunner.run` did: ran it (and how it ended), or skipped it — another API held the lock. */
export type JobRunOutcome = JobRunStatus | 'skipped';
