import type {
  AdjustmentType,
  Degree,
  EmployeeStatus,
  Gender,
  InsuranceStatus,
  PartTimeWorkSystem,
  PayrollFlag,
  PayrollStatus,
  PenaltyAction,
  PenaltyStatus,
  RepetitionWindow,
  WorkSystem,
} from '../enums';
import type { LatenessStep } from '../settings';
import type {
  Days,
  IsoDate,
  IsoDateTime,
  Month,
  NamedRef,
  Names,
  PaginationQuery,
  Piastres,
  Uuid,
} from './common';
import type { CreateListItemRequest, ListItem, UpdateListItemRequest } from './core';
import type { PayrollTotals } from './payroll-totals';

// ── HR lists ───────────────────────────────────────────────────────────────

export type Department = ListItem;

/** A job title. `managesPeople`: its holders can be chosen as a direct manager (§3). */
export interface JobTitle extends ListItem {
  managesPeople: boolean;
}

export interface CreateJobTitleRequest extends CreateListItemRequest {
  /** Defaults to `false`. */
  managesPeople?: boolean;
}

export interface UpdateJobTitleRequest extends UpdateListItemRequest {
  managesPeople?: boolean;
}

// ── Employees ──────────────────────────────────────────────────────────────

export interface ListEmployeesQuery extends PaginationQuery {
  departmentId?: Uuid;
  stageId?: Uuid;
  status?: EmployeeStatus;
  workSystem?: WorkSystem;
  /** `true`: only employees whose job title manages people (the direct-manager picker, §3). */
  managesPeople?: boolean;
  /** Leave this employee out (the one being edited, in the direct-manager picker). */
  excludeId?: Uuid;
}

/**
 * Salary (R7, edge case 4). Without `hr.employees.view_salary` covering the employee, the API
 * leaves the salary-type fields out of the response — they are absent, not null — and sets
 * `salaryVisible: false`, so the screen hides the field instead of showing "not set".
 */
export interface SalaryVisibility {
  salaryVisible: boolean;
}

/** `GET /hr/employees` item. `basicSalary` is absent when `salaryVisible` is false (R7). */
export interface EmployeeSummary extends Names, SalaryVisibility {
  id: Uuid;
  code: string;
  department: NamedRef;
  stage: NamedRef;
  jobTitle: NamedRef;
  workSystem: WorkSystem;
  basicSalary?: Piastres;
  status: EmployeeStatus;
  /** Signed-in-only image URL; null → the silhouette avatar. */
  photoUrl: string | null;
  /** Picks the male or female silhouette when there is no photo. */
  gender: Gender;
}

/** All §3 fields a client sends (everything except `code` and `status`). */
export interface CreateEmployeeRequest extends Names {
  nationalId?: string | null;
  gender: Gender;
  dateOfBirth: IsoDate;
  phone: string;
  email?: string | null;
  address?: string | null;
  hireDate: IsoDate;
  stageId: Uuid;
  departmentId: Uuid;
  jobTitleId: Uuid;
  managerId?: Uuid | null;
  grade?: string | null;
  workSystem: WorkSystem;
  basicSalary: Piastres;
  fingerprintId?: string | null;
  /** Defaults to 1 June of the current contract year. */
  contractStart?: IsoDate;
  /** Defaults to 31 May of the next year. */
  contractEnd?: IsoDate;
  /**
   * §3 (N0): on or after the hire date. Left out or empty on create → hire date + the school's
   * default probation length (none when it is 0). Empty on edit → no probation.
   */
  probationEnd?: IsoDate | null;
  usesBus?: boolean;
  /** Defaults to NOT_INSURED, which clears the three insurance fields below. */
  insuranceStatus?: InsuranceStatus;
  /** Digits only, unique; required when insured. */
  insuranceNumber?: string | null;
  /** Required when insured; not in the future. */
  insuranceRegistrationDate?: IsoDate | null;
  /** Monthly, > 0; required when insured. */
  insuredSalary?: Piastres | null;
  bankName?: string | null;
  bankAccountNumber?: string | null;
  /** `EG` + 27 digits. */
  iban?: string | null;
  emergencyContactName?: string | null;
  emergencyContactRelationship?: string | null;
  emergencyContactPhone?: string | null;
  highestDegree?: Degree | null;
  major?: string | null;
  university?: string | null;
  /** 1950 … the current year. */
  graduationYear?: number | null;
}

export type UpdateEmployeeRequest = Partial<CreateEmployeeRequest>;

