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

/** `GET /hr/employees` item. */
export interface EmployeeSummary extends Names {
  id: Uuid;
  code: string;
  department: NamedRef;
  stage: NamedRef;
  jobTitle: NamedRef;
  workSystem: WorkSystem;
  basicSalary: Piastres;
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

/** `GET /hr/employees/:id`. */
export interface Employee extends Names {
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
  basicSalary: Piastres;
  fingerprintId: string | null;
  contractStart: IsoDate;
  contractEnd: IsoDate;
  usesBus: boolean;
  /** Signed-in-only image URL; null → the silhouette avatar. */
  photoUrl: string | null;
  insuranceStatus: InsuranceStatus;
  insuranceNumber: string | null;
  insuranceRegistrationDate: IsoDate | null;
  insuredSalary: Piastres | null;
  bankName: string | null;
  bankAccountNumber: string | null;
  iban: string | null;
  emergencyContactName: string | null;
  emergencyContactRelationship: string | null;
  emergencyContactPhone: string | null;
  highestDegree: Degree | null;
  major: string | null;
  university: string | null;
  graduationYear: number | null;
  status: EmployeeStatus;
  userId: Uuid | null;
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
  levels: ViolationLevelInput[];
}

export interface UpdateViolationRequest extends Partial<Names> {
  note?: string | null;
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

export interface PenaltyPreview {
  level: number;
  action: PenaltyAction;
  days: Days | null;
  priorCount: number;
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

export interface HrSettings {
  lateness: LatenessRule;
  payroll: PayrollRule;
  penalties: PenaltyRule;
}

export interface UpdateHrSettingsRequest {
  lateness?: Partial<LatenessRule>;
  payroll?: { dayDivisor?: number; partTime?: Partial<Record<PartTimeWorkSystem, number>> };
  penalties?: Partial<PenaltyRule>;
}

// ── Payroll ────────────────────────────────────────────────────────────────

export type { PayrollTotals } from './payroll-totals';

/** A payroll line. Employee fields are a snapshot taken at calculation. */
export interface PayrollLine extends Names {
  id: Uuid;
  employeeId: Uuid;
  employeeCode: string;
  nationalId: string | null;
  /** Department snapshot taken at calculation. */
  departmentId: Uuid;
  departmentNameEn: string;
  departmentNameAr: string;
  basicSalary: Piastres;
  workSystem: WorkSystem;
  monthSalary: Piastres;
  /** Rounded for display only; deductions use `monthSalary ÷ divisor` unrounded. */
  dayValue: Piastres;
  penaltyDays: Days;
  penaltyAmount: Piastres;
  latenessMinutes: number;
  latenessDays: Days;
  latenessAmount: Piastres;
  adjustmentAdditions: Piastres;
  adjustmentDeductions: Piastres;
  net: Piastres;
  flags: PayrollFlag[];
}

export interface PayrollRunSummary {
  id: Uuid;
  month: Month;
  status: PayrollStatus;
  totals: PayrollTotals;
  approvedAt: IsoDateTime | null;
}

export interface PayrollAdjustment {
  id: Uuid;
  employeeId: Uuid;
  /** The employee's code and names, so an adjustment whose employee left the run still reads. */
  employeeCode: string;
  nameEn: string;
  nameAr: string;
  type: AdjustmentType;
  amount: Piastres;
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
  amount: Piastres;
}

/** `GET /hr/payroll-runs/:id/lines/:lineId` — approved runs only. */
export interface Payslip extends PayrollLine {
  month: Month;
  penalties: PayslipPenalty[];
  adjustments: { type: AdjustmentType; amount: Piastres; reason: string }[];
  school: { nameEn: string; nameAr: string; logoUrl: string | null };
}

/** `GET /hr/employees/:id/payroll-lines` — one employee's line in each run, newest month first. */
export interface EmployeePayrollLine {
  runId: Uuid;
  lineId: Uuid;
  month: Month;
  status: PayrollStatus;
  /** From the line snapshot. */
  net: Piastres;
}

// ── Dashboard ──────────────────────────────────────────────────────────────

export interface HrDashboard {
  headcount: { active: number; byStage: { stage: NamedRef; count: number }[] };
  currentRun: { id: Uuid; month: Month; status: PayrollStatus; net: Piastres } | null;
  penaltiesThisMonth: { pending: number; approved: number };
}
