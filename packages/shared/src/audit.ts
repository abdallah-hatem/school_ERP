import type { SettingsChangeScope } from './events';
import type { IsoDateTime, Uuid } from './types/common';

/*
 * The audit log (§9, spec docs/specs/2026-11-17-audit-log.md). Every action that changes data or
 * access is a typed key here (D5). Entries store the key and the values, never a sentence: the
 * EN / AR sentence is `audit.actions.<key>` in `locales/<lang>/audit.json`, and each changed field's
 * label is `audit.fields.<field>`.
 *
 * Adding an action: add the key below (module, entity type, kind), then its sentence in both
 * `locales/en/audit.json` and `locales/ar/audit.json`, and labels for any new field. The shared
 * tests fail if a key has no sentence in either language.
 */

/** Which module an entry belongs to (the Activity page's module filter). */
export const AUDIT_MODULES = ['core', 'hr'] as const;
export type AuditModule = (typeof AUDIT_MODULES)[number];

/** The kind of record an entry is about — `GET /audit/records/:entityType/:entityId`. */
export const AuditEntityType = {
  USER: 'user',
  ROLE: 'role',
  SCHOOL_SETTINGS: 'school_settings',
  STAGE: 'stage',
  EMPLOYEE: 'employee',
  DEPARTMENT: 'department',
  JOB_TITLE: 'job_title',
  HR_SETTINGS: 'hr_settings',
  PENALTY_GROUP: 'penalty_group',
  VIOLATION: 'violation',
  PENALTY: 'penalty',
  LATENESS_MONTH: 'lateness_month',
  PAYROLL_RUN: 'payroll_run',
} as const;
export type AuditEntityType = (typeof AuditEntityType)[keyof typeof AuditEntityType];
export const AUDIT_ENTITY_TYPES = Object.values(AuditEntityType) as AuditEntityType[];

/** Groups actions for the Activity page's action-type chips. */
export const AUDIT_ACTION_KINDS = ['access', 'create', 'update', 'status'] as const;
export type AuditActionKind = (typeof AUDIT_ACTION_KINDS)[number];

export interface AuditActionDefinition {
  module: AuditModule;
  entityType: AuditEntityType;
  kind: AuditActionKind;
}

const E = AuditEntityType;

