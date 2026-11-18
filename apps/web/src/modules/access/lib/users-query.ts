import { PAGINATION, type ListUsersQuery } from '@school-erp/shared';

/** Users per page (the shared list size; owner, 2026-11-17: 10 rows, no rows-per-page choice). */
export const USERS_PAGE_SIZE = PAGINATION.defaultLimit;

/** The list's state lives in the URL: `?page&search&roleId&status`. */
export type UsersListQuery = Required<Pick<ListUsersQuery, 'page' | 'limit'>> & Omit<ListUsersQuery, 'page' | 'limit'>;

export type SearchParamsRecord = Record<string, string | string[] | undefined>;

const FILTER_KEYS = ['search', 'roleId', 'status'] as const;
export type UsersFilterKey = (typeof FILTER_KEYS)[number];

const STATUSES = ['active', 'inactive'] as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() || undefined;

function positiveInt(v: string | undefined, fallback: number): number {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 ? n : fallback;
}

/** Reads the URL into a valid query: an unknown status, a malformed role id or page are dropped. */
export function parseUsersQuery(params: SearchParamsRecord): UsersListQuery {
  const status = one(params.status);
  const roleId = one(params.roleId);
  return {
    page: positiveInt(one(params.page), PAGINATION.defaultPage),
    limit: USERS_PAGE_SIZE,
    search: one(params.search),
    roleId: roleId && UUID.test(roleId) ? roleId : undefined,
    status: (STATUSES as readonly string[]).includes(status ?? '') ? (status as UsersListQuery['status']) : undefined,
  };
}

/** Whether a search or a filter narrows the list — "no results" rather than "nobody yet". */
export function hasActiveFilters(query: UsersListQuery): boolean {
  return activeFilterCount(query) > 0;
}

/** The search plus each filter in use, for "Clear filters · n". */
export function activeFilterCount(query: UsersListQuery): number {
  return FILTER_KEYS.filter((key) => Boolean(query[key])).length;
}

/** The query string for `query`, leaving out defaults so URLs stay short. */
export function usersQueryString(query: UsersListQuery): string {
  const params = new URLSearchParams();
  for (const key of FILTER_KEYS) {
    const value = query[key];
    if (value) params.set(key, value);
  }
  if (query.page !== PAGINATION.defaultPage) params.set('page', String(query.page));
  const s = params.toString();
  return s ? `?${s}` : '';
}
