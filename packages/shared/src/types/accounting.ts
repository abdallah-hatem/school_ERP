import type { InsuranceStatus } from '../enums';
import type { TaxBracket } from '../settings';
import type { IsoDateTime, ListPage, Month, Piastres, Uuid } from './common';

/*
 * Accounting (§10). HR payroll ends at the net; accounting works out what the school pays on top —
 * the employee's insurance share, income tax and the martyrs' fund — and the gross.
 */

/** §10 tax, martyrs' fund and social-insurance share. Percents are 0–100 with up to 2 decimals. */
export interface TaxRule {
  brackets: TaxBracket[];
  martyrPercent: number;
  insurancePercent: number;
}

/** `GET /accounting/settings`. */
export interface AccountingSettings {
  payroll: TaxRule;
}

/** `PATCH /accounting/settings` — any subset; `brackets` replaces the whole table. */
export interface UpdateAccountingSettingsRequest {
  payroll?: Partial<TaxRule>;
}

/**
 * One employee's taxes for an approved month. Employee fields are a snapshot at approval. The money
 * (and the insured salary) is left out for a viewer whose salary scope doesn't cover the employee
 * (§2, P4) — `salaryVisible` says which.
 */
export interface AccountingPayrollLine {
  employeeId: Uuid;
  employeeCode: string;
  nameEn: string;
  nameAr: string;
  insuranceStatus: InsuranceStatus;
  salaryVisible: boolean;
  insuredSalary?: Piastres | null;
  /** What HR pays the employee (the approved line's net). */
  net?: Piastres;
  /** The employee's insurance share, paid by the school. */
  insuranceAmount?: Piastres;
  incomeTax?: Piastres;
  martyrTax?: Piastres;
  /** net + insurance share + income tax + martyrs' fund. */
  gross?: Piastres;
  /**
   * HR's breakdown of the approved line (Accounting → Payroll, HR-style view), read from HR's
   * approved run. Absent when HR's line can't be read (not expected for an approved run).
   */
  hr?: AccountingPayrollHrBreakdown;
}

/** HR's side of an approved line: department and how the net was reached. Money hidden as above. */
export interface AccountingPayrollHrBreakdown {
  departmentNameEn: string;
  departmentNameAr: string;
  monthSalary?: Piastres;
  penaltyDays: number;
  penaltyAmount?: Piastres;
  latenessDays: number;
  latenessAmount?: Piastres;
  adjustmentAdditions?: Piastres;
  adjustmentDeductions?: Piastres;
}

/** The money fields of `AccountingPayrollHrBreakdown`, hidden together with the line's. */
export const ACCOUNTING_HR_MONEY_FIELDS = [
  'monthSalary',
  'penaltyAmount',
  'latenessAmount',
  'adjustmentAdditions',
  'adjustmentDeductions',
] as const;

/** The money and salary fields of an accounting line, hidden together (§2, P4). */
export const ACCOUNTING_LINE_MONEY_FIELDS = [
  'insuredSalary',
  'net',
  'insuranceAmount',
  'incomeTax',
  'martyrTax',
  'gross',
] as const;

export interface AccountingPayrollTotals {
  employees: number;
  /** The money totals: left out unless the viewer sees every salary (§2, P4). */
  net?: Piastres;
  insuranceAmount?: Piastres;
  incomeTax?: Piastres;
  martyrTax?: Piastres;
  gross?: Piastres;
}

/**
 * Where an approved month stands in accounting: PENDING until the salaries are transferred, then
 * FINALIZED — final, never returned to HR.
 */
export const AccountingPayrollStatus = {
  PENDING: 'PENDING',
  FINALIZED: 'FINALIZED',
} as const;
export type AccountingPayrollStatus = (typeof AccountingPayrollStatus)[keyof typeof AccountingPayrollStatus];

/** `POST /accounting/payroll/:month/return` — why the month goes back to HR (shown to HR). */
export interface ReturnPayrollMonthRequest {
  reason: string;
}

/** The longest reason a returned month may carry. */
export const RETURN_REASON_MAX = 500;

/** `GET /accounting/payroll` rows. */
export interface AccountingPayrollMonthSummary {
  month: Month;
  status: AccountingPayrollStatus;
  /** When the transfer was marked made; null while PENDING. */
  finalizedAt: IsoDateTime | null;
  /** The HR payroll run it was worked out from. */
  hrRunId: Uuid;
  recordedAt: IsoDateTime;
  /** False when the money totals are left out for this viewer. */
  salaryVisible: boolean;
  totals: AccountingPayrollTotals;
}

/**
 * `GET /accounting/payroll/:month` — the month without its lines: they are paged, searched and
 * summed by the API (`GET /accounting/payroll/:month/lines`).
 */
export interface AccountingPayrollMonth extends AccountingPayrollMonthSummary {
  /** The tax rule in force at approval (frozen with the month). */
  taxRule: TaxRule;
  /** How many of the month's lines this viewer sees the amounts of (all of them with every salary). */
  visibleLines: number;
}

/** The whole month with every line as the viewer sees it — the Excel export and print. */
export interface AccountingPayrollMonthSheet extends AccountingPayrollMonth {
  lines: AccountingPayrollLine[];
}

/** `GET /accounting/payroll/:month/lines` — `?page&limit` (≤ 500), `search`, `insurance`. */
export interface AccountingPayrollLinesQuery {
  page?: number;
  limit?: number;
  /** Code, English or Arabic name. */
  search?: string;
  /** One insurance group (the statement's Insured / Not insured tables); absent: everyone. */
  insurance?: InsuranceStatus;
}

/**
 * A page of the month's lines (by employee code) and `totals` over **every** line matching the
 * search and group — the money only for a viewer who sees every salary (§2, P4).
 */
export interface AccountingPayrollLinesPage extends ListPage<AccountingPayrollLine> {
  totals: AccountingPayrollTotals;
}

/**
 * Where a month stands for accounting (§10): HR approved it (its taxes are worked out), it is a
 * draft in HR (nothing in accounting yet), or HR has no run for it.
 */
export const AccountingMonthState = {
  APPROVED: 'APPROVED',
  DRAFT: 'DRAFT',
  NONE: 'NONE',
} as const;
export type AccountingMonthState = (typeof AccountingMonthState)[keyof typeof AccountingMonthState];

/** One month of `GET /accounting/payroll/year/:year`. */
export interface AccountingPayrollYearMonth {
  month: Month;
  state: AccountingMonthState;
  /**
   * The approved month's totals. Absent on a draft or empty month, and on an approved month whose
   * taxes haven't been worked out yet (they are when the month is first opened).
   */
  summary?: AccountingPayrollMonthSummary;
}

/** `GET /accounting/payroll/year/:year` — the year board: its twelve months, January first. */
export interface AccountingPayrollYear {
  year: number;
  months: AccountingPayrollYearMonth[];
}

/** Years the board can show (`/accounting/payroll/year/:year`). */
export const ACCOUNTING_YEAR_RANGE = { min: 2000, max: 2100 } as const;

