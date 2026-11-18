import { Injectable } from '@nestjs/common';
import { HrEvent, type PayrollApprovedEvent } from '@school-erp/shared';
import { OutboxListener, type OutboxEventListener } from '../../../../core/events';
import { AccountingPayrollService } from '../services/accounting-payroll.service';

/** The listener's stable name: it names its outbox delivery rows. */
export const PAYROLL_TAXES_LISTENER = 'accounting.payroll-taxes';

/**
 * HR approved a month (§6) → accounting works out its taxes (§10). Must-deliver: delivered through
 * the outbox after HR's approval commits, in a transaction that also marks the delivery done — so
 * the taxes and the mark commit together and a redelivery is a no-op. A throw rolls the taxes back
 * and the delivery is retried (10 s, 1 min, 5 min, …; dead after 10). The approval stands either
 * way, and `AccountingPayrollService.getMonth` still works a missing month out when it is read (the
 * second guard).
 */
@OutboxListener({ event: HrEvent.PAYROLL_APPROVED, name: PAYROLL_TAXES_LISTENER })
@Injectable()
export class PayrollApprovedListener implements OutboxEventListener<typeof HrEvent.PAYROLL_APPROVED> {
  constructor(private readonly payroll: AccountingPayrollService) {}

  async handle(event: PayrollApprovedEvent): Promise<void> {
    // Already recorded (or the run isn't approved): null, nothing written — idempotent on its own too.
    await this.payroll.recordApprovedRun(event.runId);
  }
}
