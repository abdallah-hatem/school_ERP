import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import { Prisma } from '@prisma/client';
import type { DbAdapter } from '../../../database/transactions';

export interface StoredSetting {
  key: string;
  value: unknown;
}

/**
 * `SchoolSetting` rows: one per key, the value as JSON. Keyed by `key`, not `id`, so it does not
 * extend BaseRepository. Runs in the caller's transaction when one is open (audit D2/D3).
 */
@Injectable()
export class SchoolSettingRepository {
  constructor(private readonly txHost: TransactionHost<DbAdapter>) {}

  async findByKeys(keys: readonly string[]): Promise<StoredSetting[]> {
    return this.txHost.tx.schoolSetting.findMany({
      where: { key: { in: [...keys] } },
      select: { key: true, value: true },
    });
  }

  /** When any of `keys` was last written, or null when none is stored (all at their defaults). */
  async lastWrittenAt(keys: readonly string[]): Promise<Date | null> {
    const { _max } = await this.txHost.tx.schoolSetting.aggregate({
      where: { key: { in: [...keys] } },
      _max: { updatedAt: true },
    });
    return _max.updatedAt;
  }

  /** Writes every entry in one transaction (the caller's, or a new one) — all keys or none. */
  async upsertMany(entries: StoredSetting[], updatedById: string | null): Promise<void> {
    await this.txHost.withTransaction(async () => {
      for (const { key, value } of entries) {
        const json = (value ?? Prisma.JsonNull) as Prisma.InputJsonValue | typeof Prisma.JsonNull;
        await this.txHost.tx.schoolSetting.upsert({
          where: { key },
          create: { key, value: json, updatedById },
          update: { value: json, updatedById },
          select: { key: true },
        });
      }
    });
  }
}
