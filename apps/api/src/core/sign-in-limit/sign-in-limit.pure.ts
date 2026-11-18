import { SecuritySettingKey, type SettingValueMap } from '@school-erp/shared';
import type { FailureLimits } from './repositories/login-attempts.repository';

/** The sign-in limit settings, read together. */
export const LIMIT_KEYS = [
  SecuritySettingKey.LOGIN_MAX_ATTEMPTS,
  SecuritySettingKey.LOGIN_WINDOW_MINUTES,
  SecuritySettingKey.LOGIN_LOCK_MINUTES,
] as const;

type LimitValues = Pick<SettingValueMap, (typeof LIMIT_KEYS)[number]>;

/**
 * The limits from the settings, each at least 1 (a stored 0 would lock on every attempt or never
 * end a window).
 */
export function limitsFrom(values: LimitValues): FailureLimits {
  const atLeastOne = (n: number) => (Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1);
  return {
    maxAttempts: atLeastOne(values[SecuritySettingKey.LOGIN_MAX_ATTEMPTS]),
    windowMinutes: atLeastOne(values[SecuritySettingKey.LOGIN_WINDOW_MINUTES]),
    lockMinutes: atLeastOne(values[SecuritySettingKey.LOGIN_LOCK_MINUTES]),
  };
}

/** Whether a lock ending at `lockedUntil` still holds at `now`. */
export function isLocked(lockedUntil: Date | null, now: Date): lockedUntil is Date {
  return lockedUntil !== null && lockedUntil.getTime() > now.getTime();
}

/** Whole minutes left on a lock, rounded up and never below 1 ("Try again in N minutes"). */
export function minutesLeft(lockedUntil: Date, now: Date): number {
  return Math.max(1, Math.ceil((lockedUntil.getTime() - now.getTime()) / 60_000));
}

/** Whether a wrong password just locked the account: the attempt that reached the limit. */
export function justLocked(failedCount: number, limits: FailureLimits): boolean {
  return failedCount === limits.maxAttempts;
}

/** Rows older than this are deleted by the nightly clean-up (their window and lock ended). */
export const STALE_AFTER_MS = 24 * 60 * 60 * 1000;
