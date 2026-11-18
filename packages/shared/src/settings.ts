import type { Language, PartTimeWorkSystem, RepetitionWindow, Weekday } from './enums';
import type { Piastres } from './types/common';

/**
 * Setting keys. Each key is one row in `SchoolSetting` (value stored as JSON) and one row per
 * change in `SettingChange`. School-wide keys are owned by core/settings; `hr.*` keys by the HR
 * module (§7); `accounting.*` keys by the accounting module (§10).
 */
export const SchoolSettingKey = {
  NAME_EN: 'school.nameEn',
  NAME_AR: 'school.nameAr',
  LOGO_URL: 'school.logoUrl',
  DEFAULT_LANGUAGE: 'school.defaultLanguage',
  WORK_START: 'school.workStart',
  WORK_END: 'school.workEnd',
  WORKING_DAYS: 'school.workingDays',
} as const;
export type SchoolSettingKey = (typeof SchoolSettingKey)[keyof typeof SchoolSettingKey];

export const HrSettingKey = {
  LATENESS_GRACE_MINUTES: 'hr.lateness.graceMinutes',
  LATENESS_STEPS: 'hr.lateness.steps',
  LATENESS_EXTRA_HOUR_DAYS: 'hr.lateness.extraHourDays',
  PAYROLL_DAY_DIVISOR: 'hr.payroll.dayDivisor',
  PAYROLL_PART_TIME: 'hr.payroll.partTime',
  PENALTIES_REPETITION_WINDOW: 'hr.penalties.repetitionWindow',
  /** §3, §7 (N0): a new employee's probation length; 0 = no probation. */
  EMPLOYEES_DEFAULT_PROBATION_MONTHS: 'hr.employees.defaultProbationMonths',
} as const;
export type HrSettingKey = (typeof HrSettingKey)[keyof typeof HrSettingKey];

/** Accounting's rule settings (§10): the payroll tax rule. */
export const AccountingSettingKey = {
  PAYROLL_TAX_BRACKETS: 'accounting.payroll.taxBrackets',
  PAYROLL_MARTYR_PERCENT: 'accounting.payroll.martyrPercent',
  PAYROLL_INSURANCE_PERCENT: 'accounting.payroll.insurancePercent',
} as const;
export type AccountingSettingKey = (typeof AccountingSettingKey)[keyof typeof AccountingSettingKey];

/**
 * Sign-in limits (core/sign-in-limit, owner 2026-11-18): `maxAttempts` wrong passwords within
 * `windowMinutes` lock that account's sign-in for `lockMinutes`. Per account only, never per IP.
 */
export const SecuritySettingKey = {
  LOGIN_MAX_ATTEMPTS: 'security.login.maxAttempts',
  LOGIN_WINDOW_MINUTES: 'security.login.windowMinutes',
  LOGIN_LOCK_MINUTES: 'security.login.lockMinutes',
} as const;
export type SecuritySettingKey = (typeof SecuritySettingKey)[keyof typeof SecuritySettingKey];

/**
 * Notification retention (core/notifications, §11, DECIDED owner 2026-11-18): read notifications are
 * deleted `readDays` after they were read, resolved ones `resolvedDays` after they were resolved, and
 * any notification after `maxDays` — by the nightly `core.notifications.purge` job.
 */
export const NotificationSettingKey = {
  RETENTION_READ_DAYS: 'notifications.retention.readDays',
  RETENTION_RESOLVED_DAYS: 'notifications.retention.resolvedDays',
  RETENTION_MAX_DAYS: 'notifications.retention.maxDays',
} as const;
export type NotificationSettingKey =
  (typeof NotificationSettingKey)[keyof typeof NotificationSettingKey];

export type SettingKey =
  | SchoolSettingKey
  | HrSettingKey
  | AccountingSettingKey
  | SecuritySettingKey
  | NotificationSettingKey;

/**
 * History keys for HR list edits (§7: list create / edit writes a history row, scope `lists`).
 * Old / new values are item snapshots `{ id, nameEn, nameAr, sortOrder, isActive }`.
 */
export const HrListKey = {
  DEPARTMENTS: 'hr.departments',
  JOB_TITLES: 'hr.jobTitles',
} as const;
export type HrListKey = (typeof HrListKey)[keyof typeof HrListKey];

/**
 * History keys for penalty catalogue edits (§7: catalogue edits write history, scope `catalogue`).
 * Old / new values are snapshots: a group `{ id, nameEn, nameAr, sortOrder, isActive }`, a
 * violation `{ id, groupId, nameEn, nameAr, note, isActive, levels }`. `null` old value = created.
 */
export const HrCatalogueKey = {
  PENALTY_GROUPS: 'hr.penaltyGroups',
  VIOLATIONS: 'hr.violations',
} as const;
export type HrCatalogueKey = (typeof HrCatalogueKey)[keyof typeof HrCatalogueKey];

/** One lateness hour step: the `hour`-th accumulated hour costs `days`. */
export interface LatenessStep {
  hour: number;
  days: number;
}

/**
 * One monthly income-tax slice (§10): the next `width` piastres of taxable pay are taxed at
 * `percent` (0–100, up to 2 decimals). Only the last slice is open-ended (`width` null).
 */
export interface TaxBracket {
  width: Piastres | null;
  percent: number;
}

