import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { SCHOOL_TIME_ZONE } from '@school-erp/shared';
import { CronJob } from 'cron';
import type { AppConfig } from '../../config';
import { JobRunner } from './job-runner.service';

/**
 * Puts every registered job on its clock — the school's time zone — through `@nestjs/schedule`'s
 * registry (which stops them on shutdown). Off when `jobs.enabled` is false (always under
 * NODE_ENV=test): tests run a job only by calling `JobRunner.run(name)`.
 */
@Injectable()
export class JobScheduler implements OnApplicationBootstrap {
  private readonly logger = new Logger(JobScheduler.name);

  constructor(
    private readonly runner: JobRunner,
    private readonly registry: SchedulerRegistry,
    private readonly config: ConfigService,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.config.getOrThrow<AppConfig['jobs']>('jobs').enabled) return;
    for (const { definition } of this.runner.list()) {
      const job = CronJob.from({
        cronTime: definition.cron,
        timeZone: SCHOOL_TIME_ZONE,
        name: definition.name,
        // A slow run is never overlapped by the next tick in this container (the lock covers others).
        waitForCompletion: true,
        onTick: async () => {
          await this.runner.run(definition.name);
        },
        start: true,
      });
      this.registry.addCronJob(definition.name, job);
      this.logger.log(
        `Job "${definition.name}" scheduled: ${definition.cron} (${SCHOOL_TIME_ZONE})`,
      );
    }
  }
}
