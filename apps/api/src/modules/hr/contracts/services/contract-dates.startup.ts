import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { todayIsoDate } from '../../../../common/utils/dates.util';
import { AfterCommit } from '../../../../database/transactions';
import { ContractRecords } from './contract-records.service';

/**
 * Once at start-up, the employees' contract dates follow the contract in force (bug 2026-11-24): a
 * deploy or restart on 1 June doesn't wait for the 07:00 run to move them. The same idempotent step
 * as the daily job (`ContractRecords.syncAllCurrentDates`); a failure is logged, never blocks start-up.
 */
@Injectable()
export class ContractDatesOnStart implements OnApplicationBootstrap {
  private readonly logger = new Logger(ContractDatesOnStart.name);

  constructor(
    private readonly records: ContractRecords,
    private readonly afterCommit: AfterCommit,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const today = todayIsoDate();
    try {
      const moved = await this.afterCommit.inTransaction(() => this.records.syncAllCurrentDates(today));
      if (moved) this.logger.log(`contract dates: ${moved} moved to the contract in force (${today})`);
    } catch (e) {
      this.logger.error(`contract dates: start-up sync failed (${today})`, e instanceof Error ? e.stack : String(e));
    }
  }
}
