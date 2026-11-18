import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { Month } from '@school-erp/shared';
import type { DbAdapter } from '../../../../database/transactions';

export interface LatenessMinutes {
  employeeId: string;
  minutes: number;
}

/**
 * `LatenessEntry` rows: one per employee per month (`@@unique([employeeId, month])`). Runs in the
 * caller's transaction when one is open, so a saved month and its audit entry commit together.
 */
@Injectable()
export class LatenessRepository {
  constructor(private readonly txHost: TransactionHost<DbAdapter>) {}

  findByMonth(month: Month): Promise<LatenessMinutes[]> {
    return this.txHost.tx.latenessEntry.findMany({
      where: { month },
      select: { employeeId: true, minutes: true },
    });
  }

  /** Upserts the given entries in one transaction — all or none. */
  async upsertMany(
    month: Month,
    entries: LatenessMinutes[],
    updatedById: string | null,
  ): Promise<void> {
    if (!entries.length) return;
    await this.txHost.withTransaction(async () => {
      for (const { employeeId, minutes } of entries) {
        await this.txHost.tx.latenessEntry.upsert({
          where: { employeeId_month: { employeeId, month } },
          create: { employeeId, month, minutes, updatedById },
          update: { minutes, updatedById },
          select: { id: true },
        });
      }
    });
  }
}
