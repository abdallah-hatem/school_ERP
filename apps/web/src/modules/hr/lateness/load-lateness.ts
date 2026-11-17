import type { LatenessRule, LatenessRow, Month } from '@school-erp/shared';
import { GET_HR_SETTINGS, GET_LATENESS } from './apis';

export interface LatenessData {
  /** `null` when the list failed to load. Each row carries the employee's department. */
  rows: LatenessRow[] | null;
  /** True when the month's payroll is approved: the screen opens read-only. */
  locked: boolean;
  /** `null` when the HR settings failed to load (days can't be shown). */
  rule: LatenessRule | null;
}

export async function loadLateness(month: Month): Promise<LatenessData> {
  const [lateness, settings] = await Promise.all([GET_LATENESS(month), GET_HR_SETTINGS()]);
  const loaded = lateness.success && lateness.data && Array.isArray(lateness.data.rows) ? lateness.data : null;
  return {
    rows: loaded ? loaded.rows : null,
    locked: loaded ? loaded.locked : false,
    rule: settings.success && settings.data ? settings.data.lateness : null,
  };
}
