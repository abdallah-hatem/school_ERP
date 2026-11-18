import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { DiscoveryService } from '@nestjs/core';
import { JobRunsRepository } from './repositories/job-runs.repository';
import {
  ScheduledJob,
  type JobDefinition,
  type JobHandler,
  type JobRunOutcome,
  type JobRunStatus,
} from './scheduled-job';

/** Longest error text kept on a failed run. */
export const JOB_ERROR_MAX_LENGTH = 4000;

export interface RegisteredJob {
  definition: JobDefinition;
  handler: JobHandler;
}

/** The text stored for a failed run: the stack when there is one, cut to a sane length. */
export function jobErrorText(e: unknown): string {
  const text = e instanceof Error ? (e.stack ?? `${e.name}: ${e.message}`) : String(e);
  return text.length > JOB_ERROR_MAX_LENGTH ? text.slice(0, JOB_ERROR_MAX_LENGTH) : text;
}

/**
 * Runs scheduled jobs (core/jobs): finds every `@ScheduledJob` provider at boot, and runs one by
 * name — on its clock (`JobScheduler`) or when a test or an operator asks (`run(name)`).
 *
 * A run takes the job's advisory lock first, so two API containers never run it at once (the
 * second is `skipped`). It ends `success` or `failed` and is recorded in `job_runs`; a failing job
 * is logged and recorded and never throws into the API.
 */
@Injectable()
export class JobRunner implements OnModuleInit {
  private readonly logger = new Logger(JobRunner.name);
  private readonly jobs = new Map<string, RegisteredJob>();

  constructor(
    private readonly discovery: DiscoveryService,
    private readonly runs: JobRunsRepository,
  ) {}

  onModuleInit(): void {
    for (const wrapper of this.discovery.getProviders({ metadataKey: ScheduledJob.KEY })) {
      const definition = this.discovery.getMetadataByDecorator(ScheduledJob, wrapper);
      const handler = wrapper.instance as JobHandler | undefined;
      if (!definition || !handler) continue;
      this.register(definition, handler);
    }
  }

  /** Adds a job. Two jobs with one name would share a lock and a history: refused at boot. */
  register(definition: JobDefinition, handler: JobHandler): void {
    if (this.jobs.has(definition.name)) {
      throw new Error(`Two scheduled jobs are named "${definition.name}"`);
    }
    if (typeof handler.run !== 'function') {
      throw new Error(`Scheduled job "${definition.name}" has no run() method`);
    }
    this.jobs.set(definition.name, { definition, handler });
  }

  /** Every registered job, in registration order. */
  list(): RegisteredJob[] {
    return [...this.jobs.values()];
  }

  /**
   * Runs the job named `name` now, under its lock. Never throws for the job's own failure (an
   * unknown name is a programming error and does throw).
   */
  async run(name: string, now: () => Date = () => new Date()): Promise<JobRunOutcome> {
    const job = this.jobs.get(name);
    if (!job) throw new Error(`No scheduled job named "${name}"`);

    const startedAt = now();
    // The job's error text, or null when it succeeded.
    let error: string | null;
    try {
      const lock = await this.runs.withLock(name, async () => {
        try {
          await job.handler.run();
          return null;
        } catch (e) {
          return jobErrorText(e);
        }
      });
      if (!lock.taken) {
        this.logger.log(`Job "${name}" skipped: another instance is running it`);
        return 'skipped';
      }
      error = lock.value;
    } catch (e) {
      // The lock itself failed (database down, transaction timeout): the run failed too.
      error = jobErrorText(e);
    }

    const status: JobRunStatus = error === null ? 'success' : 'failed';
    if (error !== null) this.logger.error(`Job "${name}" failed`, error);
    try {
      await this.runs.record({ jobName: name, startedAt, finishedAt: now(), status, error });
    } catch (e) {
      this.logger.error(`Job "${name}": could not record the run`, jobErrorText(e));
    }
    return status;
  }
}
