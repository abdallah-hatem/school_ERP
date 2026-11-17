import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { HrSettingKey } from '@school-erp/shared';
import { DatabaseService } from '../../../../database/database.service';

export interface StoredSetting {
  key: string;
  value: unknown;
}

/**
 * HR's rule settings: the `hr.*` rows of `SchoolSetting` (one row per key; a missing row means the
 * §7 default). HR owns these keys; core owns the `school.*` ones. The table is keyed by `key`, not
 * `id`, so this repository doesn't extend BaseRepository (its id-based methods wouldn't apply).
 */
@Injectable()
export class HrSettingsRepository {
  constructor(private readonly db: DatabaseService) {}

  async findByKeys(keys: readonly HrSettingKey[]): Promise<StoredSetting[]> {
    return this.db.schoolSetting.findMany({
      where: { key: { in: [...keys] } },
      select: { key: true, value: true },
    });
  }

  /** Writes every entry in one transaction: all keys change, or none do. */
  async upsertMany(
    entries: readonly { key: HrSettingKey; value: unknown }[],
    updatedById: string | null,
  ): Promise<void> {
    if (entries.length === 0) return;
    await this.db.$transaction(
      entries.map(({ key, value }) => {
        const json = value as Prisma.InputJsonValue;
        return this.db.schoolSetting.upsert({
          where: { key },
          create: { key, value: json, updatedById },
          update: { value: json, updatedById },
          select: { key: true },
        });
      }),
    );
  }
}
