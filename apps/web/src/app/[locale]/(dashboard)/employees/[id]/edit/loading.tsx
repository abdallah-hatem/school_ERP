import { EmployeePageSkeleton } from '@/modules/hr/employees';

/** The edit form while it loads (outside the profile layout: no tabs). */
export default function EditEmployeeLoading() {
  return <EmployeePageSkeleton />;
}
