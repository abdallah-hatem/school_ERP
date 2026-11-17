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
  timestamp: string;
  path?: string;
  meta?: Meta;
}

/** A paginated list as returned by a repository, before the controller splits `meta` out. */
export interface Paginated<T> extends Required<Meta> {
  data: T[];
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
