import type { PermissionKey } from './permissions';
import type { ScreenId } from './screens';

/*
 * Notifications (§11, spec docs/specs/2026-11-18-notifications.md). Core owns the mechanism
 * (`apps/api/src/core/notifications`); each module owns its types — declared here so both apps see
 * them — and sends through core's exported `NotificationsService`.
 *
 * A type is `<module>.<thing>.<event>`. A notification stores the type key and the values of its
 * sentence (names as `{ en, ar }`, months, counts), never a sentence: the EN / AR texts are
 * `types.<key path>` in `locales/<lang>/notifications.json` — `name` (the preferences list), `title`,
 * an optional `body`, and `group` (two or more items, N17; plural forms on `count`). The shared tests
 * fail on a type without its texts in either language.
 *
 * Adding a type: add it below with its module, category, whether it can be turned off, its default
 * channels, the permission its recipients need, its dedupe prefix and its link, then its texts.
 */

/**
 * Where a notification can go. Only `in_app` is live: later channels (email, WhatsApp, SMS) add a
 * value here and an adapter in core — modules never name a channel (N7). The UI shows none of this.
 */
export const NOTIFICATION_CHANNELS = ['in_app'] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export function isNotificationChannel(value: unknown): value is NotificationChannel {
  return typeof value === 'string' && (NOTIFICATION_CHANNELS as readonly string[]).includes(value);
}

/** `approval`: something waits for the reader and resolves when done; `reminder`: something is due. */
export const NOTIFICATION_CATEGORIES = ['approval', 'reminder'] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

export const NOTIFICATION_MODULES = ['core', 'hr'] as const;
export type NotificationModule = (typeof NOTIFICATION_MODULES)[number];

/** How a done item reads: approved / cancelled by someone, or no longer needed (`done`). */
export const NOTIFICATION_RESOLUTIONS = ['approved', 'cancelled', 'done'] as const;
export type NotificationResolution = (typeof NOTIFICATION_RESOLUTIONS)[number];

/** Who receives notifications: staff users now; parents and students (`contact`) are Planned (N6). */
export const NOTIFICATION_RECIPIENT_KINDS = ['user'] as const;
export type NotificationRecipientKind = (typeof NOTIFICATION_RECIPIENT_KINDS)[number];

/** The screen and record an item opens. `screen` is a `SCREENS` id of the web app. */
export interface NotificationLink {
  screen: ScreenId;
  recordId?: string;
  query?: Record<string, string>;
}

/** What an item is about: its record, and the employee when it concerns one (the scope re-check). */
export interface NotificationSubject {
  entityType: string;
  entityId: string;
  employeeId?: string | null;
}

export interface NotificationTypeDefinition {
  module: NotificationModule;
  category: NotificationCategory;
  /** False: always on in the app (approvals, owner 2026-11-18); a person's switch is locked. */
  canTurnOff: boolean;
  /** Channels on when neither the school nor the person chose. */
  defaultChannels: readonly NotificationChannel[];
  /** The reader must hold it, and its scope must cover the item's subject (N5, N11). */
  permission: PermissionKey;
  /** The start of every dedupe key of the type (`penalty:<id>`, N9) — see `notificationDedupeKey`. */
  dedupePrefix: string;
  /** The screen an item opens, from its subject and values. */
  link: (subject: NotificationSubject, params: Readonly<Record<string, unknown>>) => NotificationLink | null;
}

const IN_APP: readonly NotificationChannel[] = ['in_app'];

const monthOf = (params: Readonly<Record<string, unknown>>): Record<string, string> =>
  typeof params.month === 'string' ? { month: params.month } : {};

/** Every v1 type (spec → "The first types"). HR sends them (N2, N3); none is sent by core itself. */
export const NOTIFICATION_TYPES = {
  'hr.penalty.awaiting_approval': {
    module: 'hr',
    category: 'approval',
    canTurnOff: false,
    defaultChannels: IN_APP,
    permission: 'hr.penalties.approve',
    dedupePrefix: 'penalty',
    link: (s) => ({ screen: 'penalties', query: { penalty: s.entityId } }),
  },
  'hr.payroll.ready_to_approve': {
    module: 'hr',
    category: 'approval',
    canTurnOff: false,
    defaultChannels: IN_APP,
    permission: 'hr.payroll.approve',
    dedupePrefix: 'payroll_ready',
    link: (s) => ({ screen: 'payrollRun', recordId: s.entityId }),
  },
  'hr.contract.ending_soon': {
    module: 'hr',
    category: 'reminder',
    canTurnOff: true,
    defaultChannels: IN_APP,
    permission: 'hr.employees.edit',
    dedupePrefix: 'contract_end',
    link: (s) => ({ screen: 'employee', recordId: s.employeeId ?? s.entityId }),
  },
  'hr.probation.ending_soon': {
    module: 'hr',
    category: 'reminder',
    canTurnOff: true,
    defaultChannels: IN_APP,
    permission: 'hr.employees.edit',
    dedupePrefix: 'probation_end',
    link: (s) => ({ screen: 'employee', recordId: s.employeeId ?? s.entityId }),
  },
  'hr.lateness.not_entered': {
    module: 'hr',
    category: 'reminder',
    canTurnOff: true,
    defaultChannels: IN_APP,
    permission: 'hr.lateness.edit',
    dedupePrefix: 'lateness_missing',
    link: (_s, p) => ({ screen: 'lateness', query: monthOf(p) }),
  },
  'hr.payroll.not_prepared': {
    module: 'hr',
    category: 'reminder',
    canTurnOff: true,
    defaultChannels: IN_APP,
    permission: 'hr.payroll.create',
    dedupePrefix: 'payroll_missing',
    link: (_s, p) => ({ screen: 'payroll', query: monthOf(p) }),
  },
  'hr.payroll.not_approved': {
    module: 'hr',
    category: 'reminder',
    canTurnOff: true,
    defaultChannels: IN_APP,
    permission: 'hr.payroll.approve',
    dedupePrefix: 'payroll_unapproved',
    link: (s) => ({ screen: 'payrollRun', recordId: s.entityId }),
  },
} as const satisfies Record<string, NotificationTypeDefinition>;

export type NotificationTypeKey = keyof typeof NOTIFICATION_TYPES;
export const NOTIFICATION_TYPE_KEYS = Object.keys(NOTIFICATION_TYPES) as NotificationTypeKey[];

export function isNotificationTypeKey(value: unknown): value is NotificationTypeKey {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(NOTIFICATION_TYPES, value);
}

/**
 * A type's dedupe key (N9): its prefix and the parts that make the item unique —
 * `notificationDedupeKey('hr.contract.ending_soon', employeeId, '2027-05-31', 30)` →
 * `contract_end:<employeeId>:2027-05-31:30`. A second send with the same key is a no-op.
 */
export function notificationDedupeKey(
  type: NotificationTypeKey,
  ...parts: readonly (string | number)[]
): string {
  return [NOTIFICATION_TYPES[type].dedupePrefix, ...parts].join(':');
}

/** Retention bounds (days) for Settings → Notifications; defaults are in `SETTING_DEFAULTS`. */
export const NOTIFICATION_RETENTION_LIMITS = { min: 1, max: 3650 } as const;

/** Most notifications per page of `GET /notifications` (default 20). */
export const NOTIFICATIONS_PAGE = { defaultLimit: 20, maxLimit: 50 } as const;

/** The bell shows the real count up to this, then "99+" (the API always returns the real number). */
export const NOTIFICATION_BELL_MAX = 99;
