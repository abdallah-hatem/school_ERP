/*
 * Front door of the employees screens. Routes under `app/[locale]/(dashboard)/employees` and other
 * modules (penalties T12, payroll T14 — the profile tabs) import from here only.
 */
export { EmployeeForm, type EmployeeFormProps } from './components/employee-form';
export { useEmployeeCreateExtras, type AfterCreate, type EmployeeCreateExtras } from './components/employee-create-extras';
export {
  EmployeeDetails,
  EmployeeProfileShell,
  PROFILE_TABS,
  ProfileEmployeeDetails,
  useProfileEmployee,
  useProfileEmployeeIfLoaded,
  type ProfileTabKey,
} from './components/employee-profile';
export { EmployeeIdentity, EmployeeStatusPill } from './components/employee-bits';
export { EmployeesList, type EmployeesListProps } from './components/employees-list';
export { EmployeeDetailsSkeleton, EmployeePageSkeleton, EmployeeProfileSkeleton, EmployeesListSkeleton } from './components/employees-skeletons';
export { EmployeesI18n, employeesMessages } from './messages';
export { parseEmployeesQuery, type SearchParamsRecord } from './lib/list-query';
