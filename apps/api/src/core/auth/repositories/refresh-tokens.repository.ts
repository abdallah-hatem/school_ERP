import { Injectable } from '@nestjs/common';
import { Prisma, type RefreshToken } from '@prisma/client';
import { BaseRepository } from '../../../common/repositories/base.repository';
import { TransactionHost } from '@nestjs-cls/transactional';
import { DatabaseService } from '../../../database/database.service';
import type { DbAdapter, DbClient } from '../../../database/transactions';

export interface NewRefreshToken {
  userId: string;
  familyId: string;
  tokenHash: string;
  expiresAt: Date;
}

/** Refresh tokens are stored hashed; the raw value only ever lives in the user's cookie. */
@Injectable()
export class RefreshTokensRepository extends BaseRepository<
  RefreshToken,
  Prisma.RefreshTokenUncheckedCreateInput,
  Prisma.RefreshTokenUncheckedUpdateInput
> {
  constructor(
    databaseService: DatabaseService,
    private readonly txHost: TransactionHost<DbAdapter>,
  ) {
    super(databaseService, 'refreshToken');
  }

  /** The open transaction (a sign-in's or sign-out's), so the token and its audit entry commit together. */
  private get db(): DbClient {
    return this.txHost.tx;
  }

  findByHash(tokenHash: string): Promise<RefreshToken | null> {
    return this.databaseService.refreshToken.findUnique({ where: { tokenHash } });
  }

  insert(data: NewRefreshToken): Promise<RefreshToken> {
    return this.db.refreshToken.create({ data });
  }

  /**
   * Claims a token (marks it used) and inserts its successor, linked, in one transaction. The
   * claim comes first: a parallel refresh with the same token waits on the row and then finds it
   * used, so it returns false and inserts nothing (the successor is derived from the token, so a
   * second insert would collide anyway). The caller then answers with the successor already issued.
   */
  async rotate(usedId: string, next: NewRefreshToken, at: Date): Promise<boolean> {
    return this.databaseService.$transaction(async (tx) => {
      const claimed = await tx.refreshToken.updateMany({
        where: { id: usedId, usedAt: null },
        data: { usedAt: at },
      });
      if (claimed.count !== 1) return false;
      const created = await tx.refreshToken.create({ data: next, select: { id: true } });
      await tx.refreshToken.update({
        where: { id: usedId },
        data: { replacedById: created.id },
        select: { id: true },
      });
      return true;
    });
  }

  /** Whether the sign-in still has a live (unrevoked) token — an access token of it may still be used. */
  async familyAlive(familyId: string): Promise<boolean> {
    const live = await this.databaseService.refreshToken.findFirst({
      where: { familyId, revokedAt: null },
      select: { id: true },
    });
    return live !== null;
  }

  async revokeFamily(familyId: string, at: Date): Promise<void> {
    await this.db.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: at },
    });
  }

  /**
   * Ends every sign-in of a user (deactivated, given a temporary password, or changed their
   * password) — except the family `keepFamilyId`, the sign-in that changed the password (M3).
   */
  async revokeAllOf(userId: string, at: Date, keepFamilyId?: string): Promise<number> {
    const { count } = await this.db.refreshToken.updateMany({
      where: { userId, revokedAt: null, ...(keepFamilyId ? { familyId: { not: keepFamilyId } } : {}) },
      data: { revokedAt: at },
    });
    return count;
  }
}
