import { Injectable } from '@nestjs/common';
import { Prisma, type RefreshToken } from '@prisma/client';
import { BaseRepository } from '../../../common/repositories/base.repository';
import { DatabaseService } from '../../../database/database.service';

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
  constructor(databaseService: DatabaseService) {
    super(databaseService, 'refreshToken');
  }

  findByHash(tokenHash: string): Promise<RefreshToken | null> {
    return this.databaseService.refreshToken.findUnique({ where: { tokenHash } });
  }

  insert(data: NewRefreshToken): Promise<RefreshToken> {
    return this.databaseService.refreshToken.create({ data });
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
    await this.databaseService.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: at },
    });
  }
}
