'use server';

import type { HrDashboard } from '@school-erp/shared';
import { apiFetch } from '@/lib/api';
import { handleResponse } from '@/lib/handleResponse';

/** Cache tag for the HR dashboard figures. */
const DASHBOARD_TAG = 'hr-dashboard';

/**
 * `GET /hr/dashboard` — active headcount (total and by stage), this month's payroll run (or
 * `null`) and this month's penalties by violation date.
 */
export async function GET_HR_DASHBOARD() {
  const response = await apiFetch<HrDashboard>('/hr/dashboard', {
    method: 'GET',
    next: { tags: [DASHBOARD_TAG] },
  });
  return handleResponse({ response, showErrorToast: false });
}
