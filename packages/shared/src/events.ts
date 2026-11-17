import type { Month, Uuid } from './types/common';

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
export interface PayrollApprovedEvent {
  runId: Uuid;
  month: Month;
  approvedById: Uuid;
  at: string;
}

// ── Settings change history (§7) ───────────────────────────────────────────

/**
 * Emitted once per changed setting key, after the write commits. Every module that owns settings
 * (core school settings, HR rules, lists, the penalty catalogue) emits it; core's listener writes
 * the history row.
 */
export const SettingsEvent = {
  CHANGED: 'settings.changed',
} as const;
export type SettingsEvent = (typeof SettingsEvent)[keyof typeof SettingsEvent];

/** Which owner changed the setting. */
export type SettingsChangeScope = 'school' | 'hr' | 'lists' | 'catalogue';
/** Every scope, at runtime. Each maps one to one onto `SettingScope` (upper-cased). */
export const SETTINGS_CHANGE_SCOPES: readonly SettingsChangeScope[] = [
  'school',
  'hr',
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