/** The employee fields R7 treats as salary: absent from responses when `salaryVisible` is false. */
export const EMPLOYEE_SALARY_FIELDS = [
  'basicSalary',
  'insuredSalary',
  'bankName',
  'bankAccountNumber',
  'iban',
] as const;
export type EmployeeSalaryField = (typeof EMPLOYEE_SALARY_FIELDS)[number];

/**
 * `GET /hr/employees/:id`. The salary fields (`EMPLOYEE_SALARY_FIELDS`) are absent when
 * `salaryVisible` is false (R7).
 */
export interface Employee extends Names, SalaryVisibility {
  id: Uuid;
  code: string;
  nationalId: string | null;
  gender: Gender;
  dateOfBirth: IsoDate;
  phone: string;
  email: string | null;
  address: string | null;
  hireDate: IsoDate;
  stage: NamedRef;
  department: NamedRef;
  jobTitle: NamedRef;
  /**
   * `managesPeople`: the manager's job title still manages people. `false` means they no longer
   * qualify — the employee keeps them, and the form flags it (§3).
   */
  manager: (NamedRef & { code: string; managesPeople: boolean; photoUrl: string | null; gender: Gender }) | null;
  grade: string | null;
  workSystem: WorkSystem;
  basicSalary?: Piastres;
  fingerprintId: string | null;
  contractStart: IsoDate;
  contractEnd: IsoDate;
  /** §3 (N0): null = no probation. Not salary-type: shown to whoever sees the employee. */
  probationEnd: IsoDate | null;
  usesBus: boolean;
  /** Signed-in-only image URL; null → the silhouette avatar. */
  photoUrl: string | null;
  insuranceStatus: InsuranceStatus;
  insuranceNumber: string | null;
  insuranceRegistrationDate: IsoDate | null;
  insuredSalary?: Piastres | null;
  bankName?: string | null;
  bankAccountNumber?: string | null;
  iban?: string | null;
  emergencyContactName: string | null;
  emergencyContactRelationship: string | null;
  emergencyContactPhone: string | null;
  highestDegree: Degree | null;
  major: string | null;
  university: string | null;
  graduationYear: number | null;
  status: EmployeeStatus;
  /**
   * The user account whose employee record this is (`users.employee_id`, at most one), or null:
   * nobody signs in as this employee. Shown on the profile ("Signs in as: …").
   */
  signInAccount: { id: Uuid; name: string } | null;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

/** Compact employee reference used inside penalties, lateness and payroll responses. */
export interface EmployeeRef extends NamedRef {
  code: string;
  /** Present where the response shows the employee's avatar (e.g. penalties). */
  photoUrl?: string | null;
  /** Present with `photoUrl`: picks the male or female silhouette. */
  gender?: Gender;
}

// ── Penalty catalogue ──────────────────────────────────────────────────────

export interface ViolationLevel {
  /** 1..5 */
  level: number;
  action: PenaltyAction;
  /** Required (> 0) for DEDUCT_DAYS, optional for INVESTIGATION, null otherwise. */
  days: Days | null;
}

export interface Violation extends Names {
  id: Uuid;
  note: string | null;
  isActive: boolean;
  /**
   * §4 (owner, 2026-11-18): at most one pending or approved penalty for this violation per
   * employee per date. Off for violations that genuinely repeat within a day (late to class…).
   */
  oncePerDay: boolean;
  levels: ViolationLevel[];
}

export interface PenaltyGroup extends Names {
  id: Uuid;
  sortOrder: number;
  isActive: boolean;
  violations: Violation[];
}

export interface CreatePenaltyGroupRequest extends Names {
  sortOrder?: number;
}

export interface UpdatePenaltyGroupRequest extends Partial<Names> {
  sortOrder?: number;
  isActive?: boolean;
}

export interface ViolationLevelInput {
  level: number;
  action: PenaltyAction;
  days?: Days | null;
}

export interface CreateViolationRequest extends Names {
  note?: string | null;
  /** Default true. */
  oncePerDay?: boolean;
  levels: ViolationLevelInput[];
}

export interface UpdateViolationRequest extends Partial<Names> {
  note?: string | null;
  oncePerDay?: boolean;
  isActive?: boolean;
  levels?: ViolationLevelInput[];
}

// ── Penalty records ────────────────────────────────────────────────────────

export interface ListPenaltiesQuery extends PaginationQuery {
  employeeId?: Uuid;
  month?: Month;
  status?: PenaltyStatus;
}

export interface PenaltyPreviewQuery {
  employeeId: Uuid;
  violationId: Uuid;
  date: IsoDate;
}

/** The level, action and days a penalty has (or gets). */
export interface PenaltyLevelValues {
  level: number;
  action: PenaltyAction;
  days: Days | null;
}

/**
 * §4 backdated penalty (owner 2026-11-20): an APPROVED penalty of the same employee and violation,
 * later in the repeat order and in the window, that approving this one moves up one level — its
 * level, action and days now (`before`) and after the approval (`after`, from today's catalogue).
 */
export interface PenaltyRecountChange {
  id: Uuid;
  date: IsoDate;
  before: PenaltyLevelValues;
  after: PenaltyLevelValues;
}

export interface PenaltyPreview extends PenaltyLevelValues {
  priorCount: number;
  /**
   * What approving the new penalty would change (§4, owner 2026-11-20), by date — empty when it is
   * not backdated before approved ones. Recording changes nothing. When one of them sits in a month
   * whose payroll is approved, the preview (and recording) is refused instead: 409
   * `PENALTY_RECOUNT_MONTH_LOCKED`, `params.month`.
   */
  recount: PenaltyRecountChange[];
}

/** One recounted penalty the user confirmed: the level, action and days it was shown to get. */
export interface PenaltyRecountAcknowledgement extends PenaltyLevelValues {
  id: Uuid;
}

/**
 * `POST /hr/penalties/:id/approve`. `acknowledgedRecount`: the record's `recount` list as the
 * screen showed it, each with its `after` values. Required when approving changes approved
 * penalties (409 `PENALTY_RECOUNT_UNCONFIRMED` without it); when it differs from what approving
 * does now → 409 `PENALTY_RECOUNT_CHANGED`. Both carry the fresh list as `data.recount`.
 */
export interface ApprovePenaltyRequest {
  acknowledgedRecount?: PenaltyRecountAcknowledgement[];
}

/** The `data` of a 409 `PENALTY_RECOUNT_UNCONFIRMED` / `PENALTY_RECOUNT_CHANGED`. */
export interface PenaltyRecountConflict {
  recount: PenaltyRecountChange[];
}

export interface CreatePenaltyRequest {
  employeeId: Uuid;
  violationId: Uuid;
  date: IsoDate;
  note?: string | null;
}

export interface CancelPenaltyRequest {
  reason: string;
}

export interface PenaltyRecord {
  id: Uuid;
  employee: EmployeeRef;
  violation: NamedRef;
  date: IsoDate;
  level: number;
  action: PenaltyAction;
  days: Days | null;
  status: PenaltyStatus;
  note: string | null;
  cancelReason: string | null;
  createdBy: { id: Uuid; name: string } | null;
  approvedBy: { id: Uuid; name: string } | null;
  createdAt: IsoDateTime;
  /**
   * §4 approve in date order (owner 2026-11-20): for a PENDING record, the earliest earlier
   * penalty of the same violation and employee (in the repetition window) that is still pending —
   * approving this one is refused (409 `PENALTY_EARLIER_PENDING`) until it is approved or
   * cancelled. Null otherwise (and always for approved and cancelled records).
   */
  earlierPending: { id: Uuid; date: IsoDate } | null;
  /**
   * §4 backdated penalty (owner 2026-11-20): for a PENDING record, the approved penalties that
   * approving it now would move up one level (by date). Empty otherwise.
   */
  recount: PenaltyRecountChange[];
  /**
   * The earliest month among `recount` whose payroll is approved (`YYYY-MM`): approving is refused
   * (409 `PENALTY_RECOUNT_MONTH_LOCKED`). Null otherwise.
   */
  recountLockedMonth: Month | null;
}

// ── Monthly lateness ───────────────────────────────────────────────────────

export interface LatenessRow {
  employee: EmployeeRef;
  /** The employee's department. */
  department: NamedRef;
  minutes: number;
  days: Days;
}

/** `GET /hr/lateness?month=` and `PUT /hr/lateness/:month`: the month's whole list. */
export interface LatenessMonth {
  /** True once the month's payroll is approved — entry is refused (409 `PAYROLL_APPROVED`). */
  locked: boolean;
  /**
   * The lateness rule the rows' `days` were computed with (today's rule, §5) — so a viewer without
   * `hr.settings.view` can still see and preview days. Only the lateness rule, no other setting.
   */
  rule: LatenessRule;
  rows: LatenessRow[];
}

export interface PutLatenessRequest {
  entries: { employeeId: Uuid; minutes: number }[];
}

// ── HR rule settings ───────────────────────────────────────────────────────

export interface LatenessRule {
  graceMinutes: number;
  steps: LatenessStep[];
  extraHourDays: Days;
}

export interface PayrollRule {
  dayDivisor: number;
  partTime: Record<PartTimeWorkSystem, number>;
}

export interface PenaltyRule {
  repetitionWindow: RepetitionWindow;
}

/** §3, §7 (N0): the length a new employee's probation end is filled from. */
export interface EmployeeRule {
  /** Whole months, 0–6; 0 = no probation (the field is left empty). */
  defaultProbationMonths: number;
}

/** §11 (N3): when HR's reminders are sent. Days before a date, or a day of the month (1–31). */
export interface ReminderRule {
  /** First contract reminder, days before the end (1–120). */
  contractEndDays: number;
  /** Second contract reminder (0 = none; 0–60, less than the first). */
  contractEndSecondDays: number;
  /** Days before an employee's probation end (1–60). */
  probationEndDays: number;
  /** From this day of each month while its lateness was never saved (past the month's end = its last day). */
  latenessCheckDay: number;
  /** From this day of each month while its payroll isn't prepared or approved (same). */
  payrollCheckDay: number;
}

export interface HrSettings {
  lateness: LatenessRule;
  payroll: PayrollRule;
  penalties: PenaltyRule;
  employees: EmployeeRule;
  reminders: ReminderRule;
}

/** The HR rules a payroll run's panel shows (§5, §6, §7): only those its figures depend on. */
export type PayrollRunRules = Pick<HrSettings, 'lateness' | 'payroll' | 'penalties'>;

export interface UpdateHrSettingsRequest {
  lateness?: Partial<LatenessRule>;
  payroll?: { dayDivisor?: number; partTime?: Partial<Record<PartTimeWorkSystem, number>> };
  penalties?: Partial<PenaltyRule>;
  employees?: Partial<EmployeeRule>;
  reminders?: Partial<ReminderRule>;
}

// ── Payroll ────────────────────────────────────────────────────────────────

export type { PayrollTotals } from './payroll-totals';

/**
 * A payroll line's money (R7): absent when `salaryVisible` is false — the viewer may see the run
 * but not this employee's pay (no `hr.employees.view_salary` covering them).
 */
export const PAYROLL_LINE_MONEY_FIELDS = [
  'basicSalary',
  'monthSalary',
  'dayValue',
  'penaltyAmount',
  'latenessAmount',
  'adjustmentAdditions',
  'adjustmentDeductions',
  'net',
] as const;
export type PayrollLineMoneyField = (typeof PAYROLL_LINE_MONEY_FIELDS)[number];

/**
 * A payroll line. Employee fields are a snapshot taken at calculation. The money fields
 * (`PAYROLL_LINE_MONEY_FIELDS`) are absent when `salaryVisible` is false.
 */
export interface PayrollLine extends Names, SalaryVisibility {
  id: Uuid;
  employeeId: Uuid;
  employeeCode: string;
  nationalId: string | null;
  /** Department snapshot taken at calculation. */
  departmentId: Uuid;
  departmentNameEn: string;
  departmentNameAr: string;
  basicSalary?: Piastres;
  workSystem: WorkSystem;
  monthSalary?: Piastres;
  /** Rounded for display only; deductions use `monthSalary ÷ divisor` unrounded. */
  dayValue?: Piastres;
  penaltyDays: Days;
  penaltyAmount?: Piastres;
  latenessMinutes: number;
  /**
   * The lateness grace taken off `latenessMinutes` at calculation (§5); null on a line calculated
   * before it was kept.
   */
  latenessGraceMinutes: number | null;
  latenessDays: Days;
  latenessAmount?: Piastres;
  adjustmentAdditions?: Piastres;
  adjustmentDeductions?: Piastres;
  net?: Piastres;
  flags: PayrollFlag[];
}

/**
 * `totals` sums the lines the viewer may see (`hr.payroll.view` scope; the whole run at scope
 * `all`). Its money is left out (`salaryVisible: false`, money fields absent) when the viewer's
 * scope is narrower than the whole school and their `hr.employees.view_salary` doesn't cover it —
 * a team's total would give away its members' pay. A whole-school total is shown to every
 * `hr.payroll.view` holder (the principal's "payroll totals").
 */
export interface PayrollRunSummary extends SalaryVisibility {
  id: Uuid;
  month: Month;
  status: PayrollStatus;
  totals: PayrollTotals;
  approvedAt: IsoDateTime | null;
  /** When Accounting marked the salaries transferred (finalized): the run is final. */
  transferredAt: IsoDateTime | null;
  /** The last time Accounting sent this run back to HR, and why; cleared when it is approved again. */
  returned: { at: IsoDateTime; reason: string } | null;
}

export interface PayrollAdjustment {
  id: Uuid;
  employeeId: Uuid;
  /** The employee's code and names, so an adjustment whose employee left the run still reads. */
  employeeCode: string;
  nameEn: string;
  nameAr: string;
  type: AdjustmentType;
  /** Absent when `salaryVisible` is false (R7). */
  amount?: Piastres;
  salaryVisible: boolean;
  reason: string;
  createdAt: IsoDateTime;
  /** False when its employee has no line in the run (deactivated, removed on recalculation). */
  applied: boolean;
}

export interface PayrollRun extends PayrollRunSummary {
  /**
   * PENDING penalties dated in the run's month right now (0 on an approved run). Live, unlike the
   * lines' `PENDING_PENALTIES` flags, which reflect the last calculation.
   */
  pendingPenalties: number;
  /** When the lines were last calculated (create, Recalculate, approve). */
  calculatedAt: IsoDateTime;
  /**
   * A DRAFT run whose lateness or payroll rules (HR settings) changed after `calculatedAt`: a
   * Recalculate is due. Always false on an approved run.
   */
  rulesChanged: boolean;
  /**
   * A DRAFT run with a penalty dated in its month that a backdated approval moved up a level (§4,
   * owner 2026-11-20) after `calculatedAt`: a Recalculate is due. Always false on an approved run.
   */
  penaltiesRecounted: boolean;
  /**
   * The HR rules behind the run's figures, for its "rules applied" panel — readable by anyone who
   * may view the run, without `hr.settings.view`. A run stores no copy of the rules, so these are
   * TODAY's rules: on a draft they are exactly what the next calculation uses; on an approved run
   * the screen words them as the current rules, not the ones it was approved with. No money.
   */
  rules: PayrollRunRules;
  lines: PayrollLine[];
  adjustments: PayrollAdjustment[];
}

export interface CreatePayrollRunRequest {
  month: Month;
}

export interface PayrollRunQuery {
  search?: string;
  departmentId?: Uuid;
  flagged?: boolean;
}

export interface CreateAdjustmentRequest {
  employeeId: Uuid;
  type: AdjustmentType;
  amount: Piastres;
  reason: string;
}

export interface PayslipPenalty {
  date: IsoDate;
  violationNameEn: string;
  violationNameAr: string;
  level: number;
  action: PenaltyAction;
  days: Days | null;
  /** Absent when the payslip's `salaryVisible` is false. */
  amount?: Piastres;
}

/** `GET /hr/payroll-runs/:id/lines/:lineId` — approved runs only. */
export interface Payslip extends PayrollLine {
  month: Month;
  penalties: PayslipPenalty[];
  /** `amount` is absent when the payslip's `salaryVisible` is false. */
  adjustments: { type: AdjustmentType; amount?: Piastres; reason: string }[];
  school: { nameEn: string; nameAr: string; logoUrl: string | null };
}

/** `GET /hr/employees/:id/payroll-lines` — one employee's line in each run, newest month first. */
export interface EmployeePayrollLine extends SalaryVisibility {
  runId: Uuid;
  lineId: Uuid;
  month: Month;
  status: PayrollStatus;
  /** From the line snapshot. Absent when `salaryVisible` is false (R7). */
  net?: Piastres;
}

// ── Dashboard ──────────────────────────────────────────────────────────────

/**
 * `GET /hr/dashboard`. Each widget counts only what the viewer may see (R5) and is null when they
 * can't see that kind of record at all: `headcount` needs `hr.employees.view`, `currentRun`
 * `hr.payroll.view` (null also when the month has no run), `penaltiesThisMonth` `hr.penalties.view`.
 * `currentRun.net` follows the run totals' rule (`PayrollRunSummary`): absent when
 * `salaryVisible` is false.
 */
export interface HrDashboard {
  headcount: { active: number; byStage: { stage: NamedRef; count: number }[] } | null;
  currentRun:
    | { id: Uuid; month: Month; status: PayrollStatus; net?: Piastres; salaryVisible: boolean }
    | null;
  penaltiesThisMonth: { pending: number; approved: number } | null;
}
