import { PAGINATION, type LatenessRule, type LatenessRow, type LatenessTotals, type Month } from '@school-erp/shared';
import { GET_LATENESS } from './apis';

export interface LatenessData {
  /** One page of the month (by code, searched by the API); `null` when it failed to load. */
  rows: LatenessRow[] | null;
  /** True when the month's payroll is approved: the screen opens read-only. */
  locked: boolean;
  /** The rule the month's days use, sent with the list; `null` when the list failed to load. */
  rule: LatenessRule | null;
  /** How many employees match the search (all pages), the page and its size. */
  total: number;
  page: number;
  limit: number;
  /** The month's totals over every employee (the summary); `null` when the list failed to load. */
  totals: LatenessTotals | null;
}

export interface LatenessQuery {
  search?: string;
  page?: number;
}

export async function loadLateness(month: Month, query: LatenessQuery = {}): Promise<LatenessData> {
  // The rule comes with the list: a viewer without `hr.settings.view` (the Principal) sees days too.
  const lateness = await GET_LATENESS(month, query);
  const loaded = lateness.success && lateness.data && Array.isArray(lateness.data.items) ? lateness.data : null;
  return {
    rows: loaded ? loaded.items : null,
    locked: loaded ? loaded.locked : false,
    rule: loaded?.rule ?? null,
    total: loaded?.total ?? 0,
    page: loaded?.page ?? query.page ?? PAGINATION.defaultPage,
    limit: loaded?.limit ?? PAGINATION.defaultLimit,
    totals: loaded?.totals ?? null,
  };
}
