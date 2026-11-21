import { isMonth, PAGINATION, type Month } from '@school-erp/shared';

/** `?month=` when valid and not in the future, else this month. */
export function resolveMonth(requested: string | string[] | undefined, current: Month): Month {
  const value = Array.isArray(requested) ? requested[0] : requested;
  return isMonth(value) && value <= current ? value : current;
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** `?search&page` of the month's list (the API searches and pages it). */
export function resolveLatenessQuery(
  search: string | string[] | undefined,
  page: string | string[] | undefined,
): { search?: string; page: number } {
  const text = one(search)?.trim().slice(0, 100);
  const n = Number(one(page));
  return { ...(text ? { search: text } : {}), page: Number.isInteger(n) && n >= 1 ? n : PAGINATION.defaultPage };
}

/** The URL of a month's list: `?month=` always, then the search and the page when set. */
export function latenessHref(month: Month, query: { search?: string; page?: number } = {}): string {
  const params = new URLSearchParams({ month });
  if (query.search) params.set('search', query.search);
  if (query.page && query.page > PAGINATION.defaultPage) params.set('page', String(query.page));
  return `?${params.toString()}`;
}
