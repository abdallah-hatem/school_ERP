import type { HrDashboard } from '@school-erp/shared';
import { GET_HR_DASHBOARD } from './apis';

/** The dashboard figures, or `null` when they failed to load (the screen shows an error + retry). */
export async function loadDashboard(): Promise<HrDashboard | null> {
  const res = await GET_HR_DASHBOARD();
  // A widget the viewer can't see comes back null (P4); the screen leaves its tiles out.
  return res.success && res.data ? res.data : null;
}
