/*
 * HR's approval notifications (§11, plan N2) — the part with no database: the values of the
 * "payroll ready" sentence for one reader.
 */

/** What a "payroll ready" sentence needs, worked out once per calculation. */
export interface PayrollReadyFacts {
  month: string;
  /** Employees in the run. */
  count: number;
  /** The whole run's net, in piastres. */
  net: number;
}

/**
 * The values of the "payroll ready" sentence for one reader: the net only for someone who sees the
 * whole run's totals (`hr.payroll.view` at scope `all`, R7) — left out, not null, for anyone else
 * (spec edge 16, plan N2 edge 15). The web app then uses the sentence without the net.
 */
export function payrollReadyParams(
  facts: PayrollReadyFacts,
  seesTotals: boolean,
): Record<string, unknown> {
  return {
    month: facts.month,
    count: facts.count,
    ...(seesTotals ? { net: facts.net } : {}),
  };
}
