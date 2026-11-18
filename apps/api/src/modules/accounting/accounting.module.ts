import { Module } from '@nestjs/common';
import { AuditModule } from '../../core/audit';
import { SettingsModule } from '../../core/settings';
import { HrModule } from '../hr';
import { AccountingPayrollController } from './payroll/controllers/accounting-payroll.controller';
import { PayrollApprovedListener } from './payroll/listeners/payroll-approved.listener';
import { AccountingPayrollRepository } from './payroll/repositories/accounting-payroll.repository';
import { AccountingPayrollService } from './payroll/services/accounting-payroll.service';
import { AccountingSettingsController } from './settings/accounting-settings.controller';
import { AccountingSettingsService } from './settings/accounting-settings.service';

/**
 * Accounting (§10) — the top of the module order: it reads HR through HR's front door and reacts to
 * HR's events; nothing below depends on it. Today: the payroll tax rule and each approved month's
 * payroll taxes. Journal entries are Planned.
 */
@Module({
  imports: [SettingsModule, AuditModule, HrModule],
  controllers: [AccountingSettingsController, AccountingPayrollController],
  providers: [
    AccountingSettingsService,
    AccountingPayrollRepository,
    AccountingPayrollService,
    PayrollApprovedListener,
  ],
})
export class AccountingModule {}
