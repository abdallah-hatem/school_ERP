import type { HrDashboard } from '@school-erp/shared';
import { GET_HR_DASHBOARD } from './apis';

/** The dashboard figures, or `null` when they failed to load (the screen shows an error + retry). */
export async function loadDashboard(): Promise<HrDashboard | null> {
  const res = await GET_HR_DASHBOARD();
  const data = res.success ? res.data : null;
  return data && data.headcount && data.penaltiesThisMonth ? data : null;
}
