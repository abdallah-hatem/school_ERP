import { isMonth, PAGINATION, PENALTY_STATUS_FILTERS, type Month, type PenaltyStatusFilter } from '@school-erp/shared';

/** The penalties list's state, in the URL: `?month&status&stageId&search&page&limit`. */
export interface PenaltiesListQuery {
  month: Month;
  /** One status, or `OPEN`: waiting at either step (the dashboard's "waiting" tile). */
  status?: PenaltyStatusFilter;
  /** The stage where the violation happened. */
  stageId?: string;
  search?: string;
  page: number;
  limit: number;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type SearchParamsRecord = Record<string, string | string[] | undefined>;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() || undefined;

function positiveInt(v: string | undefined, fallback: number, max = Number.MAX_SAFE_INTEGER): number {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 ? Math.min(n, max) : fallback;
}

/**
 * Reads the URL into a valid query. The month defaults to `current` and can't be later than it (a
 * penalty can't be dated in the future); unknown statuses and bad pages are dropped.
 */
export function parsePenaltiesQuery(params: SearchParamsRecord, current: Month): PenaltiesListQuery {
  const month = one(params.month);
  const status = one(params.status);
  return {
    month: isMonth(month) && month <= current ? month : current,
    status: (PENALTY_STATUS_FILTERS as readonly string[]).includes(status ?? '') ? (status as PenaltyStatusFilter) : undefined,
    stageId: UUID.test(one(params.stageId) ?? '') ? one(params.stageId) : undefined,
    search: one(params.search),
    page: positiveInt(one(params.page), PAGINATION.defaultPage),
    limit: positiveInt(one(params.limit), PAGINATION.defaultLimit, PAGINATION.maxLimit),
  };
}

/** The query string for `query`, leaving out defaults (`current` month, first page, default size). */
export function penaltiesQueryString(query: PenaltiesListQuery, current: Month): string {
  const params = new URLSearchParams();
  if (query.month !== current) params.set('month', query.month);
  if (query.status) params.set('status', query.status);
  if (query.stageId) params.set('stageId', query.stageId);
  if (query.search) params.set('search', query.search);
  if (query.page !== PAGINATION.defaultPage) params.set('page', String(query.page));
  if (query.limit !== PAGINATION.defaultLimit) params.set('limit', String(query.limit));
  const s = params.toString();
  return s ? `?${s}` : '';
}

/**
 * The penalty a link opens (`?penalty=<id>`, a notification's, §11), or undefined. Not part of the
 * list's query: closing it, or any list control, leaves it out of the URL.
 */
export function focusedPenaltyId(params: SearchParamsRecord): string | undefined {
  const id = one(params.penalty);
  return id && UUID.test(id) ? id : undefined;
}

/** The profile tab's paging (`?page&limit`); it lists every month. */
export function parsePagingQuery(params: SearchParamsRecord): { page: number; limit: number } {
  return {
    page: positiveInt(one(params.page), PAGINATION.defaultPage),
    limit: positiveInt(one(params.limit), PAGINATION.defaultLimit, PAGINATION.maxLimit),
  };
}
