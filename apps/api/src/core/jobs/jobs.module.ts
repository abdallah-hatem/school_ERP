import { Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { JobRunner } from './job-runner.service';
import { JobScheduler } from './job-scheduler.service';
import { JobRunsRepository } from './repositories/job-runs.repository';

/**
 * core/jobs — scheduled jobs (backups, reminders, reports…). A job is a provider marked
 * `@ScheduledJob({ name, cron })` in its own module; this finds, schedules and runs it. Exports
 * `JobRunner` so a test (or an operator command) can run a job by name.
 */
@Module({
  imports: [DiscoveryModule, ScheduleModule.forRoot()],
  providers: [JobRunner, JobScheduler, JobRunsRepository],
  exports: [JobRunner],
})
export class JobsModule {}
