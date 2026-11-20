/**
 * Stable error codes carried in the envelope's `error` field. The client keys UI off these;
 * the translated `message` comes from `errors.<CODE>` in the locale files.
 */
export const ErrorCode = {
  // generic
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  BAD_REQUEST: 'BAD_REQUEST',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  UNIQUE_VIOLATION: 'UNIQUE_VIOLATION',
  FOREIGN_KEY_VIOLATION: 'FOREIGN_KEY_VIOLATION',
  RELATION_VIOLATION: 'RELATION_VIOLATION',
  PRISMA_VALIDATION: 'PRISMA_VALIDATION',
  INTERNAL_ERROR: 'INTERNAL_ERROR',

  // auth
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  INVALID_REFRESH_TOKEN: 'INVALID_REFRESH_TOKEN',
  /**
   * Sign-in is locked after too many wrong passwords (429). The message has plural forms: the
   * minutes left are its `count`, and the envelope carries them as `retryAfterMinutes`.
   */
  TOO_MANY_ATTEMPTS: 'TOO_MANY_ATTEMPTS',

  // users and roles (P2)
  /** Would leave the school without an active System admin (R8, edge case 5). */
  LAST_SYSTEM_ADMIN: 'LAST_SYSTEM_ADMIN',
  EMAIL_TAKEN: 'EMAIL_TAKEN',
  WRONG_PASSWORD: 'WRONG_PASSWORD',
  UNKNOWN_ROLE: 'UNKNOWN_ROLE',
  UNKNOWN_EMPLOYEE: 'UNKNOWN_EMPLOYEE',
  EMPLOYEE_ALREADY_LINKED: 'EMPLOYEE_ALREADY_LINKED',
  /** The System admin role can't be deleted (owner 2026-11-19); every other role can, once unused. */
  SYSTEM_ADMIN_UNDELETABLE: 'SYSTEM_ADMIN_UNDELETABLE',
  ROLE_IN_USE: 'ROLE_IN_USE',
  SYSTEM_ADMIN_FIXED: 'SYSTEM_ADMIN_FIXED',
  DUPLICATE_PERMISSION: 'DUPLICATE_PERMISSION',
  /** A scope other than `all` on a permission that is about the whole school (P3). */
  INVALID_SCOPE: 'INVALID_SCOPE',
  /** Signed in with a temporary password: only `/auth/me`, sign-out and a new password (P3). */
  PASSWORD_CHANGE_REQUIRED: 'PASSWORD_CHANGE_REQUIRED',
  /** The new password is the one already in use (the temporary one, after a reset). */
  SAME_PASSWORD: 'SAME_PASSWORD',

  // settings and files
  INVALID_WORK_HOURS: 'INVALID_WORK_HOURS',
  /** §7: the merged tax rule breaks a rule `taxRuleIssues` checks (e.g. bracket % + fund ≥ 100). */
  INVALID_TAX_RULE: 'INVALID_TAX_RULE',
  /** §11 (N3): the second contract reminder isn't fewer days before the end than the first. */
  INVALID_REMINDER_DAYS: 'INVALID_REMINDER_DAYS',
  INVALID_FILE_TYPE: 'INVALID_FILE_TYPE',
  FILE_TOO_LARGE: 'FILE_TOO_LARGE',

  // lists
  LIST_ITEM_HIDDEN: 'LIST_ITEM_HIDDEN',

  // employees
  EMPLOYEE_INACTIVE: 'EMPLOYEE_INACTIVE',
  DUPLICATE_NATIONAL_ID: 'DUPLICATE_NATIONAL_ID',
  DUPLICATE_FINGERPRINT_ID: 'DUPLICATE_FINGERPRINT_ID',
  DUPLICATE_INSURANCE_NUMBER: 'DUPLICATE_INSURANCE_NUMBER',
  INVALID_MANAGER: 'INVALID_MANAGER',
  MANAGER_LOOP: 'MANAGER_LOOP',
  MANAGER_NOT_MANAGING: 'MANAGER_NOT_MANAGING',
  /** §3 (N0): the probation end is before the hire date. */
  PROBATION_BEFORE_HIRE: 'PROBATION_BEFORE_HIRE',

  // penalties
  VIOLATION_RETIRED: 'VIOLATION_RETIRED',
  INVALID_LEVELS: 'INVALID_LEVELS',
  PENALTY_NOT_PENDING: 'PENALTY_NOT_PENDING',
  PENALTY_CANCELLED: 'PENALTY_CANCELLED',
  /** §4: a once-per-day violation already has a pending or approved penalty that day. */
  VIOLATION_ONCE_PER_DAY: 'VIOLATION_ONCE_PER_DAY',
  /**
   * §4 (owner 2026-11-20): an earlier penalty of the same violation and employee is still pending,
   * so this one can't be approved yet (approve in date order). `params.date`: the earlier one's date.
   */
  PENALTY_EARLIER_PENDING: 'PENALTY_EARLIER_PENDING',

  // payroll
  PAYROLL_APPROVED: 'PAYROLL_APPROVED',
  PAYROLL_NOT_APPROVED: 'PAYROLL_NOT_APPROVED',
  /** The month's salaries were transferred (Accounting finalized it): it can't go back to HR. */
  PAYROLL_FINALIZED: 'PAYROLL_FINALIZED',
  PAYROLL_RUN_EXISTS: 'PAYROLL_RUN_EXISTS',
  PENDING_PENALTIES: 'PENDING_PENALTIES',
  EMPLOYEE_NOT_IN_RUN: 'EMPLOYEE_NOT_IN_RUN',

  // audit log
  /** An `@Audited` handler finished without recording its action (D6b); the change rolled back. */
  AUDIT_NOT_RECORDED: 'AUDIT_NOT_RECORDED',

  // events (core/events)
  /** Only a dead outbox delivery can be retried. */
  OUTBOX_NOT_DEAD: 'OUTBOX_NOT_DEAD',

  // notifications (core/notifications, §11)
  /** A type that can't be turned off (approvals) can't be switched off in the app (409). */
  NOTIFICATION_TYPE_REQUIRED: 'NOTIFICATION_TYPE_REQUIRED',
  /** A channel that isn't live — anything but `in_app` today (409). */
  CHANNEL_NOT_AVAILABLE: 'CHANNEL_NOT_AVAILABLE',
} as const;
export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];
export const ERROR_CODES = Object.values(ErrorCode) as ErrorCode[];

/**
 * Values for an error's message, sent as the envelope's `params` (e.g. `TOO_MANY_ATTEMPTS` →
 * `{ count: 12 }`, the minutes left). `count` picks the message's plural form.
 */
export type ErrorParams = Record<string, string | number>;
