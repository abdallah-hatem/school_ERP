import type { TransactionHost } from '@nestjs-cls/transactional';
import { HttpStatus } from '@nestjs/common';
import { ErrorCode, SETTING_DEFAULTS } from '@school-erp/shared';
import { CodedException } from '../../common/errors/coded.exception';
import type { DbAdapter } from '../../database/transactions';
import type { AuditService } from '../audit';
import type { SettingsService } from '../settings';
import type { LoginAttemptsRepository } from './repositories/login-attempts.repository';
import { SignInLimitService } from './sign-in-limit.service';
import { isLocked, justLocked, limitsFrom, minutesLeft } from './sign-in-limit.pure';

const NOW = new Date('2026-11-18T10:00:00Z');
const at = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000);

const DEFAULTS = {
  'security.login.maxAttempts': SETTING_DEFAULTS['security.login.maxAttempts'],
  'security.login.windowMinutes': SETTING_DEFAULTS['security.login.windowMinutes'],
  'security.login.lockMinutes': SETTING_DEFAULTS['security.login.lockMinutes'],
};

function makeService(
  opts: { lockedUntil?: Date | null; failedCount?: number; userId?: string | null } = {},
) {
  const attempts = {
    findLockedUntil: jest.fn(() => Promise.resolve(opts.lockedUntil ?? null)),
    findLocked: jest.fn(() => Promise.resolve(new Map())),
    recordFailure: jest.fn(() =>
      Promise.resolve({ failedCount: opts.failedCount ?? 1, lockedUntil: at(15) }),
    ),
    clear: jest.fn(() => Promise.resolve(1)),
    deleteEndedBefore: jest.fn(() => Promise.resolve(3)),
    findUserId: jest.fn(() => Promise.resolve(opts.userId === undefined ? 'u-1' : opts.userId)),
  };
  const settings = { getValues: jest.fn(() => Promise.resolve(DEFAULTS)) };
  const audit = { record: jest.fn(() => Promise.resolve()) };
  const txHost = { withTransaction: jest.fn((_p: unknown, fn: () => Promise<unknown>) => fn()) };
  const service = new SignInLimitService(
    attempts as unknown as LoginAttemptsRepository,
    settings as unknown as SettingsService,
    audit as unknown as AuditService,
    txHost as unknown as TransactionHost<DbAdapter>,
  );
  return { service, attempts, audit, txHost };
}

describe('sign-in limit rules (pure)', () => {
  it('the defaults are the approved ones: 5 attempts, 15-minute window, 15-minute lock', () => {
    expect(limitsFrom(DEFAULTS)).toEqual({ maxAttempts: 5, windowMinutes: 15, lockMinutes: 15 });
  });

  it('a stored 0, negative or broken number is read as 1 (never "always locked" or "never ends")', () => {
    expect(
      limitsFrom({
        'security.login.maxAttempts': 0,
        'security.login.windowMinutes': -3,
        'security.login.lockMinutes': Number.NaN,
      }),
    ).toEqual({ maxAttempts: 1, windowMinutes: 1, lockMinutes: 1 });
  });

  it('locked only while the lock ends in the future', () => {
    expect(isLocked(null, NOW)).toBe(false);
    expect(isLocked(at(-1), NOW)).toBe(false);
    expect(isLocked(NOW, NOW)).toBe(false);
    expect(isLocked(at(1), NOW)).toBe(true);
  });

  it('minutes left are rounded up, never below 1', () => {
    expect(minutesLeft(at(15), NOW)).toBe(15);
    expect(minutesLeft(at(14.01), NOW)).toBe(15);
    expect(minutesLeft(new Date(NOW.getTime() + 1000), NOW)).toBe(1);
    expect(minutesLeft(NOW, NOW)).toBe(1);
  });

  it('only the attempt that reaches the limit locks (one lockout per window)', () => {
    const limits = limitsFrom(DEFAULTS);
    expect([1, 2, 3, 4, 5, 6].map((n) => justLocked(n, limits))).toEqual([
      false,
      false,
      false,
      false,
      true,
      false,
    ]);
  });
});

