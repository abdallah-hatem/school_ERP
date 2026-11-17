import { Module } from '@nestjs/common';
import { EmployeesController } from './employees/controllers/employees.controller';
import { EmployeesRepository } from './employees/repositories/employees.repository';
import { EmployeesService } from './employees/services/employees.service';
import { DepartmentsController } from './lists/controllers/departments.controller';
import { JobTitlesController } from './lists/controllers/job-titles.controller';
import { DepartmentsRepository } from './lists/repositories/departments.repository';
import { JobTitlesRepository } from './lists/repositories/job-titles.repository';
import { DepartmentsService } from './lists/services/departments.service';
import { JobTitlesService } from './lists/services/job-titles.service';
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
    // lists + employees (T5)
    DepartmentsController,
    JobTitlesController,
    EmployeesController,
  ],
  providers: [
    // settings (T6)
    HrSettingsService,
    HrSettingsRepository,
    // month lock (T6) — used by penalties, lateness and payroll
    MonthLockService,
    MonthLockRepository,
    // lists + employees (T5)
    DepartmentsRepository,
    JobTitlesRepository,
    DepartmentsService,
    JobTitlesService,
    EmployeesRepository,
    EmployeesService,
  ],
  exports: [
    // lists + employees (T5)
    EmployeesService,
  ],
})
export class HrModule {}
