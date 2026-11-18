import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { Propagation, TransactionHost } from '@nestjs-cls/transactional';
import { AuditEntityType, ErrorCode } from '@school-erp/shared';
import { CodedException } from '../../common/errors/coded.exception';
import { normalizeEmail } from '../../common/utils/password.util';
import type { DbAdapter } from '../../database/transactions';
import { AuditService } from '../audit';
import { SettingsService } from '../settings';
import { LoginAttemptsRepository } from './repositories/login-attempts.repository';
import {
  LIMIT_KEYS,
  STALE_AFTER_MS,
  isLocked,
  justLocked,
  limitsFrom,
  minutesLeft,
} from './sign-in-limit.pure';

export interface FailureOptions {
  /**
   * Who the lockout's audit entry names as the actor: leave out for the request's user (a password
   * change), `null` for nobody (a sign-in — nobody is signed in yet).
   */
  actor?: null;
}

/**
 * Sign-in limits (owner 2026-11-18), per account only — never per IP. `maxAttempts` wrong
 * passwords within `windowMinutes` lock the account's sign-in for `lockMinutes` (core settings,
 * 5 / 15 / 15). Counted per lower-cased email; an email nobody has is counted the same, so the
 * answer never tells whether an account exists. Used by sign-in and by both password-change paths.
 */
@Injectable()
export class SignInLimitService {
  private readonly logger = new Logger(SignInLimitService.name);

  constructor(
    private readonly attempts: LoginAttemptsRepository,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
    private readonly txHost: TransactionHost<DbAdapter>,
  ) {}

  /**
   * Refuses while the email's sign-in is locked — before any password is checked, with one answer
   * for every case: 429 `TOO_MANY_ATTEMPTS` and the minutes left (`params.count`).
   */
  async assertNotLocked(email: string, now: Date = new Date()): Promise<void> {
    const lockedUntil = await this.attempts.findLockedUntil(normalizeEmail(email));
    if (isLocked(lockedUntil, now)) {
      throw CodedException.withParams(HttpStatus.TOO_MANY_REQUESTS, ErrorCode.TOO_MANY_ATTEMPTS, {
        count: minutesLeft(lockedUntil, now),
      });
    }
  }

  /**
   * Counts a wrong password (one atomic upsert). The attempt that reaches the limit locks the
   * account and records `core.auth.locked_out` — in its own transaction, so the entry stays even
   * though the request then fails.
   */
  async recordFailure(
    email: string,
    options: FailureOptions = {},
    now: Date = new Date(),
  ): Promise<void> {
    const key = normalizeEmail(email);
    const limits = limitsFrom(await this.settings.getValues(LIMIT_KEYS));
    const result = await this.attempts.recordFailure(key, now, limits);
    if (!justLocked(result.failedCount, limits)) return;

    const userId = await this.attempts.findUserId(key);
    try {
      await this.txHost.withTransaction(Propagation.RequiresNew, () =>
        this.audit.record({
          action: 'core.auth.locked_out',
          // The account when there is one; else the email typed (like a failed sign-in).
          entity: { type: AuditEntityType.USER, id: userId ?? key, label: key },
          after: { lockedUntil: result.lockedUntil?.toISOString() ?? null },
          ...('actor' in options ? { actor: options.actor } : {}),
        }),
      );
    } catch (e) {
      // The lock holds either way; a missing entry must not turn a 401 into a 500.
      this.logger.error(
        'Could not record a sign-in lockout',
        e instanceof Error ? e.stack : String(e),
      );
    }
  }

  /** A correct password: forget the email's wrong ones (deletes its row). */
  async clear(email: string): Promise<void> {
    await this.attempts.clear(normalizeEmail(email));
  }

  /**
   * Unlocks the email's sign-in early (a System admin, from the Users page): deletes its row.
   * Returns whether it was locked.
   */
  async unlock(email: string, now: Date = new Date()): Promise<boolean> {
    const key = normalizeEmail(email);
    const wasLocked = isLocked(await this.attempts.findLockedUntil(key), now);
    await this.attempts.clear(key);
    return wasLocked;
  }

  /** The emails among `emails` whose sign-in is locked now, with when the lock ends. */
  lockedUntil(emails: readonly string[], now: Date = new Date()): Promise<Map<string, Date>> {
    return this.attempts.findLocked(emails.map(normalizeEmail), now);
  }

  /** The nightly clean-up: deletes rows whose window and lock both ended more than a day ago. */
  async deleteStale(now: Date = new Date()): Promise<number> {
    const { windowMinutes } = limitsFrom(await this.settings.getValues(LIMIT_KEYS));
    return this.attempts.deleteEndedBefore(new Date(now.getTime() - STALE_AFTER_MS), windowMinutes);
  }
}
