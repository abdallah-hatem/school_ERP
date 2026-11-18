import type { Month, Uuid } from './types/common';
import type { PayrollTotals } from './types/payroll-totals';

/** Event names: `<module>.<thing>.<past-tense>` (docs/ARCHITECTURE.md). */
export const HrEvent = {
  EMPLOYEE_HIRED: 'employee.hired',
  EMPLOYEE_UPDATED: 'employee.updated',
  EMPLOYEE_DEACTIVATED: 'employee.deactivated',
  PAYROLL_APPROVED: 'payroll.approved',
} as const;
export type HrEvent = (typeof HrEvent)[keyof typeof HrEvent];

export interface EmployeeHiredEvent {
  employeeId: Uuid;
  at: string;
}
export interface EmployeeUpdatedEvent {
  employeeId: Uuid;
  at: string;
}
export interface EmployeeDeactivatedEvent {
  employeeId: Uuid;
  at: string;
}
/** Emitted after an approval commits (§6). Accounting works out the month's taxes from it (§10). */
export interface PayrollApprovedEvent {
  runId: Uuid;
  month: Month;
  totals: PayrollTotals;
  approvedById: Uuid | null;
  at: string;
}

// ── Settings change history (§7) ───────────────────────────────────────────

/**
 * Emitted once per changed setting key, after the write commits. Every module that owns settings
 * (core school settings, HR rules, lists, the penalty catalogue) emits it. A notice only: the
 * history row is already written, in the change's own transaction (core/settings).
 */
export const SettingsEvent = {
  CHANGED: 'settings.changed',
} as const;
export type SettingsEvent = (typeof SettingsEvent)[keyof typeof SettingsEvent];

/** Which owner changed the setting. */
export type SettingsChangeScope = 'school' | 'hr' | 'accounting' | 'lists' | 'catalogue';
/** Every scope, at runtime. Each maps one to one onto `SettingScope` (upper-cased). */
export const SETTINGS_CHANGE_SCOPES: readonly SettingsChangeScope[] = [
  'school',
  'hr',
  'accounting',
  'lists',
  'catalogue',
];

export interface SettingsChangedEvent {
  scope: SettingsChangeScope;
  key: string;
  oldValue: unknown;
  newValue: unknown;
  changedById: Uuid | null;
  /** ISO 8601 timestamp. */
  changedAt: string;
}

// ── User accounts (core/users, P2) ─────────────────────────────────────────

export const CoreEvent = {
  /**
   * A user's sessions must end now (deactivated, or given a temporary password — R9, edge
   * case 6). core/auth revokes their refresh tokens; the access token is refused already because
   * every request re-reads the user.
   */
  USER_SESSIONS_ENDED: 'core.user.sessions_ended',
} as const;
export type CoreEvent = (typeof CoreEvent)[keyof typeof CoreEvent];

export interface UserSessionsEndedEvent {
  userId: Uuid;
  reason: 'deactivated' | 'temporary_password';
  at: string;
}
