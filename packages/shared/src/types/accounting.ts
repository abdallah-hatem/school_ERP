import type { InsuranceStatus } from '../enums';
import type { TaxBracket } from '../settings';
import type { IsoDateTime, Month, Piastres, Uuid } from './common';

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
}

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

/** `GET /accounting/payroll` rows. */
export interface AccountingPayrollMonthSummary {
  month: Month;
  /** The HR payroll run it was worked out from. */
  hrRunId: Uuid;
  recordedAt: IsoDateTime;
  /** False when the money totals are left out for this viewer. */
  salaryVisible: boolean;
  totals: AccountingPayrollTotals;
}

/** `GET /accounting/payroll/:month`. */
export interface AccountingPayrollMonth extends AccountingPayrollMonthSummary {
  /** The tax rule in force at approval (frozen with the month). */
  taxRule: TaxRule;
  lines: AccountingPayrollLine[];
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

