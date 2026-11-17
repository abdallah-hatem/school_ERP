import { PenaltyStatus, type Month } from '@school-erp/shared';

/**
 * Where each tile and quick link goes, under the locale segment (`/ar`, `/en`). The query strings
 * match the target screens' URL filters: penalties `?month&status`, lateness `?month`. With the
 * month's run id, the payroll tile and "Run payroll" open that run directly.
 */
export function dashboardLinks(locale: string, month: Month, runId?: string | null) {
  const base = `/${locale}`;
  const penalties = (status: PenaltyStatus) => `${base}/penalties?${new URLSearchParams({ month, status }).toString()}`;
  return {
    employees: `${base}/employees`,
    newEmployee: `${base}/employees/new`,
    penalties: `${base}/penalties`,
    pendingPenalties: penalties(PenaltyStatus.PENDING),
    approvedPenalties: penalties(PenaltyStatus.APPROVED),
    lateness: `${base}/lateness?${new URLSearchParams({ month }).toString()}`,
    /** The month's run when there is one, else the runs list (where a run is created). */
    payroll: runId ? `${base}/payroll/${encodeURIComponent(runId)}` : `${base}/payroll`,
    settings: `${base}/settings`,
  };
}
export type DashboardLinks = ReturnType<typeof dashboardLinks>;
