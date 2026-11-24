import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { SchoolCalendarDates } from '@school-erp/shared';
import { fromIsoDate, toIsoDate } from '../../../../common/utils/dates.util';
import type { DbAdapter } from '../../../../database/transactions';

const toDates = (row: { term1Start: Date; term1End: Date; term2Start: Date; nonRenewalDeadline: Date }): SchoolCalendarDates => ({
  term1Start: toIsoDate(row.term1Start),
  term1End: toIsoDate(row.term1End),
  term2Start: toIsoDate(row.term2Start),
  nonRenewalDeadline: toIsoDate(row.nonRenewalDeadline),
});

/** The school calendar, one row per contract year (Settings → HR rules). */
@Injectable()
export class SchoolCalendarRepository {
  constructor(private readonly txHost: TransactionHost<DbAdapter>) {}

  async find(year: number): Promise<SchoolCalendarDates | null> {
    const row = await this.txHost.tx.schoolCalendar.findUnique({ where: { year } });
    return row ? toDates(row) : null;
  }

  async upsert(year: number, dates: SchoolCalendarDates): Promise<SchoolCalendarDates> {
    const data = {
      term1Start: fromIsoDate(dates.term1Start),
      term1End: fromIsoDate(dates.term1End),
      term2Start: fromIsoDate(dates.term2Start),
      nonRenewalDeadline: fromIsoDate(dates.nonRenewalDeadline),
    };
    const row = await this.txHost.tx.schoolCalendar.upsert({
      where: { year },
      create: { year, ...data },
      update: data,
    });
    return toDates(row);
  }
}
