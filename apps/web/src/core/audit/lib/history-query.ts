import { PAGINATION, type AuditRecordQuery } from '@school-erp/shared';

/*
 * A record's History tab keeps its state in the URL (`?page&field&person`); the server fetches
 * with it. Shared by every record that shows a History (employee today, payroll run later).
 */

export type SearchParamsRecord = Record<string, string | string[] | undefined>;

/** Server paging: 10 entries per page (audit spec → Screens). */
export const AUDIT_PAGE_SIZE = PAGINATION.defaultLimit;

export interface HistoryQuery {
  page: number;
  actorId?: string;
  field?: string;
}

export const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() || undefined;

export function positiveInt(v: string | undefined): number {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 ? n : PAGINATION.defaultPage;
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseHistoryQuery(params: SearchParamsRecord): HistoryQuery {
  const actorId = one(params.person);
  const field = one(params.field)?.slice(0, 100);
  return {
    page: positiveInt(one(params.page)),
    ...(actorId && UUID.test(actorId) ? { actorId } : {}),
    ...(field ? { field } : {}),
  };
}

export function historyQueryString(query: HistoryQuery): string {
  const params = new URLSearchParams();
  if (query.field) params.set('field', query.field);
  if (query.actorId) params.set('person', query.actorId);
  if (query.page !== PAGINATION.defaultPage) params.set('page', String(query.page));
  const s = params.toString();
  return s ? `?${s}` : '';
}

export function toAuditRecordQuery(query: HistoryQuery): AuditRecordQuery {
  return {
    page: query.page,
    limit: AUDIT_PAGE_SIZE,
    ...(query.actorId ? { actorId: query.actorId } : {}),
    ...(query.field ? { field: query.field } : {}),
  };
}

/**
 * The Activity page filtered to the settings actions — where Settings' "View change history"
 * goes (owner, 2026-11-17). `module=settings` is read by the Activity screen's query.
 */
export function settingsActivityHref(locale: string): string {
  return `/${locale}/activity?module=settings`;
}
