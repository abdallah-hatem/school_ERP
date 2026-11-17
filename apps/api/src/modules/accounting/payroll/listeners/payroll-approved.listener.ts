import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { HrEvent, type PayrollApprovedEvent } from '@school-erp/shared';
import { AccountingPayrollService } from '../services/accounting-payroll.service';

/**
 * HR approved a month (§6) → accounting works out its taxes (§10). Runs after HR's approval has
 * committed. A failure is logged, never thrown back at HR: the approval stands, and the month's
 * taxes are worked out the first time they are read.
 */
@Injectable()
export class PayrollApprovedListener {
  private readonly logger = new Logger(PayrollApprovedListener.name);

  constructor(private readonly payroll: AccountingPayrollService) {}

  @OnEvent(HrEvent.PAYROLL_APPROVED)
  async record(event: PayrollApprovedEvent): Promise<void> {
    try {
      await this.payroll.recordApprovedRun(event.runId);
    } catch (e) {
      this.logger.error(
        `Could not work out the payroll taxes for ${event.month}`,
        e instanceof Error ? e.stack : String(e),
      );
    }
  }
}
