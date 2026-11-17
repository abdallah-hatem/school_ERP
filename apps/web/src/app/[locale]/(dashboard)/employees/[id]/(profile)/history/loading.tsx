import { RecordHistorySkeleton } from '@/core/audit';

/** Switching to the History tab: only the tab's timeline and filters (the layout's header stays). */
export default function EmployeeHistoryLoading() {
  return <RecordHistorySkeleton />;
}
