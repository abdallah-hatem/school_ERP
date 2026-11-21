import type { AnalyticsRange, HrDashboard, HrDashboardAnalytics } from '@school-erp/shared';
import { cache } from 'react';
import { GET_HR_DASHBOARD, GET_HR_DASHBOARD_ANALYTICS } from './apis';

/** The dashboard figures, or `null` when they failed to load (the screen shows an error + retry). */
export async function loadDashboard(): Promise<HrDashboard | null> {
  const res = await GET_HR_DASHBOARD();
  // A widget the viewer can't see comes back null (P4); the screen leaves its tiles out.
  return res.success && res.data ? res.data : null;
}

/**
 * The charts' figures, or `null` when they failed to load. One request per render: the header
 * (whose range switch hides in the empty state) and the charts both ask.
 */
export const loadAnalytics = cache(async (range: AnalyticsRange): Promise<HrDashboardAnalytics | null> => {
  const res = await GET_HR_DASHBOARD_ANALYTICS(range);
  return res.success && res.data ? res.data : null;
});
