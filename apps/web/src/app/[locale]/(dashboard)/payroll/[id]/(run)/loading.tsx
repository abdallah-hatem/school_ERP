import { RunLinesSkeleton } from '@/modules/hr/payroll';

/** Switching to the Employees tab: only the tab's tiles, table and rules (the layout's header stays). */
export default function PayrollRunLinesLoading() {
  return <RunLinesSkeleton />;
}
