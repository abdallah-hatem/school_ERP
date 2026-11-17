import type { Language, PartTimeWorkSystem, RepetitionWindow, Weekday } from './enums';

/**
 * Setting keys. Each key is one row in `SchoolSetting` (value stored as JSON) and one row per
 * change in `SettingChange`. School-wide keys are owned by core/settings; `hr.*` keys by the HR
 * module (§7).
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
} as const;
export type HrSettingKey = (typeof HrSettingKey)[keyof typeof HrSettingKey];

export type SettingKey = SchoolSettingKey | HrSettingKey;

/**
 * History keys for HR list edits (§7: list create / edit writes a history row, scope `lists`).
 * Old / new values are item snapshots `{ id, nameEn, nameAr, sortOrder, isActive }`.
 */
export const HrListKey = {
  DEPARTMENTS: 'hr.departments',
  JOB_TITLES: 'hr.jobTitles',
} as const;
export type HrListKey = (typeof HrListKey)[keyof typeof HrListKey];

/** One lateness hour step: the `hour`-th accumulated hour costs `days`. */
export interface LatenessStep {
  hour: number;
  days: number;
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
}

/**
 * Defaults from §7, used when a key has no row yet. The school name comes from the seed, so its
 * default here is empty on purpose (no school name in code).
 */
export const SETTING_DEFAULTS: { [K in SettingKey]: SettingValueMap[K] } = {
  'school.nameEn': '',
  'school.nameAr': '',
  'school.logoUrl': null,
  'school.defaultLanguage': 'ar',
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
};

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
} as const;

/** Pagination bounds from the contract. */
export const PAGINATION = {
  defaultPage: 1,
  defaultLimit: 20,
  maxLimit: 100,
} as const;

/** Logo upload rules from the contract. */
export const LOGO_UPLOAD = {
  maxBytes: 2 * 1024 * 1024,
  mimeTypes: ['image/png', 'image/jpeg', 'image/svg+xml'],
} as const;

/** Employee code format (§3): EMP-0001. */
export const EMPLOYEE_CODE_PREFIX = 'EMP-';
export const EMPLOYEE_CODE_DIGITS = 4;
