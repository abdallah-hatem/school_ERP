import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import { Prisma } from '@prisma/client';
import { DatabaseService } from '../../../database/database.service';
import type { DbAdapter } from '../../../database/transactions';

export interface FailureLimits {
  maxAttempts: number;
  windowMinutes: number;
  lockMinutes: number;
}

export interface FailureResult {
  failedCount: number;
  lockedUntil: Date | null;
}

const MINUTE_MS = 60_000;

/**
 * A UTC instant as a `timestamp(3)` literal — the columns hold UTC without a zone (as Prisma
 * writes them), so the raw statement never depends on the connection's TimeZone.
 */
const utc = (d: Date) => Prisma.sql`${d.toISOString().replace('Z', '')}::timestamp(3)`;

/**
 * `login_attempts` (core/sign-in-limit owns it). Counting a wrong password uses the plain client,
 * never the request's transaction: it must stay counted when the request then fails and rolls
 * back (a wrong current password on `POST /account/password`, an `@Audited` handler). Everything
 * else joins the caller's transaction (`txHost.tx`), so an admin's unlock commits with its entry.
 */
@Injectable()
export class LoginAttemptsRepository {
  constructor(
    private readonly plain: DatabaseService,
    private readonly txHost: TransactionHost<DbAdapter>,
  ) {}

  private get db() {
    return this.txHost.tx;
  }

  /** When the email's sign-in is locked until (it may be in the past), or null. */
  async findLockedUntil(email: string): Promise<Date | null> {
    const row = await this.db.loginAttempt.findUnique({
      where: { email },
      select: { lockedUntil: true },
    });
    return row?.lockedUntil ?? null;
  }

  /** The emails among `emails` locked after `now`, with when the lock ends. */
  async findLocked(emails: readonly string[], now: Date): Promise<Map<string, Date>> {
    if (emails.length === 0) return new Map();
    const rows = await this.db.loginAttempt.findMany({
      where: { email: { in: [...emails] }, lockedUntil: { gt: now } },
      select: { email: true, lockedUntil: true },
    });
    return new Map(rows.flatMap((r) => (r.lockedUntil ? [[r.email, r.lockedUntil] as const] : [])));
  }

  /**
   * Counts one wrong password, in one atomic statement so concurrent attempts can't slip past the
   * count: the first one inserts the row; later ones add to it. A window that started more than
   * `windowMinutes` ago — or whose lock has ended — starts over at 1. Reaching `maxAttempts` sets
   * `locked_until` to now + `lockMinutes` (once per window: the attempt that reaches it).
   */
  async recordFailure(email: string, now: Date, limits: FailureLimits): Promise<FailureResult> {
    const windowStart = new Date(now.getTime() - limits.windowMinutes * MINUTE_MS);
    const lockUntil = new Date(now.getTime() + limits.lockMinutes * MINUTE_MS);
    const max = limits.maxAttempts;
    const fresh = Prisma.sql`(a."window_started_at" <= ${utc(windowStart)}
      OR (a."locked_until" IS NOT NULL AND a."locked_until" <= ${utc(now)}))`;
    const nextCount = Prisma.sql`(CASE WHEN ${fresh} THEN 1 ELSE a."failed_count" + 1 END)`;
    const [row] = await this.plain.$queryRaw<FailureResult[]>`
      INSERT INTO "login_attempts" AS a ("email", "failed_count", "window_started_at", "locked_until")
      VALUES (${email}, 1, ${utc(now)}, CASE WHEN 1 >= ${max} THEN ${utc(lockUntil)} ELSE NULL END)
      ON CONFLICT ("email") DO UPDATE SET
        "failed_count" = ${nextCount},
        "window_started_at" = CASE WHEN ${fresh} THEN ${utc(now)} ELSE a."window_started_at" END,
        "locked_until" = CASE
          WHEN ${nextCount} = ${max} THEN ${utc(lockUntil)}
          WHEN ${fresh} THEN NULL
          ELSE a."locked_until"
        END
      RETURNING a."failed_count" AS "failedCount", a."locked_until" AS "lockedUntil"`;
    if (!row) throw new Error('login_attempts upsert returned no row');
    return row;
  }

  /** Forgets the email's wrong passwords (a correct sign-in, or an admin unlocking it). */
  async clear(email: string): Promise<number> {
    const { count } = await this.db.loginAttempt.deleteMany({ where: { email } });
    return count;
  }

  /**
   * Deletes rows whose window and lock both ended before `before` (the nightly clean-up passes
   * a day ago). The window test is on `window_started_at` alone, so its index serves it.
   */
  async deleteEndedBefore(before: Date, windowMinutes: number): Promise<number> {
    const windowStartedBefore = new Date(before.getTime() - windowMinutes * MINUTE_MS);
    const { count } = await this.db.loginAttempt.deleteMany({
      where: {
        windowStartedAt: { lt: windowStartedBefore },
        OR: [{ lockedUntil: null }, { lockedUntil: { lt: before } }],
      },
    });
    return count;
  }

  /** The account behind an email, when there is one (the lockout's audit entry names it). */
  async findUserId(email: string): Promise<string | null> {
    const row = await this.db.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
      select: { id: true },
    });
    return row?.id ?? null;
  }
}
