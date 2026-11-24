import { HttpStatus, Injectable } from '@nestjs/common';
import {
  AuditEntityType,
  ErrorCode,
  formatContractYear,
  schoolCalendarIssues,
  type SchoolCalendar,
  type SchoolCalendarDates,
} from '@school-erp/shared';
import { CodedException } from '../../../../common/errors/coded.exception';
import { AuditService } from '../../../../core/audit';
import { AfterCommit } from '../../../../database/transactions';
import { SchoolCalendarRepository } from '../repositories/school-calendar.repository';

/**
 * The school calendar per contract year (spec → What it adds, 6; Settings → HR rules): term 1's
 * first and last day, term 2's first day and the non-renewal deadline. The notice window and the
 * early termination read it. Changing it is recorded (`hr.school_calendar.update`).
 */
@Injectable()
export class SchoolCalendarService {
  constructor(
    private readonly repository: SchoolCalendarRepository,
    private readonly audit: AuditService,
    private readonly afterCommit: AfterCommit,
  ) {}

  async get(year: number): Promise<SchoolCalendar> {
    return { year, calendar: await this.repository.find(year) };
  }

  /** The year's dates, or null when not set. */
  dates(year: number): Promise<SchoolCalendarDates | null> {
    return this.repository.find(year);
  }

  /** Sets the year's four dates: inside the contract year and in order (400 `SCHOOL_CALENDAR_INVALID`). */
  put(year: number, dates: SchoolCalendarDates): Promise<SchoolCalendar> {
    return this.afterCommit.inTransaction(async () => {
      const issues = schoolCalendarIssues(year, dates);
      if (issues.length > 0) {
        throw CodedException.withData(HttpStatus.BAD_REQUEST, ErrorCode.SCHOOL_CALENDAR_INVALID, {}, { fields: issues });
      }
      const before = await this.repository.find(year);
      const after = await this.repository.upsert(year, dates);
      await this.audit.record({
        action: 'hr.school_calendar.update',
        entity: { type: AuditEntityType.SCHOOL_CALENDAR, id: String(year), label: formatContractYear(year) },
        before: before ?? {},
        after,
      });
      return { year, calendar: after };
    });
  }
}
