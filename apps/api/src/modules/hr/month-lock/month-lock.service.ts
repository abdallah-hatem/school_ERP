import { HttpStatus, Injectable } from '@nestjs/common';
import { ErrorCode, type Month } from '@school-erp/shared';
import { CodedException } from '../../../common/errors/coded.exception';
import { MonthLockRepository } from './repositories/month-lock.repository';

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * Whether a month is locked: its payroll run is APPROVED (§4, §5, §6). Penalties, lateness and
 * payroll all ask this; it imports none of them, so there is no cycle.
 */
@Injectable()
export class MonthLockService {
  constructor(private readonly repository: MonthLockRepository) {}

  /** `month` is `YYYY-MM`. No run or a DRAFT run → false; an APPROVED run → true. */
  async isMonthLocked(month: Month): Promise<boolean> {
    if (!MONTH_PATTERN.test(month)) throw new RangeError(`month must be YYYY-MM, got "${month}"`);
    return this.repository.hasApprovedRun(month);
  }

  /** Throws 409 `PAYROLL_APPROVED` when the month is locked. */
  async assertMonthOpen(month: Month): Promise<void> {
    if (await this.isMonthLocked(month)) {
      throw new CodedException(HttpStatus.CONFLICT, ErrorCode.PAYROLL_APPROVED);
    }
  }
}