/** Every v1 action (spec → "What gets recorded in v1"). */
export const AUDIT_ACTIONS = {
  // core — auth (D11)
  'core.auth.sign_in': { module: 'core', entityType: E.USER, kind: 'access' },
  'core.auth.sign_out': { module: 'core', entityType: E.USER, kind: 'access' },
  'core.auth.sign_in_failed': {
    module: 'core',
    entityType: E.USER,
    kind: 'access',
  },
  // core — settings and school structure
  'core.settings.update': {
    module: 'core',
    entityType: E.SCHOOL_SETTINGS,
    kind: 'update',
  },
  'core.settings.logo_change': {
    module: 'core',
    entityType: E.SCHOOL_SETTINGS,
    kind: 'update',
  },
  'core.stage.create': { module: 'core', entityType: E.STAGE, kind: 'create' },
  'core.stage.update': { module: 'core', entityType: E.STAGE, kind: 'update' },
  // core — user accounts and roles (R8: every access change is traceable)
  'core.user.create': { module: 'core', entityType: E.USER, kind: 'create' },
  'core.user.update': { module: 'core', entityType: E.USER, kind: 'update' },
  'core.user.deactivate': {
    module: 'core',
    entityType: E.USER,
    kind: 'status',
  },
  'core.user.reactivate': {
    module: 'core',
    entityType: E.USER,
    kind: 'status',
  },
  'core.user.set_password': {
    module: 'core',
    entityType: E.USER,
    kind: 'access',
  },
  'core.user.change_password': {
    module: 'core',
    entityType: E.USER,
    kind: 'access',
  },
  'core.role.create': { module: 'core', entityType: E.ROLE, kind: 'create' },
  'core.role.update': { module: 'core', entityType: E.ROLE, kind: 'update' },
  'core.role.delete': { module: 'core', entityType: E.ROLE, kind: 'status' },
  // hr — employees
  'hr.employee.create': {
    module: 'hr',
    entityType: E.EMPLOYEE,
    kind: 'create',
  },
  'hr.employee.update': {
    module: 'hr',
    entityType: E.EMPLOYEE,
    kind: 'update',
  },
  'hr.employee.deactivate': {
    module: 'hr',
    entityType: E.EMPLOYEE,
    kind: 'status',
  },
  'hr.employee.reactivate': {
    module: 'hr',
    entityType: E.EMPLOYEE,
    kind: 'status',
  },
  // hr — lists
  'hr.department.create': {
    module: 'hr',
    entityType: E.DEPARTMENT,
    kind: 'create',
  },
  'hr.department.update': {
    module: 'hr',
    entityType: E.DEPARTMENT,
    kind: 'update',
  },
  'hr.job_title.create': {
    module: 'hr',
    entityType: E.JOB_TITLE,
    kind: 'create',
  },
  'hr.job_title.update': {
    module: 'hr',
    entityType: E.JOB_TITLE,
    kind: 'update',
  },
  // hr — rules
  'hr.settings.update': {
    module: 'hr',
    entityType: E.HR_SETTINGS,
    kind: 'update',
  },
  'hr.penalty_group.create': {
    module: 'hr',
    entityType: E.PENALTY_GROUP,
    kind: 'create',
  },
  'hr.penalty_group.update': {
    module: 'hr',
    entityType: E.PENALTY_GROUP,
    kind: 'update',
  },
  'hr.violation.create': {
    module: 'hr',
    entityType: E.VIOLATION,
    kind: 'create',
  },
  'hr.violation.update': {
    module: 'hr',
    entityType: E.VIOLATION,
    kind: 'update',
  },
  // hr — penalties
  'hr.penalty.record': { module: 'hr', entityType: E.PENALTY, kind: 'create' },
  'hr.penalty.approve': { module: 'hr', entityType: E.PENALTY, kind: 'status' },
  'hr.penalty.cancel': { module: 'hr', entityType: E.PENALTY, kind: 'status' },
  // hr — lateness: one entry per saved month, the changed employees' minutes before → after
  'hr.lateness.save': {
    module: 'hr',
    entityType: E.LATENESS_MONTH,
    kind: 'update',
  },
  // hr — payroll: adjustments are recorded on their run, so they show in the run's history
  'hr.payroll.create': {
    module: 'hr',
    entityType: E.PAYROLL_RUN,
    kind: 'create',
  },
  'hr.payroll.recalculate': {
    module: 'hr',
    entityType: E.PAYROLL_RUN,
    kind: 'update',
  },
  'hr.payroll.approve': {
    module: 'hr',
    entityType: E.PAYROLL_RUN,
    kind: 'status',
  },
  'hr.payroll.adjustment_add': {
    module: 'hr',
    entityType: E.PAYROLL_RUN,
    kind: 'update',
  },
  'hr.payroll.adjustment_remove': {
    module: 'hr',
    entityType: E.PAYROLL_RUN,
    kind: 'update',
  },
} as const satisfies Record<string, AuditActionDefinition>;

export type AuditAction = keyof typeof AUDIT_ACTIONS;
export const AUDIT_ACTION_KEYS = Object.keys(AUDIT_ACTIONS) as AuditAction[];

export function isAuditAction(value: unknown): value is AuditAction {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(AUDIT_ACTIONS, value);
}

/**
 * The actions that make up Settings → Change history (D9), with the scope the history list shows.
 * Their changes are keyed by the setting key (`school.workStart`) or, for list and catalogue
 * edits, by the history key (`hr.departments`, `lists.stages.<id>`) with whole snapshots.
 */
export const SETTINGS_HISTORY_ACTIONS = {
  'core.settings.update': 'school',
  'core.settings.logo_change': 'school',
  'hr.settings.update': 'hr',
  'core.stage.create': 'lists',
  'core.stage.update': 'lists',
  'hr.department.create': 'lists',
  'hr.department.update': 'lists',
  'hr.job_title.create': 'lists',
  'hr.job_title.update': 'lists',
  'hr.penalty_group.create': 'catalogue',
  'hr.penalty_group.update': 'catalogue',
  'hr.violation.create': 'catalogue',
  'hr.violation.update': 'catalogue',
} as const satisfies Partial<Record<AuditAction, SettingsChangeScope>>;
export type SettingsHistoryAction = keyof typeof SETTINGS_HISTORY_ACTIONS;
export const SETTINGS_HISTORY_ACTION_KEYS = Object.keys(
  SETTINGS_HISTORY_ACTIONS,
) as SettingsHistoryAction[];

