import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../database/database.service';
import type { JobRunStatus } from '../scheduled-job';

export interface NewJobRun {
  jobName: string;
  startedAt: Date;
  finishedAt: Date;
  status: JobRunStatus;
  error: string | null;
}

/**
 * The longest a job may hold its lock. The lock lives in a transaction (so it can never outlive a
 * crash or stay behind on a pooled connection); Prisma ends a transaction after its timeout.
 */
export const JOB_LOCK_TIMEOUT_MS = 60 * 60 * 1000;

/**
 * `job_runs` and the per-job advisory lock (core/jobs). Jobs run outside any request, so this uses
 * the plain client: a run's record never joins (or rolls back with) anything else.
 */
@Injectable()
export class JobRunsRepository {
  constructor(private readonly db: DatabaseService) {}

  /**
   * Runs `fn` while holding the job's Postgres advisory lock, or returns `{ taken: false }` at once
   * when another API container holds it. The lock is `pg_try_advisory_xact_lock` keyed by the job
   * name: the transaction-scoped form, released when the transaction ends — also when the process
   * dies — and never left on a pooled connection. `fn` must not throw (the runner catches).
   */
  async withLock<T>(
    jobName: string,
    fn: () => Promise<T>,
  ): Promise<{ taken: false } | { taken: true; value: T }> {
    return this.db.$transaction(
      async (tx) => {
        const [row] = await tx.$queryRaw<{ locked: boolean }[]>`
          SELECT pg_try_advisory_xact_lock(hashtextextended(${`job:${jobName}`}, 0)) AS "locked"`;
        if (!row?.locked) return { taken: false as const };
        return { taken: true as const, value: await fn() };
      },
      { timeout: JOB_LOCK_TIMEOUT_MS, maxWait: 10_000 },
    );
  }

  async record(run: NewJobRun): Promise<void> {
    await this.db.jobRun.create({ data: run, select: { id: true } });
  }
}