/** Value type stored under each key. */
export interface SettingValueMap {
  'school.nameEn': string;
  'school.nameAr': string;
  'school.logoUrl': string | null;
  'school.defaultLanguage': Language;
  'school.workStart': string;
  'school.workEnd': string;
  'school.workingDays': Weekday[];
  'hr.lateness.graceMinutes': number;
  'hr.lateness.steps': LatenessStep[];
  'hr.lateness.extraHourDays': number;
  'hr.payroll.dayDivisor': number;
  'hr.payroll.partTime': Record<PartTimeWorkSystem, number>;
  'hr.penalties.repetitionWindow': RepetitionWindow;
  'hr.employees.defaultProbationMonths': number;
  'accounting.payroll.taxBrackets': TaxBracket[];
  'accounting.payroll.martyrPercent': number;
  'accounting.payroll.insurancePercent': number;
  'security.login.maxAttempts': number;
  'security.login.windowMinutes': number;
  'security.login.lockMinutes': number;
  'notifications.retention.readDays': number;
  'notifications.retention.resolvedDays': number;
  'notifications.retention.maxDays': number;
}

/**
 * Defaults from §7, used when a key has no row yet. The school name comes from the seed, so its
 * default here is empty on purpose (no school name in code).
 */
export const SETTING_DEFAULTS: { [K in SettingKey]: SettingValueMap[K] } = {
  'school.nameEn': '',
  'school.nameAr': '',
  'school.logoUrl': null,
  'school.defaultLanguage': 'en',
  'school.workStart': '07:30',
  'school.workEnd': '15:00',
  'school.workingDays': ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY'],
  'hr.lateness.graceMinutes': 0,
  'hr.lateness.steps': [
    { hour: 1, days: 0.25 },
    { hour: 2, days: 0.5 },
  ],
  'hr.lateness.extraHourDays': 0.5,
  'hr.payroll.dayDivisor': 30,
  'hr.payroll.partTime': { PART_TIME_4: 80, PART_TIME_3: 60, PART_TIME_2: 40 },
  'hr.penalties.repetitionWindow': 'CONTRACT_YEAR',
  // §7 (owner 2026-11-18): 3 months; 0 = no probation.
  'hr.employees.defaultProbationMonths': 3,
  // §10 GUESS (the school's previous HR system; to confirm with the accountant): Egypt's annual
  // scale ÷ 12 — 60,000 at 0%, 15,000 at 10%, 15,000 at 15%, 130,000 at 20%, 200,000 at 22.5%,
  // the rest at 25%.
  'accounting.payroll.taxBrackets': [
    { width: 500_000, percent: 0 },
    { width: 125_000, percent: 10 },
    { width: 125_000, percent: 15 },
    { width: 1_083_333, percent: 20 },
    { width: 1_666_667, percent: 22.5 },
    { width: null, percent: 25 },
  ],
  'accounting.payroll.martyrPercent': 0.05,
  'accounting.payroll.insurancePercent': 11,
  // Sign-in limits (owner 2026-11-18): 5 wrong passwords in 15 minutes lock sign-in for 15 minutes.
  'security.login.maxAttempts': 5,
  'security.login.windowMinutes': 15,
  'security.login.lockMinutes': 15,
  // Notification retention (owner 2026-11-18): read 90 days, resolved 30 days, anything 365 days.
  'notifications.retention.readDays': 90,
  'notifications.retention.resolvedDays': 30,
  'notifications.retention.maxDays': 365,
};

/**
 * The school's time zone: scheduled jobs run on its clock and the audit screens read dates in it.
 * One school per deployment; a time-zone setting can replace this later (no per-school code).
 */
export const SCHOOL_TIME_ZONE = 'Africa/Cairo';

/** Validation bounds from §7. */
export const SETTING_LIMITS = {
  percentMin: 1,
  percentMax: 100,
  dayDivisorMin: 1,
  dayDivisorMax: 31,
  daysStep: 0.25,
  daysMin: 0,
  daysMax: 30,
  latenessMinutesMax: 6000,
  probationMonthsMin: 0,
  probationMonthsMax: 6,
} as const;

/**
 * Work start / end (§7, DECIDED owner 2026-11-17): times sit on a 30-minute boundary. The screen
 * offers `earliest` … `latest` in `stepMinutes` steps; the API checks only the boundary.
 */
export const WORK_TIME = {
  stepMinutes: 30,
  earliest: '05:00',
  latest: '20:00',
} as const;

/** Pagination bounds from the contract. */
export const PAGINATION = {
  defaultPage: 1,
  defaultLimit: 10,
  maxLimit: 100,
} as const;

/** Logo upload rules from the contract. */
export const LOGO_UPLOAD = {
  maxBytes: 2 * 1024 * 1024,
  mimeTypes: ['image/png', 'image/jpeg', 'image/svg+xml'],
} as const;

/** Employee photo upload rules (§3): PNG, JPG or WebP, up to 2 MB. Served signed-in only. */
export const EMPLOYEE_PHOTO_UPLOAD = {
  maxBytes: 2 * 1024 * 1024,
  mimeTypes: ['image/png', 'image/jpeg', 'image/webp'],
} as const;

/** Employee code format (§3): EMP-0001. */
export const EMPLOYEE_CODE_PREFIX = 'EMP-';
export const EMPLOYEE_CODE_DIGITS = 4;
