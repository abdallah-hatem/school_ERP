// HR's front door: the only file other modules may import from.
export { HrModule } from './hr.module';
export { EmployeesService } from './employees/services/employees.service';
// The demo seed (prisma/seed) writes through these owning services, never raw inserts.
export { DepartmentsService } from './lists/services/departments.service';
export { JobTitlesService } from './lists/services/job-titles.service';
export { PenaltyCatalogueService } from './penalties/services/penalty-catalogue.service';
export { PenaltyRecordsService } from './penalties/services/penalty-records.service';
export { LatenessService } from './staff-attendance/services/lateness.service';
export { PayrollService, type ApprovedLineBreakdown } from './payroll/services/payroll.service';
export { MonthLockService } from './month-lock/month-lock.service';
