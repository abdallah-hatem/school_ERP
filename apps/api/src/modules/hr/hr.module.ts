import { Module } from '@nestjs/common';
import { AuditModule } from '../../core/audit';
import { NotificationsModule } from '../../core/notifications';
import { PermissionsModule } from '../../core/permissions';
import { SettingsModule } from '../../core/settings';
import { UsersModule } from '../../core/users';
import { HrAccessService } from './access/hr-access.service';
import { HrAuditAccess } from './access/hr-audit-access';
import { HrFileAccess } from './access/hr-file-access';
import { HrNotificationScopes } from './access/hr-notification-scopes';
import { HrRemindersJob } from './reminders/hr-reminders.job';
import { HrRemindersService } from './reminders/hr-reminders.service';
import { RemindersRepository } from './reminders/repositories/reminders.repository';
import { DashboardController } from './dashboard/controllers/dashboard.controller';
import { DashboardService } from './dashboard/services/dashboard.service';
import { DashboardAnalyticsRepository } from './dashboard/repositories/dashboard-analytics.repository';
import { DashboardAnalyticsService } from './dashboard/services/dashboard-analytics.service';
import { EmployeesController } from './employees/controllers/employees.controller';
import { EmployeesRepository } from './employees/repositories/employees.repository';
import { EmployeesService } from './employees/services/employees.service';
import { DepartmentsController } from './lists/controllers/departments.controller';
import { JobTitlesController } from './lists/controllers/job-titles.controller';
import { EmployeeGradesController } from './lists/controllers/employee-grades.controller';
import { DepartmentsRepository } from './lists/repositories/departments.repository';
import { JobTitlesRepository } from './lists/repositories/job-titles.repository';
import { EmployeeGradesRepository } from './lists/repositories/employee-grades.repository';
import { DepartmentsService } from './lists/services/departments.service';
import { JobTitlesService } from './lists/services/job-titles.service';
import { EmployeeGradesService } from './lists/services/employee-grades.service';
import { MonthLockService } from './month-lock/month-lock.service';
import { MonthLockRepository } from './month-lock/repositories/month-lock.repository';
import { HrNotificationsService } from './notifications/hr-notifications.service';
import { EmployeePayrollController } from './payroll/controllers/employee-payroll.controller';
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
import {
  ContractsController,
  EmployeeContractsController,
  SchoolCalendarController,
} from './contracts/controllers/contracts.controller';
import { ContractSignedCopyController } from './contracts/controllers/contract-signed-copy.controller';
import { ContractFilesRepository } from './contracts/repositories/contract-files.repository';
import { ContractsRepository } from './contracts/repositories/contracts.repository';
import { ContractSignedCopyService } from './contracts/services/contract-signed-copy.service';
import { SchoolCalendarRepository } from './contracts/repositories/school-calendar.repository';
import { ContractDatesOnStart } from './contracts/services/contract-dates.startup';
import { ContractRecords } from './contracts/services/contract-records.service';
import { ContractsService } from './contracts/services/contracts.service';
import { SchoolCalendarService } from './contracts/services/school-calendar.service';
import { HrSettingsService } from './settings/hr-settings.service';
import { LatenessController } from './staff-attendance/controllers/lateness.controller';
import { LatenessRepository } from './staff-attendance/repositories/lateness.repository';
import { LatenessService } from './staff-attendance/services/lateness.service';

/**
 * HR — employees, lists, penalties, staff attendance (lateness), payroll, HR rule settings.
 * Sub-folders add their controllers / providers here (additive). Export only public services.
 */
@Module({
  imports: [SettingsModule, PermissionsModule, AuditModule, NotificationsModule, UsersModule],
  controllers: [
    // settings (T6)
    HrSettingsController,
    // lists + employees (T5)
    DepartmentsController,
    JobTitlesController,
    EmployeeGradesController,
    EmployeesController,
    // staff attendance — monthly lateness (T8)
    LatenessController,
    // penalties (T7)
    PenaltyCatalogueController,
    PenaltiesController,
    // contracts (spec 2026-11-24)
    ContractsController,
    EmployeeContractsController,
    ContractSignedCopyController,
    SchoolCalendarController,
    // payroll + dashboard (T9)
    PayrollRunsController,
    EmployeePayrollController,
    DashboardController,
  ],
  providers: [
    // who sees which employees, and whose salary (P4: scopes R5, salary R7)
    HrAccessService,
    HrAuditAccess,
    // whose stored files are whose (employee photos follow the employee)
    HrFileAccess,
    // which scoped recipients cover an HR notification's subject (§11, N5)
    HrNotificationScopes,
    // reminders (§11, N3): resolved at the change, sent by the daily job
    HrRemindersService,
    RemindersRepository,
    HrRemindersJob,
    // settings (T6)
    HrSettingsService,
    // approval notifications (§11, N2) — penalties and payroll send through it; registers HR's
    // notification scope resolvers
    HrNotificationsService,
    // month lock (T6) — used by penalties, lateness and payroll
    MonthLockService,
    MonthLockRepository,
    // lists + employees (T5)
    DepartmentsRepository,
    JobTitlesRepository,
    EmployeeGradesRepository,
    DepartmentsService,
    JobTitlesService,
    EmployeeGradesService,
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
    // contracts (spec 2026-11-24)
    ContractsRepository,
    SchoolCalendarRepository,
    ContractRecords,
    ContractDatesOnStart,
    SchoolCalendarService,
    ContractsService,
    // the signed copy of each contract (owner, 2026-11-24)
    ContractFilesRepository,
    ContractSignedCopyService,
    // payroll + dashboard (T9)
    PayrollRunsRepository,
    PayrollService,
    DashboardService,
    // the dashboard charts (owner, 2026-11-21)
    DashboardAnalyticsRepository,
    DashboardAnalyticsService,
  ],
  exports: [
    // lists + employees (T5)
    EmployeesService,
    // payroll — accounting reads approved runs (§10)
    PayrollService,
  ],
})
export class HrModule {}
