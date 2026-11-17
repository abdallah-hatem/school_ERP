import { EmployeeDetailsSkeleton } from '@/modules/hr/employees';

/** Switching to the Details tab: only the tab's cards (the layout's header stays). */
export default function EmployeeDetailsLoading() {
  return <EmployeeDetailsSkeleton />;
}
