import {
  AUDIT_ACTION_KEYS,
  AUDIT_ACTIONS,
  AUDIT_FAILED_SIGN_IN,
  PAGINATION,
  SETTINGS_HISTORY_ACTION_KEYS,
  type AuditAction,
  type AuditListQuery,
  type AuditModule,
  type IsoDate,
} from '@school-erp/shared';
import { AUDIT_PAGE_SIZE, one, positiveInt, UUID, type SearchParamsRecord } from '@/core/audit/lib/history-query';
import { schoolDayRange } from '@/core/audit/lib/time';

export type { SearchParamsRecord };

/*
 * The Activity page's state lives in the URL; the server fetches with it
 * (`?page&q&module&type&person&from&to`). `module=settings` is the Settings link's filter.
 */

/** The module switch: School, HR, Accounting, plus "Settings" — the settings actions of all of them. */
export const ACTIVITY_MODULES = ['core', 'hr', 'accounting', 'settings'] as const;
export type ActivityModule = (typeof ACTIVITY_MODULES)[number];

/** The action-type chips, each a set of actions; several chips mean any of them. */
export const ACTIVITY_TYPES = ['create', 'update', 'status', 'signIn', 'failed'] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

const ofKind = (kind: string) => AUDIT_ACTION_KEYS.filter((key) => AUDIT_ACTIONS[key].kind === kind);

/** "Failed sign-in": a wrong password, and the lockout too many of them cause (§2). */
const FAILED_ACTIONS: readonly AuditAction[] = [AUDIT_FAILED_SIGN_IN, 'core.auth.locked_out'];

export const TYPE_ACTIONS: Record<ActivityType, readonly AuditAction[]> = {
  create: ofKind('create'),
  update: ofKind('update'),
  status: ofKind('status'),
  signIn: ofKind('access').filter(
    (key) => key.startsWith('core.auth.') && !FAILED_ACTIONS.includes(key),
  ),
  failed: FAILED_ACTIONS,
};

export interface ActivityQuery {
  page: number;
  q?: string;
  module?: ActivityModule;
  types: ActivityType[];
  actorId?: string;
  /** First and last day included, in the school's calendar. */
  from?: IsoDate;
  to?: IsoDate;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

function isDay(value: string | undefined): value is IsoDate {
  if (!value || !DAY.test(value)) return false;
  const d = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(value);
}

/** Reads the URL into a valid query: unknown values are dropped, a reversed range is swapped. */
export function parseActivityQuery(params: SearchParamsRecord): ActivityQuery {
  const moduleParam = one(params.module);
  const types = (one(params.type) ?? '')
    .split(',')
    .filter((t): t is ActivityType => (ACTIVITY_TYPES as readonly string[]).includes(t));
  const actorId = one(params.person);
  let from = one(params.from);
  let to = one(params.to);
  if (!isDay(from)) from = undefined;
  if (!isDay(to)) to = undefined;
  if (from && to && from > to) [from, to] = [to, from];
  const q = one(params.q)?.slice(0, 100);
  return {
    page: positiveInt(one(params.page)),
    ...(q ? { q } : {}),
    ...((ACTIVITY_MODULES as readonly string[]).includes(moduleParam ?? '') ? { module: moduleParam as ActivityModule } : {}),
    types: ACTIVITY_TYPES.filter((t) => types.includes(t)),
    ...(actorId && UUID.test(actorId) ? { actorId } : {}),
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
  };
}

/** The query string for `query`, leaving out defaults so URLs stay short. */
export function activityQueryString(query: ActivityQuery): string {
  const params = new URLSearchParams();
  if (query.q) params.set('q', query.q);
  if (query.module) params.set('module', query.module);
  if (query.types.length) params.set('type', query.types.join(','));
  if (query.actorId) params.set('person', query.actorId);
  if (query.from) params.set('from', query.from);
  if (query.to) params.set('to', query.to);
  if (query.page !== PAGINATION.defaultPage) params.set('page', String(query.page));
  const s = params.toString();
  return s ? `?${s}` : '';
}

/** How many filters narrow the list (the phone's Filters button count). Search is not a filter. */
export function activeFilterCount(query: ActivityQuery): number {
  return (query.module ? 1 : 0) + query.types.length + (query.actorId ? 1 : 0) + (query.from || query.to ? 1 : 0);
}

/** "No results for these filters" vs "nothing yet". */
export function hasActiveFilters(query: ActivityQuery): boolean {
  return activeFilterCount(query) > 0 || Boolean(query.q);
}

/**
 * The API query for `query`, or `null` when the filters can't match anything (e.g. Settings with
 * "Signed in") — the page then shows "no results" without asking.
 */
export function toAuditListQuery(query: ActivityQuery): AuditListQuery | null {
  let actions: readonly AuditAction[] | undefined;
  let auditModule: AuditModule | undefined;
  if (query.module === 'settings') actions = SETTINGS_HISTORY_ACTION_KEYS;
  else if (query.module) auditModule = query.module;

  if (query.types.length) {
    const chosen = new Set(query.types.flatMap((t) => TYPE_ACTIONS[t]));
    actions = actions ? actions.filter((a) => chosen.has(a)) : [...chosen];
    if (auditModule) actions = actions.filter((a) => AUDIT_ACTIONS[a].module === auditModule);
    if (actions.length === 0) return null;
  }

  const range =
    query.from || query.to ? schoolDayRange(query.from ?? query.to!, query.to ?? query.from!) : undefined;
  return {
    page: query.page,
    limit: AUDIT_PAGE_SIZE,
    ...(query.q ? { q: query.q } : {}),
    ...(auditModule ? { module: auditModule } : {}),
    ...(actions ? { action: actions } : {}),
    ...(query.actorId ? { actorId: query.actorId } : {}),
    ...(range ? { from: range.from, to: range.to } : {}),
  };
}
