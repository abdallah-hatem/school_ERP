import { Injectable, Logger } from '@nestjs/common';
import { ScheduledJob, type JobHandler } from '../jobs';
import { SignInLimitService } from './sign-in-limit.service';

export const LOGIN_ATTEMPTS_CLEANUP_JOB = 'login-attempts.cleanup';

/**
 * Nightly at 03:00 school time: deletes `login_attempts` rows whose window and lock both ended
 * more than a day ago. Sign-in itself never deletes stale rows (only a correct password clears one).
 */
@ScheduledJob({ name: LOGIN_ATTEMPTS_CLEANUP_JOB, cron: '0 3 * * *' })
@Injectable()
export class LoginAttemptsCleanupJob implements JobHandler {
  private readonly logger = new Logger(LoginAttemptsCleanupJob.name);

  constructor(private readonly limits: SignInLimitService) {}

  async run(): Promise<void> {
    const deleted = await this.limits.deleteStale();
    this.logger.log(`Deleted ${deleted} stale login attempt row(s)`);
  }
}
