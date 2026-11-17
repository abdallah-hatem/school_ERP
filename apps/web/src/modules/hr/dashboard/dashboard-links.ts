import { PenaltyStatus, type Month } from '@school-erp/shared';

/**
 * Where each tile and quick link goes, under the locale segment (`/ar`, `/en`). The query strings
 * match the target screens' URL filters: penalties `?month&status`, lateness `?month`.
 */
export function dashboardLinks(locale: string, month: Month) {
  const base = `/${locale}`;
  const penalties = (status: PenaltyStatus) => `${base}/penalties?${new URLSearchParams({ month, status }).toString()}`;
  return {
    employees: `${base}/employees`,
    newEmployee: `${base}/employees/new`,
    penalties: `${base}/penalties`,
    pendingPenalties: penalties(PenaltyStatus.PENDING),
    approvedPenalties: penalties(PenaltyStatus.APPROVED),
    lateness: `${base}/lateness?${new URLSearchParams({ month }).toString()}`,
    /** The runs list: it opens the month's run and creates a new one (the dashboard carries no run id). */
    payroll: `${base}/payroll`,
    settings: `${base}/settings`,
  };
}
export type DashboardLinks = ReturnType<typeof dashboardLinks>;
