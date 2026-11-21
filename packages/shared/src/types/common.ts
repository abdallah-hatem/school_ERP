/** Integer piastres (EGP × 100). `1400000` = EGP 14,000.00. */
export type Piastres = number;
/** `YYYY-MM-DD`. */
export type IsoDate = string;
/** ISO 8601 timestamp. */
export type IsoDateTime = string;
/** `YYYY-MM`. */
export type Month = string;
/** `HH:mm`, 24-hour. */
export type TimeOfDay = string;
/** Day count in steps of 0.25 (`1.25`). */
export type Days = number;
export type Uuid = string;

/** The envelope's pagination `meta`. */
export interface Meta {
  total: number;
  page: number;
  limit: number;
  hasNextPage?: boolean;
  hasPreviousPage?: boolean;
}

/** The house response envelope — every API response has this shape. */
export interface ApiResponse<T = unknown> {
  success: boolean;
  message: string;
  statusCode: number;
  data?: T;
  /** Stable machine code (see `ErrorCode`) on failures. */
  error?: string;
  /** Per-field validation messages (400 `VALIDATION_FAILED` only), untranslated, for debugging. */
  details?: string[];
  /** Values in the error's message (`ErrorParams`), e.g. `{ count }` minutes left on a sign-in lock. */
  params?: Record<string, string | number>;
  timestamp: string;
  path?: string;
  meta?: Meta;
}

/** A paginated list as returned by a repository, before the controller splits `meta` out. */
export interface Paginated<T> extends Required<Meta> {
  data: T[];
}

/**
 * One page of a list whose screen also shows figures over the **whole filtered set** (a month's
 * totals, a group's subtotals): the endpoint returns this as `data`, with those figures beside
 * `items`. The server pages, searches, filters and sums; the browser only shows the page
 * (owner, 2026-11-21). Plain lists keep the envelope's `data` array + `meta`.
 */
export interface ListPage<T> {
  items: T[];
  /** Rows matching the search and filters (all pages). */
  total: number;
  page: number;
  limit: number;
}

export interface PaginationQuery {
  page?: number;
  /** Max 100. */
  limit?: number;
  search?: string;
}

/** A name pair, used by every list item and entity. */
export interface Names {
  nameEn: string;
  nameAr: string;
}

/** Minimal reference to a named record (department, stage, job title, violation…). */
export interface NamedRef extends Names {
  id: Uuid;
}
