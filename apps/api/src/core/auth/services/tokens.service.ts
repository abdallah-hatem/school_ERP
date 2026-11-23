import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { AuthUser } from '@school-erp/shared';
import type { RefreshToken } from '@prisma/client';
import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import type { AppConfig } from '../../../config';
import { RefreshTokensRepository } from '../repositories/refresh-tokens.repository';

/**
 * What an access token carries: who it is (`sub`) and which sign-in it belongs to (`fam`, its
 * refresh-token family — absent on tokens issued before 2026-11-23). Everything else is read fresh
 * per request.
 */
export interface AccessPayload {
  sub: string;
  fam?: string;
  iat?: number;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

/** Why a refresh failed — the API answers 401 for every one of them. */
export type RefreshRejection = 'unknown' | 'revoked' | 'expired' | 'reused';

export type RotationResult =
  | {
      ok: true;
      userId: string;
      familyId: string;
      refreshToken: string;
      /** When the rotation happened: the access token is signed as of then, so a replay gets the same one. */
      issuedAt: Date;
    }
  | { ok: false; reason: RefreshRejection };

const DAY_MS = 24 * 60 * 60 * 1000;

/** How far a replay follows the chain of rotations to the live token (a few tabs, a few seconds). */
const MAX_REPLAY_HOPS = 10;

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

/**
 * Access tokens are short-lived JWTs. Refresh tokens are random, stored hashed, rotated on every
 * use and grouped in a family (one sign-in). Reusing a rotated token after the grace window is
 * treated as theft: the whole family is revoked.
 *
 * Inside the grace window (`REFRESH_REUSE_GRACE_SECONDS`, 10 s by default — security review L5,
 * 2026-11-23) a replayed token is answered **idempotently**: with the very pair its first use was
 * given, never a new one. The successor refresh token is derived from the used one with a keyed
 * hash (HMAC with the signing secret), so it can be given again without being stored in the clear;
 * the access token is signed as of the rotation (`iat`), so it is the same string too. Parallel
 * requests refreshing with the same cookie all get that pair; a replayed token mints nothing.
 */
@Injectable()
export class TokensService {
  private readonly auth: AppConfig['auth'];

  constructor(
    private readonly jwt: JwtService,
    private readonly refreshTokens: RefreshTokensRepository,
    config: ConfigService,
  ) {
    this.auth = config.getOrThrow<AppConfig['auth']>('auth');
  }

  get accessTtlSeconds(): number {
    return this.auth.accessTtlSeconds;
  }

  get refreshTtlSeconds(): number {
    return this.auth.refreshTtlDays * 24 * 60 * 60;
  }

  /**
   * An access token for `user`'s sign-in `familyId`. With `issuedAt` it is signed as of then (its
   * expiry counts from then too): the same inputs give the same token, which is how a refresh
   * replayed inside the grace window gets the pair it was already given.
   */
  signAccess(user: Pick<AuthUser, 'id'>, familyId: string, issuedAt?: Date): Promise<string> {
    const payload: AccessPayload = { sub: user.id, fam: familyId };
    if (issuedAt) payload.iat = Math.floor(issuedAt.getTime() / 1000);
    return this.jwt.signAsync(payload);
  }

  /** The payload of a valid, unexpired access token, or null. */
  async verifyAccess(token: string | undefined): Promise<AccessPayload | null> {
    if (!token) return null;
    try {
      return await this.jwt.verifyAsync<AccessPayload>(token);
    } catch {
      return null;
    }
  }

  /**
   * Whether an access token may still be used, given when its user's password last changed
   * (security review L-1): one issued after the change, yes; one issued before it only while its
   * sign-in (`fam`) still has a live refresh token — the sign-in that changed the password is kept,
   * the others were ended (and a temporary password ends them all). A token without `fam` (issued
   * before 2026-11-23) can't tell: refused, once, after a password change.
   */
  async stillValid(payload: AccessPayload, passwordChangedAt: Date | null): Promise<boolean> {
    if (!passwordChangedAt || (payload.iat ?? 0) * 1000 >= passwordChangedAt.getTime()) return true;
    return !!payload.fam && (await this.refreshTokens.familyAlive(payload.fam));
  }

