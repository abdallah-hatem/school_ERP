'use client';

import { usePathname } from 'next/navigation';
import { PayslipSkeleton, RunHistoryPageSkeleton, RunPageSkeleton } from '@/modules/hr/payroll';

/**
 * First visit to anything under `/payroll/<id>`: this boundary wraps the run layout and the
 * payslip, so on a hard load (or coming from the runs list) it is what shows — never a tab's own
 * `loading.tsx`. It draws the page being opened: the payslip, or the run's header and tabs over the
 * opened tab. Tab switches never reach it — the run layout stays mounted.
 */
export default function PayrollRunLoading() {
  // `/<locale>/payroll/<id>/<tab>`
  const segment = usePathname()?.split('/')[4] ?? '';
  if (segment === 'payslip') return <PayslipSkeleton />;
  if (segment === 'history') return <RunHistoryPageSkeleton />;
  return <RunPageSkeleton />;
}
