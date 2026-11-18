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
   * Marks a token used and links it to its successor, in one transaction with the successor's
   * insert. Returns false when another request had already used it (a parallel refresh).
   */
  async rotate(usedId: string, next: NewRefreshToken, at: Date): Promise<boolean> {
    return this.databaseService.$transaction(async (tx) => {
      const created = await tx.refreshToken.create({ data: next });
      const claimed = await tx.refreshToken.updateMany({
        where: { id: usedId, usedAt: null },
        data: { usedAt: at, replacedById: created.id },
      });
      return claimed.count === 1;
    });
  }

  async revokeFamily(familyId: string, at: Date): Promise<void> {
    await this.db.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: at },
    });
  }

  /** Ends every sign-in of a user (deactivated, or given a temporary password). */
  async revokeAllOf(userId: string, at: Date): Promise<number> {
    const { count } = await this.db.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: at },
    });
    return count;
  }
}
