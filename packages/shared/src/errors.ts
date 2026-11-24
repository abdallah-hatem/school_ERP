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
  /**
   * Too many requests in a short time (429, the rate limits — `docs/ARCHITECTURE.md` → Security).
   * Plural forms: the seconds until the next request is allowed are its `count`.
   */
  TOO_MANY_REQUESTS: 'TOO_MANY_REQUESTS',

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
  /**
   * Access ceiling (security review H1/H2, owner 2026-11-23): only a System admin gives or takes
   * away the System admin role, or edits, resets, deactivates or reactivates a user who holds it.
   */
  SYSTEM_ADMIN_ONLY: 'SYSTEM_ADMIN_ONLY',
  /**
   * A grant given (a role to a user, or a permission into a role) that the actor doesn't hold, or
   * holds narrower (`grantCovers` in core/permissions).
   */
  GRANT_EXCEEDS_OWN: 'GRANT_EXCEEDS_OWN',
  /** Nobody changes their own roles or their own employee record. */
  OWN_ACCESS_CHANGE: 'OWN_ACCESS_CHANGE',
  /** A non-System-admin can't edit or delete a role they hold themselves. */
  ROLE_HELD_BY_YOU: 'ROLE_HELD_BY_YOU',
  /** Only a System admin edits or deletes a role a System admin user holds. */
  ROLE_HELD_BY_SYSTEM_ADMIN: 'ROLE_HELD_BY_SYSTEM_ADMIN',
  /**
   * Only a System admin sets or changes who an account is in HR (its employee record): a stage,
   * team or self scope is anchored to it, so a link is access (security review H-1, 2026-11-23).
   */
  EMPLOYEE_LINK_ADMIN_ONLY: 'EMPLOYEE_LINK_ADMIN_ONLY',
  /**
   * Only a System admin gives a temporary password to, changes the email of, or unlocks an account
   * linked to an employee record (security review M1): taking it over would reach what it reaches.
   */
  LINKED_ACCOUNT_ADMIN_ONLY: 'LINKED_ACCOUNT_ADMIN_ONLY',
  /**
   * A role acting on pay or penalties (`PAY_AND_PENALTY_KEYS`) given to an account with no employee
   * record, by someone who isn't a System admin (M2): "your own" can't be told apart without it.
   */
  UNLINKED_PAY_ROLE: 'UNLINKED_PAY_ROLE',
  /**
   * A role edit would make it act on pay or penalties while someone holding it (active or not) has no
   * employee record (fourth review H1, fifth review Low 2). A System admin links them first.
   */
  ROLE_HAS_UNLINKED_HOLDER: 'ROLE_HAS_UNLINKED_HOLDER',

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
  /** §3 (owner 2026-11-21): an "also teaches in" stage is the main stage, repeated, or hidden. */
  INVALID_OTHER_STAGES: 'INVALID_OTHER_STAGES',
  MANAGER_LOOP: 'MANAGER_LOOP',
  MANAGER_NOT_MANAGING: 'MANAGER_NOT_MANAGING',
  /** §3 (N0): the probation end is before the hire date. */
  PROBATION_BEFORE_HIRE: 'PROBATION_BEFORE_HIRE',

  // penalties
  VIOLATION_RETIRED: 'VIOLATION_RETIRED',
  INVALID_LEVELS: 'INVALID_LEVELS',
  PENALTY_NOT_PENDING: 'PENALTY_NOT_PENDING',
  PENALTY_CANCELLED: 'PENALTY_CANCELLED',
  /**
   * §4 two steps (owner 2026-11-21): the penalty isn't at the step this action is for (another
   * reviewer or approver acted first, or it was cancelled). `data.status`: its status now.
   */
  PENALTY_WRONG_STEP: 'PENALTY_WRONG_STEP',
  /** The penalty was rejected (final): it can't be reviewed, approved, rejected or cancelled. */
  PENALTY_REJECTED: 'PENALTY_REJECTED',
  /** Nobody reviews or approves a penalty given to themselves (owner 2026-11-21). */
  PENALTY_OWN: 'PENALTY_OWN',
  /** The employee belongs to several stages: say in which one the violation happened. */
  PENALTY_STAGE_REQUIRED: 'PENALTY_STAGE_REQUIRED',
  /** The stage given isn't one of the employee's stages. */
  PENALTY_STAGE_INVALID: 'PENALTY_STAGE_INVALID',
  /** §4: a once-per-day violation already has a pending or approved penalty that day. */
  VIOLATION_ONCE_PER_DAY: 'VIOLATION_ONCE_PER_DAY',
  /**
   * §4 (owner 2026-11-20): an earlier penalty of the same violation and employee is still pending,
   * so this one can't be approved yet (approve in date order). `params.date`: the earlier one's date.
   */
  PENALTY_EARLIER_PENDING: 'PENALTY_EARLIER_PENDING',
  /**
   * The same, when that earlier penalty is in a stage the user doesn't see (security review L1):
   * nothing about it — no id, date or level — is given.
   */
  PENALTY_EARLIER_PENDING_ELSEWHERE: 'PENALTY_EARLIER_PENDING_ELSEWHERE',
  /**
   * §4 backdated penalty (owner 2026-11-20): approving it would move up approved penalties, and the
   * request didn't confirm that (`acknowledgedRecount`). `params.count`; `data.recount`: the list.
   */
  PENALTY_RECOUNT_UNCONFIRMED: 'PENALTY_RECOUNT_UNCONFIRMED',
  /** The confirmed recount differs from what approving does now. `params.count`; `data.recount`. */
  PENALTY_RECOUNT_CHANGED: 'PENALTY_RECOUNT_CHANGED',
  /**
   * A penalty it would move up sits in a month whose payroll is approved: recording (and approving)
   * the backdated penalty is refused. `params.month` (`YYYY-MM`).
   */
  PENALTY_RECOUNT_MONTH_LOCKED: 'PENALTY_RECOUNT_MONTH_LOCKED',
  /** The same, when the penalty in the approved month is in a stage the user doesn't see: no month given. */
  PENALTY_RECOUNT_MONTH_LOCKED_ELSEWHERE: 'PENALTY_RECOUNT_MONTH_LOCKED_ELSEWHERE',

  // payroll
  PAYROLL_APPROVED: 'PAYROLL_APPROVED',
  PAYROLL_NOT_APPROVED: 'PAYROLL_NOT_APPROVED',
  /** The month's salaries were transferred (Accounting finalized it): it can't go back to HR. */
  PAYROLL_FINALIZED: 'PAYROLL_FINALIZED',
  PAYROLL_RUN_EXISTS: 'PAYROLL_RUN_EXISTS',
  PENDING_PENALTIES: 'PENDING_PENALTIES',
  EMPLOYEE_NOT_IN_RUN: 'EMPLOYEE_NOT_IN_RUN',
  /** §6 separation of duties (owner 2026-11-23): nobody adds or removes an adjustment on their own line. */
  PAYROLL_OWN_LINE: 'PAYROLL_OWN_LINE',
  /** §6 (owner 2026-11-23): whoever adjusted their own line in a run can't approve that run. */
  PAYROLL_APPROVER_ADJUSTED_OWN_LINE: 'PAYROLL_APPROVER_ADJUSTED_OWN_LINE',
  /**
   * §6 (owner 2026-11-23): nobody changes their own pay — the salary, work system, insurance and
   * bank fields of their own employee record, or their own lateness.
   */
  OWN_PAY_CHANGE: 'OWN_PAY_CHANGE',
  /**
   * §6 (owner 2026-11-23): someone who isn't a System admin acts on pay (adjusts or approves payroll,
   * edits a salary) only once their account is linked to their employee record.
   */
  ACCOUNT_NOT_LINKED: 'ACCOUNT_NOT_LINKED',

  // contracts (spec 2026-11-24)
  /** Nobody renews, ends or decides on their own contract — a System admin neither (§2). */
  OWN_CONTRACT: 'OWN_CONTRACT',
  /** The contract was renewed already (edge cases 1, 4). */
  CONTRACT_ALREADY_RENEWED: 'CONTRACT_ALREADY_RENEWED',
  /** The contract already has a decision (not renewed, or ended). */
  CONTRACT_DECIDED: 'CONTRACT_DECIDED',
  /** An early termination request waits for a decision: approve or reject it first. */
  EARLY_TERMINATION_PENDING: 'EARLY_TERMINATION_PENDING',
  /** There is no employee's notice on the contract to withdraw. */
  CONTRACT_NO_NOTICE: 'CONTRACT_NO_NOTICE',
  /** The contract's end has passed: its notice can't be withdrawn. */
  CONTRACT_ENDED: 'CONTRACT_ENDED',
  /** An end date must be today or later, not before the contract's start and not after its end. */
  CONTRACT_END_DATE_INVALID: 'CONTRACT_END_DATE_INVALID',
  /** Ending on that date would cut into a month whose payroll is approved (edge case 9). `params.month`. */
  CONTRACT_END_MONTH_LOCKED: 'CONTRACT_END_MONTH_LOCKED',
  /** Bulk renew: some rows can't be renewed, so nothing was (edge case 3). `params.count`; `data.refused`. */
  CONTRACTS_NOT_RENEWABLE: 'CONTRACTS_NOT_RENEWABLE',
  /** An early termination request is recorded from the first day of term 1 to its last day. */
  EARLY_TERMINATION_OUTSIDE_WINDOW: 'EARLY_TERMINATION_OUTSIDE_WINDOW',
  /** No early termination request waits on this contract (a rejected one can't be re-approved, edge case 8). */
  EARLY_TERMINATION_NOT_PENDING: 'EARLY_TERMINATION_NOT_PENDING',
  /** The contract year's school calendar isn't set (edge case 7): the last day of term 1 is unknown. */
  SCHOOL_CALENDAR_NOT_SET: 'SCHOOL_CALENDAR_NOT_SET',
  /** The calendar's dates must be inside the contract year and in order. */
  SCHOOL_CALENDAR_INVALID: 'SCHOOL_CALENDAR_INVALID',
  /** Only employees whose contract was not renewed or ended, and whose last day passed, are deactivated from Contracts. */
  CONTRACT_NOT_TO_DEACTIVATE: 'CONTRACT_NOT_TO_DEACTIVATE',
  /** The file wasn't uploaded for this contract (`POST /hr/contracts/:id/files`). */
  CONTRACT_FILE_INVALID: 'CONTRACT_FILE_INVALID',

  // audit log
  /** An `@Audited` handler finished without recording its action (D6b); the change rolled back. */
  AUDIT_NOT_RECORDED: 'AUDIT_NOT_RECORDED',

  // events (core/events)
  /** Only a dead outbox delivery can be retried. */
  OUTBOX_NOT_DEAD: 'OUTBOX_NOT_DEAD',

  // notifications (core/notifications, §11)
  /** A type that can't be turned off (approvals) can't be switched off in the app (409). */
  NOTIFICATION_TYPE_REQUIRED: 'NOTIFICATION_TYPE_REQUIRED',
  /**
   * A channel that can't be used for this (409): a per-type switch on anything but `in_app` (push
   * follows the in-app switch), or a device added for alerts while the server has no VAPID keys.
   */
  CHANNEL_NOT_AVAILABLE: 'CHANNEL_NOT_AVAILABLE',
} as const;
export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];
export const ERROR_CODES = Object.values(ErrorCode) as ErrorCode[];

/**
 * Values for an error's message, sent as the envelope's `params` (e.g. `TOO_MANY_ATTEMPTS` →
 * `{ count: 12 }`, the minutes left). `count` picks the message's plural form.
 */
export type ErrorParams = Record<string, string | number>;
