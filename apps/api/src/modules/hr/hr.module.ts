import { Module } from '@nestjs/common';
import { SettingsModule } from '../../core/settings';
import { DashboardController } from './dashboard/controllers/dashboard.controller';
import { DashboardService } from './dashboard/services/dashboard.service';
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
import { PayrollRunsController } from './payroll/controllers/payroll-runs.controller';
import { PayrollRunsRepository } from './payroll/repositories/payroll-runs.repository';
import { PayrollService } from './payroll/services/payroll.service';
import { PenaltiesController } from './penalties/controllers/penalties.controller';
import { PenaltyCatalogueController } from './penalties/controllers/penalty-catalogue.controller';
import { PenaltyCatalogueRepository } from './penalties/repositories/penalty-catalogue.repository';
import { PenaltyRecordsRepository } from './penalties/repositories/penalty-records.repository';
import { PenaltyCatalogueService } from './penalties/services/penalty-catalogue.service';
import { PenaltyRecordsService } from './penalties/services/penalty-records.service';
import { HrSettingsController } from './settings/hr-settings.controller';
import { HrSettingsService } from './settings/hr-settings.service';
import { LatenessController } from './staff-attendance/controllers/lateness.controller';
import { LatenessRepository } from './staff-attendance/repositories/lateness.repository';
import { LatenessService } from './staff-attendance/services/lateness.service';

/**
 * HR — employees, lists, penalties, staff attendance (lateness), payroll, HR rule settings.
 * Sub-folders add their controllers / providers here (additive). Export only public services.
 */
@Module({
  imports: [SettingsModule],
  controllers: [
    // settings (T6)
    HrSettingsController,
    // lists + employees (T5)
    DepartmentsController,
    JobTitlesController,
    EmployeesController,
    // staff attendance — monthly lateness (T8)
    LatenessController,
    // penalties (T7)
    PenaltyCatalogueController,
    PenaltiesController,
    // payroll + dashboard (T9)
    PayrollRunsController,
    DashboardController,
  ],
  providers: [
    // settings (T6)
    HrSettingsService,
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
    // staff attendance — monthly lateness (T8)
    LatenessRepository,
    LatenessService,
    // penalties (T7)
    PenaltyCatalogueRepository,
    PenaltyCatalogueService,
    PenaltyRecordsRepository,
    PenaltyRecordsService,
    // payroll + dashboard (T9)
    PayrollRunsRepository,
    PayrollService,
    DashboardService,
  ],
  exports: [
    // lists + employees (T5)
    EmployeesService,
  ],
})
export class HrModule {}
