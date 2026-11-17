import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DatabaseService } from '../../../database/database.service';

export interface StoredSetting {
  key: string;
  value: unknown;
}

/**
 * `SchoolSetting` rows: one per key, the value as JSON. Keyed by `key`, not `id`, so it does not
 * extend BaseRepository.
 */
@Injectable()
export class SchoolSettingRepository {
  constructor(private readonly db: DatabaseService) {}

  async findByKeys(keys: readonly string[]): Promise<StoredSetting[]> {
    return this.db.schoolSetting.findMany({
      where: { key: { in: [...keys] } },
      select: { key: true, value: true },
    });
  }

  /** Writes every entry in one transaction — all keys or none. */
  async upsertMany(entries: StoredSetting[], updatedById: string | null): Promise<void> {
    await this.db.$transaction(
      entries.map(({ key, value }) => {
        const json = (value ?? Prisma.JsonNull) as Prisma.InputJsonValue | typeof Prisma.JsonNull;
        return this.db.schoolSetting.upsert({
          where: { key },
          create: { key, value: json, updatedById },
          update: { value: json, updatedById },
        });
      }),
    );
  }
}
