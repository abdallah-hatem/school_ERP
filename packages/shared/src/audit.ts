import type { SettingsChangeScope } from './events';
import type { IsoDateTime, Uuid } from './types/common';
import type { PersonAvatarRef } from './types/core';

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
export const AUDIT_MODULES = ['core', 'hr', 'accounting'] as const;
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
  EMPLOYEE_GRADE: 'employee_grade',
  HR_SETTINGS: 'hr_settings',
  PENALTY_GROUP: 'penalty_group',
  VIOLATION: 'violation',
  PENALTY: 'penalty',
  LATENESS_MONTH: 'lateness_month',
  PAYROLL_RUN: 'payroll_run',
  ACCOUNTING_SETTINGS: 'accounting_settings',
  ACCOUNTING_PAYROLL: 'accounting_payroll',
  OUTBOX_DELIVERY: 'outbox_delivery',
  NOTIFICATION_PREFERENCES: 'notification_preferences',
  NOTIFICATION_SETTINGS: 'notification_settings',
  PUSH_DEVICE: 'push_device',
  /** One employee contract (spec 2026-11-24). Its label is the employee's two names. */
  EMPLOYEE_CONTRACT: 'employee_contract',
  /** One contract year's school calendar (Settings → HR rules). Label: the year, `2026/27`. */
  SCHOOL_CALENDAR: 'school_calendar',
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
  // Too many wrong passwords locked the account's sign-in (core/sign-in-limit). Label: the email.
  'core.auth.locked_out': { module: 'core', entityType: E.USER, kind: 'access' },
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
  'core.user.unlock_sign_in': { module: 'core', entityType: E.USER, kind: 'access' },
  'core.role.create': { module: 'core', entityType: E.ROLE, kind: 'create' },
  'core.role.update': { module: 'core', entityType: E.ROLE, kind: 'update' },
  'core.role.delete': { module: 'core', entityType: E.ROLE, kind: 'status' },
  // core — must-deliver events (core/events): an admin sends a dead delivery again
  'core.outbox.retry': { module: 'core', entityType: E.OUTBOX_DELIVERY, kind: 'status' },
  // core — notifications (§11): a person's own preferences; the school's defaults and retention
  'core.notification_preferences.update': {
    module: 'core',
    entityType: E.NOTIFICATION_PREFERENCES,
    kind: 'update',
  },
  'core.notification_settings.update': {
    module: 'core',
    entityType: E.NOTIFICATION_SETTINGS,
    kind: 'update',
  },
  // core — push alerts (§11): a device that gets a person's notifications, added or removed. Not
  // read state: it decides where the school's notifications (names, approvals) go.
  'core.push_device.add': { module: 'core', entityType: E.PUSH_DEVICE, kind: 'access' },
  'core.push_device.remove': { module: 'core', entityType: E.PUSH_DEVICE, kind: 'access' },
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
  // The daily step (System): the record's contract dates moved to the contract in force (1 June).
  'hr.employee.contract_dates_move': {
    module: 'hr',
    entityType: E.EMPLOYEE,
    kind: 'update',
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
  'hr.employee_grade.create': {
    module: 'hr',
    entityType: E.EMPLOYEE_GRADE,
    kind: 'create',
  },
  'hr.employee_grade.update': {
    module: 'hr',
    entityType: E.EMPLOYEE_GRADE,
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
  // §4 two steps (owner 2026-11-21): the stage head's approval (PENDING_REVIEW → WAITING_HR) …
  'hr.penalty.review': { module: 'hr', entityType: E.PENALTY, kind: 'status' },
  // … the HR approval (WAITING_HR → APPROVED, fixing the level) …
  'hr.penalty.approve': { module: 'hr', entityType: E.PENALTY, kind: 'status' },
  // … and a rejection at either step (`rejectedStep`), with its reason.
  'hr.penalty.reject': { module: 'hr', entityType: E.PENALTY, kind: 'status' },
  'hr.penalty.cancel': { module: 'hr', entityType: E.PENALTY, kind: 'status' },
  // §4 (owner 2026-11-20): an approved penalty moved up one level by a backdated approval — one
  // entry per recounted penalty, in the approval's transaction (`recountedAfter`: that one's date).
  'hr.penalty.recount': { module: 'hr', entityType: E.PENALTY, kind: 'update' },
  // hr — contracts (spec 2026-11-24): every decision is one entry on the contract
  'hr.contract.create': { module: 'hr', entityType: E.EMPLOYEE_CONTRACT, kind: 'create' },
  'hr.contract.renew': { module: 'hr', entityType: E.EMPLOYEE_CONTRACT, kind: 'status' },
  'hr.contract.not_renew': { module: 'hr', entityType: E.EMPLOYEE_CONTRACT, kind: 'status' },
  'hr.contract.notice_record': { module: 'hr', entityType: E.EMPLOYEE_CONTRACT, kind: 'status' },
  'hr.contract.notice_withdraw': { module: 'hr', entityType: E.EMPLOYEE_CONTRACT, kind: 'status' },
  'hr.contract.early_termination_request': { module: 'hr', entityType: E.EMPLOYEE_CONTRACT, kind: 'update' },
  'hr.contract.early_termination_approve': { module: 'hr', entityType: E.EMPLOYEE_CONTRACT, kind: 'status' },
  'hr.contract.early_termination_reject': { module: 'hr', entityType: E.EMPLOYEE_CONTRACT, kind: 'status' },
  'hr.contract.end': { module: 'hr', entityType: E.EMPLOYEE_CONTRACT, kind: 'status' },
  // A renewal's next contract cancelled because the one before it ended early (it never started).
  'hr.contract.cancel': { module: 'hr', entityType: E.EMPLOYEE_CONTRACT, kind: 'status' },
  // The school's not-renewing undone before the end, with a reason: active again.
  'hr.contract.not_renew_undo': { module: 'hr', entityType: E.EMPLOYEE_CONTRACT, kind: 'status' },
  // A contract document (notice letter, request, attachment) was opened (a sensitive folder).
  'hr.contract.document_open': { module: 'hr', entityType: E.EMPLOYEE_CONTRACT, kind: 'access' },
  'hr.school_calendar.update': { module: 'hr', entityType: E.SCHOOL_CALENDAR, kind: 'update' },
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
  // hr — Accounting sent an approved run back (a draft again, with the reason, §10)
  'hr.payroll.returned': {
    module: 'hr',
    entityType: E.PAYROLL_RUN,
    kind: 'status',
  },
  // hr — Accounting marked an approved run's salaries transferred (final, §10)
  'hr.payroll.transferred': {
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
  // accounting — rules (the payroll tax rule)
  'accounting.settings.update': {
    module: 'accounting',
    entityType: E.ACCOUNTING_SETTINGS,
    kind: 'update',
  },
  // accounting — a month's taxes worked out when HR approved its payroll (by the system, §10)
  'accounting.payroll.record': {
    module: 'accounting',
    entityType: E.ACCOUNTING_PAYROLL,
    kind: 'create',
  },
  // accounting — an approved month sent back to HR (its run a draft again, the taxes dropped)
  'accounting.payroll.return': {
    module: 'accounting',
    entityType: E.ACCOUNTING_PAYROLL,
    kind: 'status',
  },
  // accounting — the salaries were transferred: the month is final, never returned to HR
  'accounting.payroll.finalize': {
    module: 'accounting',
    entityType: E.ACCOUNTING_PAYROLL,
    kind: 'status',
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
  'accounting.settings.update': 'accounting',
  'core.stage.create': 'lists',
  'core.stage.update': 'lists',
  'hr.department.create': 'lists',
  'hr.department.update': 'lists',
  'hr.job_title.create': 'lists',
  'hr.job_title.update': 'lists',
  'hr.employee_grade.create': 'lists',
  'hr.employee_grade.update': 'lists',
  'hr.penalty_group.create': 'catalogue',
  'hr.penalty_group.update': 'catalogue',
  'hr.violation.create': 'catalogue',
  'hr.violation.update': 'catalogue',
  'core.notification_settings.update': 'notifications',
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
  /**
   * The record inside the entry this line is about, when one entry covers several (a lateness
   * month: one line per employee whose minutes changed — spec edge case 7). Both names.
   */
  subject?: AuditLabel;
  /**
   * Set (and `before` / `after` left out) when the viewer may not see this field's values: a
   * salary-type field (`AUDIT_SALARY_FIELDS`) for someone without `hr.employees.view_salary` (P4).
   * Never stored — the API adds it when it answers.
   */
  hidden?: true;
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
  /** Their account's linked employee (the avatar), or null: not linked, or the account is gone. */
  employee: PersonAvatarRef | null;
}

/** `GET /audit/actors` query: everyone in the log, or only the people who touched one record. */
export interface AuditActorsQuery {
  entityType?: AuditEntityType;
  entityId?: string;
  /** Part of the person's name, any case — the pickers search here, never in the browser. */
  search?: string;
  /** One person (a picker's chosen one, the filter chip's name). */
  id?: Uuid;
  /** How many, newest activity first (≤ `AUDIT_ACTORS_MAX`; default all of them up to it). */
  limit?: number;
}

/** The most people one `GET /audit/actors` answer lists. */
export const AUDIT_ACTORS_MAX = 200;

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
 * "money" entry: the Activity page tags it and the summary counts it; the timeline draws their
 * values as money ("EGP 6,500.00"), never as the stored piastres.
 */
export const AUDIT_MONEY_FIELDS = ['basicSalary', 'insuredSalary', 'amount', 'totals', 'net'] as const;
export const AUDIT_MONEY_ACTIONS: readonly AuditAction[] = AUDIT_ACTION_KEYS.filter(
  (key) => key.startsWith('hr.payroll.') || key.startsWith('accounting.payroll.'),
);

export function isMoneyEntry(entry: Pick<AuditEntry, 'action' | 'changes'>): boolean {
  return (
    AUDIT_MONEY_ACTIONS.includes(entry.action) ||
    entry.changes.some((c) => (AUDIT_MONEY_FIELDS as readonly string[]).includes(c.field))
  );
}

/**
 * The parts of a run's `totals` (HR's `PayrollTotals`, accounting's `AccountingPayrollTotals`), in
 * the order the timeline lists them: money in piastres, counts as whole numbers. Each has a label
 * under `audit.totals.<part>`. A part not listed still reads (as a plain value), after these.
 */
export const AUDIT_TOTAL_PARTS = {
  net: 'money',
  employees: 'count',
  flagged: 'count',
  monthSalary: 'money',
  gross: 'money',
  penaltyAmount: 'money',
  latenessAmount: 'money',
  adjustmentAdditions: 'money',
  adjustmentDeductions: 'money',
  incomeTax: 'money',
  martyrTax: 'money',
  insuranceAmount: 'money',
} as const satisfies Record<string, 'money' | 'count'>;
export type AuditTotalPart = keyof typeof AUDIT_TOTAL_PARTS;

/**
 * Fields whose values are salary-type (R7): the money fields plus the employee's insured salary and
 * bank details. A viewer without `hr.employees.view_salary` (scope `all` — the log is school-wide)
 * gets these changes with `hidden: true` and no `before` / `after`: the timeline says the field
 * changed, never the values (P4).
 */
export const AUDIT_SALARY_FIELDS = [
  ...AUDIT_MONEY_FIELDS,
  'bankName',
  'bankAccountNumber',
  'iban',
  'monthSalary',
] as const;

export function isSalaryField(field: string): boolean {
  return (AUDIT_SALARY_FIELDS as readonly string[]).includes(field);
}

/** A failed sign-in: the Activity page marks it and the summary counts it. */
export const AUDIT_FAILED_SIGN_IN = 'core.auth.sign_in_failed' satisfies AuditAction;
