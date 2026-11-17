import type { ConfigService } from '@nestjs/config';
import type { JwtService } from '@nestjs/jwt';
import type { RefreshToken } from '@prisma/client';
import { createHash } from 'node:crypto';
import type { RefreshTokensRepository } from '../repositories/refresh-tokens.repository';
import { TokensService } from './tokens.service';

const NOW = new Date('2026-11-17T10:00:00Z');
const sha = (v: string) => createHash('sha256').update(v).digest('hex');

function row(overrides: Partial<RefreshToken> = {}): RefreshToken {
  return {
    id: 'rt-1',
    userId: 'u-1',
    familyId: 'fam-1',
    tokenHash: sha('raw'),
    expiresAt: new Date(NOW.getTime() + 86_400_000),
    usedAt: null,
    revokedAt: null,
    replacedById: null,
    createdAt: NOW,
    ...overrides,
  };
}

function makeService(found: RefreshToken | null = row()) {
  const repo = {
    findByHash: jest.fn().mockResolvedValue(found),
    insert: jest.fn().mockResolvedValue(undefined),
    rotate: jest.fn().mockResolvedValue(true),
    revokeFamily: jest.fn().mockResolvedValue(undefined),
  };
  const config = {
    getOrThrow: () => ({
      accessSecret: 'x'.repeat(32),
      accessTtlSeconds: 900,
      refreshTtlDays: 14,
      refreshReuseGraceSeconds: 30,
      cookieSecure: false,
    }),
  } as unknown as ConfigService;
  const service = new TokensService(
    {} as JwtService,
    repo as unknown as RefreshTokensRepository,
    config,
  );
  return { service, repo };
}

describe('TokensService.rotate', () => {
  it('rotates an unused token into the same family, storing only the hash', async () => {
    const { service, repo } = makeService();
    const result = await service.rotate('raw', NOW);
    expect(result).toMatchObject({ ok: true, userId: 'u-1', familyId: 'fam-1' });
    if (!result.ok) throw new Error('expected ok');
    expect(result.refreshToken).not.toBe('raw');
    const [usedId, next] = repo.rotate.mock.calls[0] as [
      string,
      { tokenHash: string; familyId: string },
    ];
    expect(usedId).toBe('rt-1');
    expect(next).toMatchObject({ familyId: 'fam-1', tokenHash: sha(result.refreshToken) });
  });

  it('accepts a reuse inside the grace window (parallel refreshes)', async () => {
    const { service, repo } = makeService(row({ usedAt: new Date(NOW.getTime() - 29_000) }));
    await expect(service.rotate('raw', NOW)).resolves.toMatchObject({ ok: true });
    expect(repo.revokeFamily).not.toHaveBeenCalled();
  });

  it('revokes the family on a reuse after the grace window', async () => {
    const { service, repo } = makeService(row({ usedAt: new Date(NOW.getTime() - 31_000) }));
    await expect(service.rotate('raw', NOW)).resolves.toEqual({ ok: false, reason: 'reused' });
    expect(repo.revokeFamily).toHaveBeenCalledWith('fam-1', NOW);
    expect(repo.rotate).not.toHaveBeenCalled();
  });

  it.each([
    ['unknown', null],
    ['revoked', row({ revokedAt: NOW })],
    ['expired', row({ expiresAt: NOW })],
  ])('refuses a %s token', async (reason, found) => {
    const { service, repo } = makeService(found);
    await expect(service.rotate('raw', NOW)).resolves.toEqual({ ok: false, reason });
    expect(repo.rotate).not.toHaveBeenCalled();
  });

  it('refuses a missing token without touching the database', async () => {
    const { service, repo } = makeService();
    await expect(service.rotate(undefined, NOW)).resolves.toEqual({ ok: false, reason: 'unknown' });
    expect(repo.findByHash).not.toHaveBeenCalled();
  });
});

describe('TokensService.revoke', () => {
  it("ends the family only for the token's own user", async () => {
    const { service, repo } = makeService();
    await service.revoke('raw', 'someone-else', NOW);
    expect(repo.revokeFamily).not.toHaveBeenCalled();
    await service.revoke('raw', 'u-1', NOW);
    expect(repo.revokeFamily).toHaveBeenCalledWith('fam-1', NOW);
  });
});
