import { CONTRACT_DECISION_FILTERS, PAGINATION, type ContractDecisionFilter } from '@school-erp/shared';

/** The renewal list's state, in the URL: `?year&decision&stageId&search&page&limit`. */
export interface ContractsListQuery {
  /** The contract year (`2026` = 2026/27). */
  year: number;
  /** One decision, or a tile's group (`OPEN`, `DECIDED`, `TO_DEACTIVATE`). */
  decision?: ContractDecisionFilter;
  stageId?: string;
  search?: string;
  page: number;
  limit: number;
}

export type SearchParamsRecord = Record<string, string | string[] | undefined>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Contract years the stepper reaches: far enough back for the history, a few ahead. */
export const YEAR_MIN = 2000;
export const YEAR_MAX = 2100;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() || undefined;

function positiveInt(v: string | undefined, fallback: number, max = Number.MAX_SAFE_INTEGER): number {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 ? Math.min(n, max) : fallback;
}

/** A contract year from the URL, or `current` when it is missing or out of range. */
export function parseYear(value: string | undefined, current: number): number {
  const n = Number(value);
  return Number.isInteger(n) && n >= YEAR_MIN && n <= YEAR_MAX ? n : current;
}

/** Reads the URL into a valid query; unknown decisions, stages and bad pages are dropped. */
export function parseContractsQuery(params: SearchParamsRecord, currentYear: number): ContractsListQuery {
  const decision = one(params.decision);
  const stageId = one(params.stageId);
  return {
    year: parseYear(one(params.year), currentYear),
    decision: (CONTRACT_DECISION_FILTERS as readonly string[]).includes(decision ?? '')
      ? (decision as ContractDecisionFilter)
      : undefined,
    stageId: stageId && UUID.test(stageId) ? stageId : undefined,
    search: one(params.search),
    page: positiveInt(one(params.page), PAGINATION.defaultPage),
    limit: positiveInt(one(params.limit), PAGINATION.defaultLimit, PAGINATION.maxLimit),
  };
}

/** The query string for `query`, leaving out defaults (the current year, first page, default size). */
export function contractsQueryString(query: ContractsListQuery, currentYear: number): string {
  const params = new URLSearchParams();
  if (query.year !== currentYear) params.set('year', String(query.year));
  if (query.decision) params.set('decision', query.decision);
  if (query.stageId) params.set('stageId', query.stageId);
  if (query.search) params.set('search', query.search);
  if (query.page !== PAGINATION.defaultPage) params.set('page', String(query.page));
  if (query.limit !== PAGINATION.defaultLimit) params.set('limit', String(query.limit));
  const s = params.toString();
  return s ? `?${s}` : '';
}

/** The employee tab's paging (`?page&limit`). */
export function parsePagingQuery(params: SearchParamsRecord): { page: number; limit: number } {
  return {
    page: positiveInt(one(params.page), PAGINATION.defaultPage),
    limit: positiveInt(one(params.limit), PAGINATION.defaultLimit, PAGINATION.maxLimit),
  };
}
