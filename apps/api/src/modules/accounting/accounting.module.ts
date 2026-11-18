import { Module } from '@nestjs/common';
import { SettingsModule } from '../../core/settings';
import { AccountingSettingsController } from './settings/accounting-settings.controller';
import { AccountingSettingsService } from './settings/accounting-settings.service';

/**
 * Accounting (§10) — the top of the module order: it reads other modules only through their front
 * doors and reacts to their events; nothing below depends on it. Today: the payroll tax rule.
 * Working out each approved month's taxes and journal entries follow.
 */
@Module({
  imports: [SettingsModule],
  controllers: [AccountingSettingsController],
  providers: [AccountingSettingsService],
  exports: [AccountingSettingsService],
})
export class AccountingModule {}
