import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { AuthUser } from '@school-erp/shared';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { AppConfig } from '../../../config';
import { RefreshTokensRepository } from '../repositories/refresh-tokens.repository';

export interface AccessPayload {
  sub: string;
  role: AuthUser['role'];
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

/** Why a refresh failed — the API answers 401 for every one of them. */
export type RefreshRejection = 'unknown' | 'revoked' | 'expired' | 'reused';

export type RotationResult =
  | { ok: true; userId: string; familyId: string; refreshToken: string }
  | { ok: false; reason: RefreshRejection };

const DAY_MS = 24 * 60 * 60 * 1000;

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

/**
 * Access tokens are short-lived JWTs. Refresh tokens are random, stored hashed, rotated on every
 * use and grouped in a family (one sign-in). Reusing a rotated token after the grace window is
 * treated as theft: the whole family is revoked.
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

  signAccess(user: Pick<AuthUser, 'id' | 'role'>): Promise<string> {
    const payload: AccessPayload = { sub: user.id, role: user.role };
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

    if (
      row.usedAt &&
      now.getTime() - row.usedAt.getTime() > this.auth.refreshReuseGraceSeconds * 1000
    ) {
      await this.refreshTokens.revokeFamily(row.familyId, now);
      return { ok: false, reason: 'reused' };
    }

    // Unused, or reused inside the grace window (parallel requests refreshing with the same
    // cookie): either way the caller gets a fresh pair in the same family.
    const next = this.newRaw();
    await this.refreshTokens.rotate(
      row.id,
      {
        userId: row.userId,
        familyId: row.familyId,
        tokenHash: sha256(next),
        expiresAt: this.refreshExpiry(now),
      },
      now,
    );
    return { ok: true, userId: row.userId, familyId: row.familyId, refreshToken: next };
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

  private refreshExpiry(from: Date): Date {
    return new Date(from.getTime() + this.auth.refreshTtlDays * DAY_MS);
  }
}
