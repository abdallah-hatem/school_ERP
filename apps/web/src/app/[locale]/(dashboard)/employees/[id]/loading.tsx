import { EmployeeProfileSkeleton } from '@/modules/hr/employees';

/**
 * First visit to a profile, while the layout loads the employee: header, tabs and Details cards.
 * Tab switches never reach this boundary — the profile layout above them stays mounted.
 */
export default function EmployeeLoading() {
  return <EmployeeProfileSkeleton />;
}