  /** A new refresh token in a new family (a fresh sign-in) or an existing one (rotation). */
  async issueRefresh(userId: string, familyId: string = randomUUID()): Promise<string> {
    const raw = this.newRaw();
    await this.refreshTokens.insert({
      userId,
      familyId,
      tokenHash: sha256(raw),
      expiresAt: this.refreshExpiry(new Date()),
    });
    return raw;
  }

  async rotate(raw: string | undefined, now: Date = new Date()): Promise<RotationResult> {
    if (!raw) return { ok: false, reason: 'unknown' };
    const row = await this.refreshTokens.findByHash(sha256(raw));
    if (!row) return { ok: false, reason: 'unknown' };
    if (row.revokedAt) return { ok: false, reason: 'revoked' };
    if (row.expiresAt <= now) return { ok: false, reason: 'expired' };

    if (row.usedAt) return this.replay(raw, row, now);

    const next = this.successorOf(raw);
    const claimed = await this.refreshTokens.rotate(
      row.id,
      {
        userId: row.userId,
        familyId: row.familyId,
        tokenHash: sha256(next),
        expiresAt: this.refreshExpiry(now),
      },
      now,
    );
    if (!claimed) {
      // A parallel refresh with the same token claimed it first: answer with what it was given.
      const used = await this.refreshTokens.findByHash(sha256(raw));
      if (!used?.usedAt) return { ok: false, reason: 'unknown' };
      return this.replay(raw, used, now);
    }
    return {
      ok: true,
      userId: row.userId,
      familyId: row.familyId,
      refreshToken: next,
      issuedAt: now,
    };
  }

  /**
   * A token already used. Inside the grace window: the pair its first use got (the successor, as
   * long as it is still live), so a replay mints nothing new. After it: theft — the family is
   * revoked.
   */
  private async replay(raw: string, row: RefreshToken, now: Date): Promise<RotationResult> {
    const usedAt = row.usedAt!;
    if (now.getTime() - usedAt.getTime() > this.auth.refreshReuseGraceSeconds * 1000) {
      await this.refreshTokens.revokeFamily(row.familyId, now);
      return { ok: false, reason: 'reused' };
    }
    // Follow the chain to the live token (L-2): two tabs may each have refreshed in turn, so the
    // successor can itself be used already. Each link is derived from the one before, so it can be
    // given again; it is answered as of the rotation that issued it. A broken chain or a revoked link
    // (signed out) is refused — without ending the sign-in.
    let current = row;
    let currentRaw = raw;
    for (let hop = 0; hop < MAX_REPLAY_HOPS; hop++) {
      const nextRaw = this.successorOf(currentRaw);
      const next = current.replacedById ? await this.refreshTokens.findById(current.replacedById) : null;
      if (!next || next.tokenHash !== sha256(nextRaw) || next.revokedAt) return { ok: false, reason: 'revoked' };
      if (!next.usedAt) {
        return {
          ok: true,
          userId: row.userId,
          familyId: row.familyId,
          refreshToken: nextRaw,
          issuedAt: current.usedAt ?? usedAt,
        };
      }
      current = next;
      currentRaw = nextRaw;
    }
    return { ok: false, reason: 'revoked' };
  }

  /** Ends the sign-in a refresh token belongs to (logout). Unknown tokens are ignored. */
  async revoke(raw: string | undefined, userId: string, now: Date = new Date()): Promise<void> {
    if (!raw) return;
    const row = await this.refreshTokens.findByHash(sha256(raw));
    if (row && row.userId === userId) await this.refreshTokens.revokeFamily(row.familyId, now);
  }

  async revokeFamily(familyId: string, now: Date = new Date()): Promise<void> {
    await this.refreshTokens.revokeFamily(familyId, now);
  }

  private newRaw(): string {
    return randomBytes(48).toString('base64url');
  }

  /**
   * The refresh token that replaces `raw`: a keyed hash of it (HMAC-SHA-512 with the signing
   * secret), so only the server can work it out, and the same every time — what lets a replay
   * inside the grace window get the successor again without it being stored in the clear.
   */
  private successorOf(raw: string): string {
    return createHmac('sha512', this.auth.accessSecret)
      .update(`refresh-successor:${raw}`)
      .digest('base64url');
  }

  private refreshExpiry(from: Date): Date {
    return new Date(from.getTime() + this.auth.refreshTtlDays * DAY_MS);
  }
}
