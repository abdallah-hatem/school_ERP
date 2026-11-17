import type { InsuranceStatus } from '../enums';
import type { TaxBracket } from '../settings';
import type { IsoDateTime, Month, Piastres, Uuid } from './common';

/*
 * Accounting (§10). HR payroll ends at the net; when HR approves a month, accounting works out
 * what the school pays on top — the employee's insurance share, income tax and the martyrs' fund —
 * and the gross, and keeps them frozen for that month.
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

/** One employee's taxes for an approved month. Employee fields are a snapshot at approval. */
export interface AccountingPayrollLine {
  employeeId: Uuid;
  employeeCode: string;
  nameEn: string;
  nameAr: string;
  /** What HR pays the employee (the approved line's net). */
  net: Piastres;
  insuranceStatus: InsuranceStatus;
  insuredSalary: Piastres | null;
  /** The employee's insurance share, paid by the school. */
  insuranceAmount: Piastres;
  incomeTax: Piastres;
  martyrTax: Piastres;
  /** net + insurance share + income tax + martyrs' fund. */
  gross: Piastres;
}

export interface AccountingPayrollTotals {
  employees: number;
  net: Piastres;
  insuranceAmount: Piastres;
  incomeTax: Piastres;
  martyrTax: Piastres;
  gross: Piastres;
}

/** `GET /accounting/payroll` rows. */
export interface AccountingPayrollMonthSummary {
  month: Month;
  /** The HR payroll run it was worked out from. */
  hrRunId: Uuid;
  recordedAt: IsoDateTime;
  totals: AccountingPayrollTotals;
}

/** `GET /accounting/payroll/:month`. */
export interface AccountingPayrollMonth extends AccountingPayrollMonthSummary {
  /** The tax rule in force at approval (frozen with the month). */
  taxRule: TaxRule;
  lines: AccountingPayrollLine[];
}
