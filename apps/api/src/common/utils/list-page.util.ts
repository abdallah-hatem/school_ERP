import { PAGINATION, type ListPage } from '@school-erp/shared';

/**
 * One page of rows the service has already worked out in full (a month's lateness, whose days come
 * from today's rule and so can't be summed or paged in SQL). `limit` is capped at `max`; a page
 * past the end is empty with the right `total`. Rows read straight from a table page in their
 * repository instead (`BaseRepository.findAllWithPagination`).
 */
export function pageOf<T>(
  rows: readonly T[],
  page: number = PAGINATION.defaultPage,
  limit: number = PAGINATION.defaultLimit,
  max: number = PAGINATION.maxLimit,
): ListPage<T> {
  const take = Math.min(Math.max(1, limit), max);
  const current = Math.max(1, page);
  return { items: rows.slice((current - 1) * take, current * take), total: rows.length, page: current, limit: take };
}
