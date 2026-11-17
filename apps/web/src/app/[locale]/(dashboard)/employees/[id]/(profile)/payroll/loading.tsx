import { EmployeePayrollSkeleton } from '@/modules/hr/payroll';

/** Switching to the Payroll tab: only the tab's table (the layout's header stays). */
export default function EmployeePayrollLoading() {
  return <EmployeePayrollSkeleton />;
}