/** One changed field. Money stays in piastres; secrets are never stored (D7). */
export interface AuditChange {
  field: string;
  before: unknown;
  after: unknown;
}

/** A record's name in both languages; the timeline shows the one matching the screen. */
export interface AuditLabel {
  en: string;
  ar: string;
}

/** `GET /audit` and `GET /audit/records/:entityType/:entityId` item. */
export interface AuditEntry {
  id: Uuid;
  action: AuditAction;
  module: AuditModule;
  entityType: AuditEntityType;
  entityId: string;
  /**
   * Snapshot taken when the entry was written (e.g. the employee's name then), in both languages.
   * Records with one name (a user, a payroll month) and entries written before labels kept both
   * names carry the same text in `en` and `ar`.
   */
  entityLabel: AuditLabel;
  /**
   * `null` for failed sign-ins and system actions. The name is a snapshot (edge case 4);
   * `employeeId` is the employee the user is linked to today (null when none), for a profile link.
   */
  actor: { id: Uuid; name: string; employeeId: Uuid | null } | null;
  changes: AuditChange[];
  meta: { ip: string | null; userAgent: string | null };
  at: IsoDateTime;
}

/** `GET /audit` query. `from` inclusive, `to` exclusive, both ISO 8601 instants. */
export interface AuditListQuery {
  page?: number;
  /** Max 100. */
  limit?: number;
  actorId?: Uuid;
  module?: AuditModule;
  /** One action, or several (any of them) — sent comma-separated: `action=a,b`. */
  action?: AuditAction | readonly AuditAction[];
  from?: IsoDateTime;
  to?: IsoDateTime;
  /** Searches the record's label (employee name or code, payroll month). */
  q?: string;
}

/**
 * `GET /audit/day-totals` query: the `GET /audit` filters (no paging, no period) plus the periods to
 * count — each `from/to` (ISO instants, `to` exclusive), comma-separated, at most 31. The Activity
 * page sends the school days of the page it shows, so each day header counts the whole day.
 * Answer: one total per period, in order.
 */
export type AuditDayTotalsQuery = Omit<AuditListQuery, 'page' | 'limit' | 'from' | 'to'> & {
  periods: readonly { from: IsoDateTime; to: IsoDateTime }[];
};

/** How many periods one `GET /audit/day-totals` may count. */
export const AUDIT_DAY_TOTALS_MAX = 31;

/** `GET /audit/records/:entityType/:entityId` query: paging, plus who and which field. */
export interface AuditRecordQuery {
  page?: number;
  limit?: number;
  actorId?: Uuid;
  /** Only entries that changed this field (`basicSalary`). */
  field?: string;
}

/** A person who appears in the log (`GET /audit/actors`), with the latest name recorded for them. */
export interface AuditActor {
  id: Uuid;
  name: string;
}

/** `GET /audit/actors` query: everyone in the log, or only the people who touched one record. */
export interface AuditActorsQuery {
  entityType?: AuditEntityType;
  entityId?: string;
}

/** `GET /audit/summary?from&to` — the Activity page's "today at a glance". */
export interface AuditSummary {
  /** Entries in the period. */
  actions: number;
  /** Distinct people who did something (entries with an actor). */
  people: number;
  /** Entries that moved money (`isMoneyEntry`). */
  money: number;
  failedSignIns: number;
}

/**
 * Fields holding money (piastres). An entry that changed one of them, or any payroll action, is a
 * "money" entry: the Activity page tags it and the summary counts it.
 */
export const AUDIT_MONEY_FIELDS = ['basicSalary', 'amount', 'totals', 'net'] as const;
export const AUDIT_MONEY_ACTIONS: readonly AuditAction[] = AUDIT_ACTION_KEYS.filter((key) =>
  key.startsWith('hr.payroll.'),
);

export function isMoneyEntry(entry: Pick<AuditEntry, 'action' | 'changes'>): boolean {
  return (
    AUDIT_MONEY_ACTIONS.includes(entry.action) ||
    entry.changes.some((c) => (AUDIT_MONEY_FIELDS as readonly string[]).includes(c.field))
  );
}

/** A failed sign-in: the Activity page marks it and the summary counts it. */
export const AUDIT_FAILED_SIGN_IN = 'core.auth.sign_in_failed' satisfies AuditAction;
