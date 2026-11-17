/**
 * Shared enums. Each is a `const` object (usable at runtime, e.g. in validators) plus a
 * string-union type of the same name. Values match the Prisma enums one to one.
 */

const values = <T extends Record<string, string>>(o: T) => Object.values(o) as T[keyof T][];

export const WorkSystem = {
  FULL_TIME: 'FULL_TIME',
  PART_TIME_4: 'PART_TIME_4',
  PART_TIME_3: 'PART_TIME_3',
  PART_TIME_2: 'PART_TIME_2',
} as const;
export type WorkSystem = (typeof WorkSystem)[keyof typeof WorkSystem];
export const WORK_SYSTEMS = values(WorkSystem);

/** Part-time work systems — the keys of the payroll part-time percentage setting. */
export const PART_TIME_WORK_SYSTEMS = [
  WorkSystem.PART_TIME_4,
  WorkSystem.PART_TIME_3,
  WorkSystem.PART_TIME_2,
] as const;
export type PartTimeWorkSystem = (typeof PART_TIME_WORK_SYSTEMS)[number];

export const Gender = {
  MALE: 'MALE',
  FEMALE: 'FEMALE',
} as const;
export type Gender = (typeof Gender)[keyof typeof Gender];
export const GENDERS = values(Gender);

export const EmployeeStatus = {
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
} as const;
export type EmployeeStatus = (typeof EmployeeStatus)[keyof typeof EmployeeStatus];
export const EMPLOYEE_STATUSES = values(EmployeeStatus);

/** §3 social insurance status. Not insured clears the number, registration date and salary. */
export const InsuranceStatus = {
  INSURED: 'INSURED',
  NOT_INSURED: 'NOT_INSURED',
} as const;
export type InsuranceStatus = (typeof InsuranceStatus)[keyof typeof InsuranceStatus];
export const INSURANCE_STATUSES = values(InsuranceStatus);

/** §3 highest qualification, lowest first (the order the picker shows). */
export const Degree = {
  NONE: 'NONE',
  SECONDARY: 'SECONDARY',
  DIPLOMA: 'DIPLOMA',
  BACHELOR: 'BACHELOR',
  MASTER: 'MASTER',
  DOCTORATE: 'DOCTORATE',
} as const;
export type Degree = (typeof Degree)[keyof typeof Degree];
export const DEGREES = values(Degree);

export const PenaltyAction = {
  NOTICE: 'NOTICE',
  WARNING: 'WARNING',
  DEDUCT_DAYS: 'DEDUCT_DAYS',
  INVESTIGATION: 'INVESTIGATION',
  RAISE_HALF_LOSS: 'RAISE_HALF_LOSS',
  RAISE_LOSS: 'RAISE_LOSS',
  RAISE_DEFER_3M: 'RAISE_DEFER_3M',
  PAY_CUT: 'PAY_CUT',
  DEMOTION: 'DEMOTION',
  DISMISSAL: 'DISMISSAL',
} as const;
export type PenaltyAction = (typeof PenaltyAction)[keyof typeof PenaltyAction];
export const PENALTY_ACTIONS = values(PenaltyAction);

/** `days` is required (> 0) for DEDUCT_DAYS, optional for INVESTIGATION, absent otherwise. */
export const PENALTY_ACTIONS_REQUIRING_DAYS: readonly PenaltyAction[] = [PenaltyAction.DEDUCT_DAYS];
export const PENALTY_ACTIONS_ALLOWING_DAYS: readonly PenaltyAction[] = [
  PenaltyAction.DEDUCT_DAYS,
  PenaltyAction.INVESTIGATION,
];

export const PenaltyStatus = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  CANCELLED: 'CANCELLED',
} as const;
export type PenaltyStatus = (typeof PenaltyStatus)[keyof typeof PenaltyStatus];
export const PENALTY_STATUSES = values(PenaltyStatus);

export const PayrollStatus = {
  DRAFT: 'DRAFT',
  APPROVED: 'APPROVED',
} as const;
export type PayrollStatus = (typeof PayrollStatus)[keyof typeof PayrollStatus];
export const PAYROLL_STATUSES = values(PayrollStatus);

export const AdjustmentType = {
  ADDITION: 'ADDITION',
  DEDUCTION: 'DEDUCTION',
} as const;
export type AdjustmentType = (typeof AdjustmentType)[keyof typeof AdjustmentType];
export const ADJUSTMENT_TYPES = values(AdjustmentType);

export const RepetitionWindow = {
  CONTRACT_YEAR: 'CONTRACT_YEAR',
  CALENDAR_YEAR: 'CALENDAR_YEAR',
  ROLLING_12_MONTHS: 'ROLLING_12_MONTHS',
} as const;
export type RepetitionWindow = (typeof RepetitionWindow)[keyof typeof RepetitionWindow];
export const REPETITION_WINDOWS = values(RepetitionWindow);

export const PayrollFlag = {
  NET_FLOORED: 'NET_FLOORED',
  PENDING_PENALTIES: 'PENDING_PENALTIES',
} as const;
export type PayrollFlag = (typeof PayrollFlag)[keyof typeof PayrollFlag];
export const PAYROLL_FLAGS = values(PayrollFlag);

export const Language = {
  AR: 'ar',
  EN: 'en',
} as const;
export type Language = (typeof Language)[keyof typeof Language];
export const LANGUAGES = values(Language);

export const Weekday = {
  SUNDAY: 'SUNDAY',
  MONDAY: 'MONDAY',
  TUESDAY: 'TUESDAY',
  WEDNESDAY: 'WEDNESDAY',
  THURSDAY: 'THURSDAY',
  FRIDAY: 'FRIDAY',
  SATURDAY: 'SATURDAY',
} as const;
export type Weekday = (typeof Weekday)[keyof typeof Weekday];
export const WEEKDAYS = values(Weekday);

/**
 * Scope of a setting change (the `SettingChange.scope` column): school-wide (core), a module's
 * rule settings, the managed lists (stages, departments, job titles) or the penalty catalogue.
 */
export const SettingScope = {
  SCHOOL: 'SCHOOL',
  HR: 'HR',
  LISTS: 'LISTS',
  CATALOGUE: 'CATALOGUE',
} as const;
export type SettingScope = (typeof SettingScope)[keyof typeof SettingScope];
export const SETTING_SCOPES = values(SettingScope);

