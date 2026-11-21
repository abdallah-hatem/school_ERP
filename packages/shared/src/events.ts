import type { Month, Uuid } from './types/common';
import type { PayrollTotals } from './types/payroll-totals';

/*
 * Domain events (docs/ARCHITECTURE.md → How modules talk to each other; catalogue in
 * docs/EVENTS.md). Names are `<module>.<thing>.<past-tense>`. Every event has one payload type in
 * `DomainEventMap`, and the API's `DomainEvents.publish(name, payload, options)` takes only these:
 * a wrong name or payload fails typecheck.
 *
 * Two kinds. **Must-deliver** (`MUST_DELIVER_EVENTS`): losing it would leave data wrong or someone
 * not told — written to the outbox in the change's transaction and delivered, with retries, to every
 * outbox listener. **Fire-and-forget**: in memory after the commit (a cache refresh, a notice).
 * Payloads are plain JSON (dates as ISO strings): must-deliver ones are stored as JSON.
 */

// ── hr ─────────────────────────────────────────────────────────────────────

export const HrEvent = {
  EMPLOYEE_HIRED: 'hr.employee.hired',
  EMPLOYEE_UPDATED: 'hr.employee.updated',
  EMPLOYEE_DEACTIVATED: 'hr.employee.deactivated',
  PAYROLL_APPROVED: 'hr.payroll.approved',
} as const;
export type HrEvent = (typeof HrEvent)[keyof typeof HrEvent];

/** A new employee record was created (§3). */
export interface EmployeeHiredEvent {
  employeeId: Uuid;
  /** `YYYY-MM-DD`. */
  hireDate: string;
  at: string;
}
/** An employee record changed (an edit, a photo, a reactivation) — only when something did. */
export interface EmployeeUpdatedEvent {
  employeeId: Uuid;
  /** The fields whose values changed (the audit snapshot's field names, e.g. `basicSalary`). */
  fields: string[];
  at: string;
}
/** An employee went ACTIVE → INACTIVE (§3). Must-deliver: academics will unassign them. */
export interface EmployeeDeactivatedEvent {
  employeeId: Uuid;
  at: string;
}
/** A payroll month was approved (§6). Must-deliver: accounting works out its taxes from it (§10). */
export interface PayrollApprovedEvent {
  runId: Uuid;
  month: Month;
  totals: PayrollTotals;
  approvedById: Uuid | null;
  at: string;
}

// ── core: settings (§7) ────────────────────────────────────────────────────

/**
 * Published once per changed setting key, after the write commits. Every module that owns settings
 * (core school settings, HR rules, lists, the penalty catalogue, accounting) publishes it. A notice
 * only: the history row is already written, in the change's own transaction (core/settings).
 */
export const SettingsEvent = {
  CHANGED: 'core.settings.changed',
} as const;
export type SettingsEvent = (typeof SettingsEvent)[keyof typeof SettingsEvent];

/** Which owner changed the setting. */
export type SettingsChangeScope =
  | 'school'
  | 'hr'
  | 'accounting'
  | 'lists'
  | 'catalogue'
  | 'notifications';
/** Every scope, at runtime. Each maps one to one onto `SettingScope` (upper-cased). */
export const SETTINGS_CHANGE_SCOPES: readonly SettingsChangeScope[] = [
  'school',
  'hr',
  'accounting',
  'lists',
  'catalogue',
  'notifications',
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

// ── core: user accounts (P2) ───────────────────────────────────────────────

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

// ── core: notifications (§11) ──────────────────────────────────────────────

export const NotificationEvent = {
  /**
   * An item reached a person's bell and they have alerts on at least one device (owner,
   * 2026-11-21): core/notifications sends the Web Push after the commit, through the outbox, so a
   * push service that is down is retried and never slows down or fails the change.
   */
  PUSH_REQUESTED: 'core.notification.push_requested',
} as const;
export type NotificationEvent = (typeof NotificationEvent)[keyof typeof NotificationEvent];

/** Ids only: the listener reads the notification as its reader sees it now (N11). */
export interface NotificationPushRequestedEvent {
  notificationId: Uuid;
  recipientId: Uuid;
  at: string;
}

// ── the map ────────────────────────────────────────────────────────────────

/** Every event name → its payload. `DomainEvents.publish` and the listener decorators use it. */
export interface DomainEventMap {
  [HrEvent.EMPLOYEE_HIRED]: EmployeeHiredEvent;
  [HrEvent.EMPLOYEE_UPDATED]: EmployeeUpdatedEvent;
  [HrEvent.EMPLOYEE_DEACTIVATED]: EmployeeDeactivatedEvent;
  [HrEvent.PAYROLL_APPROVED]: PayrollApprovedEvent;
  [SettingsEvent.CHANGED]: SettingsChangedEvent;
  [CoreEvent.USER_SESSIONS_ENDED]: UserSessionsEndedEvent;
  [NotificationEvent.PUSH_REQUESTED]: NotificationPushRequestedEvent;
}
export type DomainEventName = keyof DomainEventMap;

/** Every event name, at runtime. */
export const DOMAIN_EVENT_NAMES: readonly DomainEventName[] = [
  ...Object.values(HrEvent),
  ...Object.values(SettingsEvent),
  ...Object.values(CoreEvent),
  ...Object.values(NotificationEvent),
];

/**
 * The events that go through the outbox. Rule (owner, 2026-11-18): if losing it leaves data wrong
 * or someone not told, it is must-deliver (every notification event will be).
 */
export const MUST_DELIVER_EVENTS = [
  HrEvent.PAYROLL_APPROVED,
  HrEvent.EMPLOYEE_DEACTIVATED,
  NotificationEvent.PUSH_REQUESTED,
] as const;
export type MustDeliverEventName = (typeof MUST_DELIVER_EVENTS)[number];
export type FireAndForgetEventName = Exclude<DomainEventName, MustDeliverEventName>;

export function isMustDeliver(name: DomainEventName): name is MustDeliverEventName {
  return (MUST_DELIVER_EVENTS as readonly string[]).includes(name);
}

// ── the outbox (core/events) ───────────────────────────────────────────────

/** A must-deliver event's state, and each of its deliveries' (one per outbox listener). */
export const OUTBOX_STATUSES = ['pending', 'delivered', 'dead'] as const;
export type OutboxStatus = (typeof OUTBOX_STATUSES)[number];

/** One delivery as the admin endpoints show it (`GET /outbox/deliveries`). */
export interface OutboxDeliveryView {
  id: Uuid;
  eventId: Uuid;
  eventName: string;
  listener: string;
  status: OutboxStatus;
  attempts: number;
  nextAttemptAt: string;
  lastError: string | null;
  deliveredAt: string | null;
  createdAt: string;
}
