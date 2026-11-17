import type { TaxBracket } from '../settings';

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
