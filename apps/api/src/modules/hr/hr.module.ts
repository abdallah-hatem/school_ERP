import { Module } from '@nestjs/common';
import { MonthLockService } from './month-lock/month-lock.service';
import { MonthLockRepository } from './month-lock/repositories/month-lock.repository';
import { HrSettingsController } from './settings/hr-settings.controller';
import { HrSettingsService } from './settings/hr-settings.service';
import { HrSettingsRepository } from './settings/repositories/hr-settings.repository';

/**
 * HR — employees, lists, penalties, staff attendance (lateness), payroll, HR rule settings.
 * Sub-folders add their controllers / providers here (additive). Export only public services.
 */
@Module({
  imports: [],
  controllers: [
    // settings (T6)
    HrSettingsController,
  ],
  providers: [
    // settings (T6)
    HrSettingsService,
    HrSettingsRepository,
    // month lock (T6) — used by penalties, lateness and payroll
    MonthLockService,
    MonthLockRepository,
  ],
  exports: [],
})
export class HrModule {}
