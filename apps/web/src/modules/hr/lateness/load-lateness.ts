import type { LatenessRule, LatenessRow, Month } from '@school-erp/shared';
import { GET_LATENESS } from './apis';

export interface LatenessData {
  /** `null` when the list failed to load. Each row carries the employee's department. */
  rows: LatenessRow[] | null;
  /** True when the month's payroll is approved: the screen opens read-only. */
  locked: boolean;
  /** The rule the month's days use, sent with the list; `null` when the list failed to load. */
  rule: LatenessRule | null;
}

export async function loadLateness(month: Month): Promise<LatenessData> {
  // The rule comes with the list: a viewer without `hr.settings.view` (the Principal) sees days too.
  const lateness = await GET_LATENESS(month);
  const loaded = lateness.success && lateness.data && Array.isArray(lateness.data.rows) ? lateness.data : null;
  return {
    rows: loaded ? loaded.rows : null,
    locked: loaded ? loaded.locked : false,
    rule: loaded?.rule ?? null,
  };
}