describe('SignInLimitService', () => {
  it('a locked email → 429 TOO_MANY_ATTEMPTS with the minutes left, matched case-insensitively', async () => {
    const { service, attempts } = makeService({ lockedUntil: at(12.5) });
    const error = await service
      .assertNotLocked('  Mona@School.TEST ', NOW)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(CodedException);
    expect(error).toMatchObject({
      code: ErrorCode.TOO_MANY_ATTEMPTS,
      params: { count: 13 },
    });
    expect((error as CodedException).getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
    expect(attempts.findLockedUntil).toHaveBeenCalledWith('mona@school.test');
  });

  it('an ended lock or no row → passes', async () => {
    await expect(
      makeService({ lockedUntil: at(-1) }).service.assertNotLocked('a@b.c', NOW),
    ).resolves.toBeUndefined();
    await expect(makeService().service.assertNotLocked('a@b.c', NOW)).resolves.toBeUndefined();
  });

  it('a wrong password below the limit is counted with the settings, nothing recorded', async () => {
    const { service, attempts, audit } = makeService({ failedCount: 4 });
    await service.recordFailure('Mona@School.test', {}, NOW);
    expect(attempts.recordFailure).toHaveBeenCalledWith('mona@school.test', NOW, {
      maxAttempts: 5,
      windowMinutes: 15,
      lockMinutes: 15,
    });
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('the attempt that locks records core.auth.locked_out in its own transaction', async () => {
    const { service, audit, txHost } = makeService({ failedCount: 5 });
    await service.recordFailure('mona@school.test', { actor: null }, NOW);
    expect(txHost.withTransaction).toHaveBeenCalledTimes(1);
    expect(audit.record).toHaveBeenCalledWith({
      action: 'core.auth.locked_out',
      entity: { type: 'user', id: 'u-1', label: 'mona@school.test' },
      after: { lockedUntil: at(15).toISOString() },
      actor: null,
    });
  });

  it('an unknown email locks the same way; its entry is keyed by the email typed', async () => {
    const { service, audit } = makeService({ failedCount: 5, userId: null });
    await service.recordFailure('nobody@school.test', { actor: null }, NOW);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        entity: { type: 'user', id: 'nobody@school.test', label: 'nobody@school.test' },
      }),
    );
  });

  it('a failing audit write never turns the answer into a 500 (the lock holds)', async () => {
    const { service, audit } = makeService({ failedCount: 5 });
    audit.record.mockRejectedValueOnce(new Error('db down'));
    await expect(service.recordFailure('mona@school.test', {}, NOW)).resolves.toBeUndefined();
  });

  it('a password change names the signed-in user as the actor (no actor option passed)', async () => {
    const { service, audit } = makeService({ failedCount: 5 });
    await service.recordFailure('mona@school.test', {}, NOW);
    expect(audit.record.mock.calls[0]).toEqual([expect.not.objectContaining({ actor: null })]);
  });

  it('unlock deletes the row and says whether it was locked', async () => {
    const locked = makeService({ lockedUntil: at(3) });
    await expect(locked.service.unlock('Mona@school.test', NOW)).resolves.toBe(true);
    expect(locked.attempts.clear).toHaveBeenCalledWith('mona@school.test');
    await expect(makeService({ lockedUntil: at(-3) }).service.unlock('x@y.z', NOW)).resolves.toBe(
      false,
    );
  });

  it('the clean-up deletes what ended more than a day ago', async () => {
    const { service, attempts } = makeService();
    await expect(service.deleteStale(NOW)).resolves.toBe(3);
    expect(attempts.deleteEndedBefore).toHaveBeenCalledWith(new Date('2026-11-17T10:00:00Z'), 15);
  });
});
