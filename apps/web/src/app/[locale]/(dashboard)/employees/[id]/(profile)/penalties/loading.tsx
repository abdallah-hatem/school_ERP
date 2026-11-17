import { EmployeePenaltiesSkeleton } from '@/modules/hr/penalties';

/** Switching to the Penalties tab: only the tab's table (the layout's header stays). */
export default function EmployeePenaltiesLoading() {
  return <EmployeePenaltiesSkeleton />;
}
