import { RunHistorySkeleton } from '@/modules/hr/payroll';

/** Switching to the History tab: only the tab's timeline and filters (the layout's header stays). */
export default function PayrollRunHistoryLoading() {
  return <RunHistorySkeleton />;
}
