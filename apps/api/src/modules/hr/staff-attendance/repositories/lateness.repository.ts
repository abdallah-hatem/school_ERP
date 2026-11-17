import { Injectable } from '@nestjs/common';
import type { Month } from '@school-erp/shared';
import { DatabaseService } from '../../../../database/database.service';

export interface LatenessMinutes {
  employeeId: string;
  minutes: number;
}

/** `LatenessEntry` rows: one per employee per month (`@@unique([employeeId, month])`). */
@Injectable()
export class LatenessRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  findByMonth(month: Month): Promise<LatenessMinutes[]> {
    return this.databaseService.latenessEntry.findMany({
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
    await this.databaseService.$transaction(
      entries.map(({ employeeId, minutes }) =>
        this.databaseService.latenessEntry.upsert({
          where: { employeeId_month: { employeeId, month } },
          create: { employeeId, month, minutes, updatedById },
          update: { minutes, updatedById },
          select: { id: true },
        }),
      ),
    );
  }
}
