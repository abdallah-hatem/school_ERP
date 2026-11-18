import { Module } from '@nestjs/common';
import { AuditModule } from '../audit';
import { SettingsModule } from '../settings';
import { LoginAttemptsCleanupJob } from './login-attempts-cleanup.job';
import { LoginAttemptsRepository } from './repositories/login-attempts.repository';
import { SignInLimitService } from './sign-in-limit.service';

/**
 * core/sign-in-limit — wrong-password counting and the sign-in lock (owner 2026-11-18), used by
 * core/auth (sign-in) and core/users (password changes, the admin's unlock). Owns
 * `login_attempts` and its nightly clean-up job.
 */
@Module({
  imports: [AuditModule, SettingsModule],
  providers: [SignInLimitService, LoginAttemptsRepository, LoginAttemptsCleanupJob],
  exports: [SignInLimitService],
})
export class SignInLimitModule {}
