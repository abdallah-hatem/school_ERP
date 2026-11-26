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

/**
 * The seeded penalty actions' system codes (spec 2026-11-25-penalty-actions): today's ten, kept as
 * the `code` of the ten seeded rows of `penalty_actions`. Used only by the seed, the migration and
 * the dashboard's chart kinds — never for a rule (rules go by the action's `PenaltyEffect`). The
 * `common.enums.penaltyAction.*` names stay in both locales: audit entries written before the move
 * hold these codes.
 */
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

/**
 * What a penalty action does to pay (§4, spec 2026-11-25) — one per action, fixed in code (no free
 * formulas). The number is on the catalogue level: days, a percent or an amount.
 */
export const PenaltyEffect = {
  /** Kept on the employee's file; no number, no change to pay. */
  RECORD_ONLY: 'RECORD_ONLY',
  /** Days of pay, required on the level (quarter steps, above 0, at most 30). */
  DEDUCT_DAYS: 'DEDUCT_DAYS',
  /** A percent of a salary (the action's `percentBase`), required on the level (0.01–100). */
  DEDUCT_PERCENT: 'DEDUCT_PERCENT',
  /** A fixed amount in piastres, required on the level (above 0, at most EGP 1,000,000). */
  DEDUCT_AMOUNT: 'DEDUCT_AMOUNT',
  /** Referral to investigation; the level may add days deducted (priced as days). */
  INVESTIGATION: 'INVESTIGATION',
} as const;
export type PenaltyEffect = (typeof PenaltyEffect)[keyof typeof PenaltyEffect];
export const PENALTY_EFFECTS = values(PenaltyEffect);

/**
 * Which salary a % action is a share of (spec 2026-11-25, §6): the salary for the month (basic ×
 * work-system %, what days are priced from) or the basic salary (before the part-time %).
 */
export const PenaltySalaryBase = {
  MONTH_SALARY: 'MONTH_SALARY',
  BASIC_SALARY: 'BASIC_SALARY',
} as const;
export type PenaltySalaryBase = (typeof PenaltySalaryBase)[keyof typeof PenaltySalaryBase];
export const PENALTY_SALARY_BASES = values(PenaltySalaryBase);

/** The ten seeded actions (spec 2026-11-25): code, effect and today's names, in today's order. */
export const SEEDED_PENALTY_ACTIONS: readonly {
  code: PenaltyAction;
  effect: PenaltyEffect;
  nameEn: string;
  nameAr: string;
}[] = [
  { code: 'NOTICE', effect: 'RECORD_ONLY', nameEn: 'Notice', nameAr: 'لفت نظر' },
  { code: 'WARNING', effect: 'RECORD_ONLY', nameEn: 'Warning', nameAr: 'إنذار' },
  { code: 'DEDUCT_DAYS', effect: 'DEDUCT_DAYS', nameEn: 'Deduct days', nameAr: 'خصم أيام' },
  { code: 'INVESTIGATION', effect: 'INVESTIGATION', nameEn: 'Referral to investigation', nameAr: 'إحالة للتحقيق' },
  { code: 'RAISE_HALF_LOSS', effect: 'RECORD_ONLY', nameEn: 'Loss of half the annual raise', nameAr: 'الحرمان من نصف العلاوة السنوية' },
  { code: 'RAISE_LOSS', effect: 'RECORD_ONLY', nameEn: 'Loss of the annual raise', nameAr: 'الحرمان من العلاوة السنوية' },
  { code: 'RAISE_DEFER_3M', effect: 'RECORD_ONLY', nameEn: 'Annual raise deferred 3 months', nameAr: 'تأجيل العلاوة السنوية 3 أشهر' },
  { code: 'PAY_CUT', effect: 'RECORD_ONLY', nameEn: 'Pay cut by one annual raise', nameAr: 'خفض الأجر بمقدار علاوة' },
  { code: 'DEMOTION', effect: 'RECORD_ONLY', nameEn: 'Demotion', nameAr: 'خفض الدرجة' },
  { code: 'DISMISSAL', effect: 'RECORD_ONLY', nameEn: 'Dismissal', nameAr: 'الفصل' },
];

/**
 * §4 two-step approval (owner, 2026-11-21): recorded → PENDING_REVIEW (the stage head of the
 * penalty's stage approves or rejects) → WAITING_HR (the HR manager or principal approves or
 * rejects) → APPROVED. REJECTED (at either step, with a reason) and CANCELLED are final.
 * Penalties pending before the two steps existed became WAITING_HR.
 */
export const PenaltyStatus = {
  PENDING_REVIEW: 'PENDING_REVIEW',
  WAITING_HR: 'WAITING_HR',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  CANCELLED: 'CANCELLED',
} as const;
export type PenaltyStatus = (typeof PenaltyStatus)[keyof typeof PenaltyStatus];
export const PENALTY_STATUSES = values(PenaltyStatus);

/**
 * The statuses still waiting for a decision (either step) — what "pending" means for payroll, the
 * once-per-day rule, the date-order rule and the dashboard's Pending tile.
 */
export const OPEN_PENALTY_STATUSES = [PenaltyStatus.PENDING_REVIEW, PenaltyStatus.WAITING_HR] as const;

export function isOpenPenaltyStatus(status: PenaltyStatus): boolean {
  return (OPEN_PENALTY_STATUSES as readonly PenaltyStatus[]).includes(status);
}

/** The list filter: one status, or `OPEN` — waiting at either step. */
export const PENALTY_STATUS_FILTERS = [...PENALTY_STATUSES, 'OPEN'] as const;
export type PenaltyStatusFilter = (typeof PENALTY_STATUS_FILTERS)[number];

/** The step a penalty was rejected at. */
export const PenaltyStep = {
  REVIEW: 'REVIEW',
  HR: 'HR',
} as const;
export type PenaltyStep = (typeof PenaltyStep)[keyof typeof PenaltyStep];
export const PENALTY_STEPS = values(PenaltyStep);

/**
 * Why a penalty skipped the stage review and went straight to WAITING_HR (§4, owner 2026-11-21):
 * the penalised employee is a stage head of that stage (they can't review their own), the recorder
 * may review it themselves (their recording counts as the review), or the stage has no stage head.
 */
export const PenaltyReviewSkip = {
  EMPLOYEE_IS_HEAD: 'EMPLOYEE_IS_HEAD',
  RECORDER_IS_HEAD: 'RECORDER_IS_HEAD',
  NO_STAGE_HEAD: 'NO_STAGE_HEAD',
} as const;
export type PenaltyReviewSkip = (typeof PenaltyReviewSkip)[keyof typeof PenaltyReviewSkip];
export const PENALTY_REVIEW_SKIPS = values(PenaltyReviewSkip);

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
  ACCOUNTING: 'ACCOUNTING',
  LISTS: 'LISTS',
  CATALOGUE: 'CATALOGUE',
  NOTIFICATIONS: 'NOTIFICATIONS',
} as const;
export type SettingScope = (typeof SettingScope)[keyof typeof SettingScope];
export const SETTING_SCOPES = values(SettingScope);

