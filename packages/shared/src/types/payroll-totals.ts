import type { Piastres } from './common';

/**
 * A payroll run's totals: sums of its lines; `flagged` counts lines with any flag (contract).
 * In its own file so the `payroll.approved` event payload can use it without an import cycle
 * (`types/hr` → `types/core` → `events`).
 */
export interface PayrollTotals {
  employees: number;
  monthSalary: Piastres;
  penaltyAmount: Piastres;
  latenessAmount: Piastres;
  adjustmentAdditions: Piastres;
  adjustmentDeductions: Piastres;
  net: Piastres;
  insuranceAmount: Piastres;
  incomeTax: Piastres;
  martyrTax: Piastres;
  gross: Piastres;
  flagged: number;
}
