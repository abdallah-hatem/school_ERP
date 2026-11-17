import { Injectable } from '@nestjs/common';
import { PayrollStatus, type Month } from '@school-erp/shared';
import { DatabaseService } from '../../../../database/database.service';

/**
 * Read-only view over `PayrollRun` for the month lock. Owned by HR (payroll's table, same module);
 * it never writes.
 */
@Injectable()
export class MonthLockRepository {
  constructor(private readonly db: DatabaseService) {}

  async hasApprovedRun(month: Month): Promise<boolean> {
    const run = await this.db.payrollRun.findFirst({
      where: { month, status: PayrollStatus.APPROVED },
      select: { id: true },
    });
    return run !== null;
  }
}
