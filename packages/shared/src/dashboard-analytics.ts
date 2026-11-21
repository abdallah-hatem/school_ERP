import { z } from 'zod';
import { PenaltyAction } from './enums';
import type { Month, NamedRef, Piastres } from './types/common';

/*
 * The home dashboard's analytics charts (`GET /hr/dashboard/analytics?months=6|12`, §2 / §6,
 * owner 2026-11-21, layout "A · Grid"). The API works out every figure; the web app only draws
 * them. Seen with `hr.dashboard.view_analytics` (System admin only at the start); each part also
 * needs the permission of the screen its figures come from, and is `null` without it.
 */

/** The ranges the switch offers, in months back from (and including) this month. */
export const ANALYTICS_RANGES = [6, 12] as const;
export type AnalyticsRange = (typeof ANALYTICS_RANGES)[number];
/** Phones open on 6 months, wider screens on 12. The API's default when none is asked for. */
export const DEFAULT_ANALYTICS_RANGE: AnalyticsRange = 6;

/** The query: `months` is `6` or `12` (a query string), nothing else is accepted. */
export const dashboardAnalyticsQuerySchema = z
  .object({
    months: z
      .enum(ANALYTICS_RANGES.map(String) as ['6', '12'])
      .optional()
      .transform((v): AnalyticsRange => (v === undefined ? DEFAULT_ANALYTICS_RANGE : (Number(v) as AnalyticsRange))),
  })
  .strict();
export type DashboardAnalyticsQuery = z.output<typeof dashboardAnalyticsQuerySchema>;

/** Reads `?months=` from a URL (web): a valid range, or `undefined` for none / anything else. */
export function parseAnalyticsRange(value: unknown): AnalyticsRange | undefined {
  if (typeof value !== 'string') return undefined;
  const parsed = dashboardAnalyticsQuerySchema.safeParse({ months: value });
  return parsed.success ? parsed.data.months : undefined;
}

/** How the penalty chart stacks a month's approved penalties. */
export const PenaltyKind = {
  /** Notice and warning: cost nothing. */
  NOTICE: 'notice',
  /** Day deductions. */
  DEDUCT: 'deduct',
  /** Everything else (investigation, raise-related, pay cut, demotion, dismissal). */
  OTHER: 'other',
} as const;
export type PenaltyKind = (typeof PenaltyKind)[keyof typeof PenaltyKind];
export const PENALTY_KINDS: readonly PenaltyKind[] = [PenaltyKind.NOTICE, PenaltyKind.DEDUCT, PenaltyKind.OTHER];

export function penaltyKindOf(action: PenaltyAction): PenaltyKind {
  if (action === PenaltyAction.NOTICE || action === PenaltyAction.WARNING) return PenaltyKind.NOTICE;
  if (action === PenaltyAction.DEDUCT_DAYS) return PenaltyKind.DEDUCT;
  return PenaltyKind.OTHER;
}

/** The parts of a month's gross payroll, in the order the bar draws them. */
export const DEDUCTION_PARTS = ['net', 'insurance', 'incomeTax', 'penalties'] as const;
export type DeductionPart = (typeof DEDUCTION_PARTS)[number];

export interface AnalyticsPayrollMonth {
  month: Month;
  /** The approved run's net (the viewer's lines); `null` when the month has no approved run. */
  net: Piastres | null;
  /** Employees paid that month; `null` without an approved run. */
  employees: number | null;
  /** Change from the month before, when both have an approved run. */
  change: Piastres | null;
}

export interface AnalyticsFlowMonth {
  month: Month;
  /** Hired in the month (hire date). */
  joiners: number;
  /** Deactivated in the month (the day it was done, on the school's clock). */
  leavers: number;
  /** Active at the month's end (today, for this month). */
  headcountEnd: number;
}

export interface AnalyticsPenaltyMonth {
  month: Month;
  /** Approved penalties by the violation's month, per kind. */
  notice: number;
  deduct: number;
  other: number;
  total: number;
}

export interface AnalyticsLatenessMonth {
  month: Month;
  /** Minutes late entered for the month (before grace). */
  minutes: number;
}

export interface AnalyticsDeductionPart {
  part: DeductionPart;
  amount: Piastres;
  /** Of the month's gross, 0–1, to 4 decimals. */
  share: number;
}

export interface AnalyticsDeductions {
  month: Month;
  /** Net + social insurance + income tax (with the martyrs' fund) + penalty and lateness deductions. */
  gross: Piastres;
  parts: AnalyticsDeductionPart[];
}

export interface AnalyticsDeductionTrendMonth {
  month: Month;
  /** Insurance, income tax and penalties as shares of the month's gross (0–1, 4 decimals). */
  insurance: number;
  incomeTax: number;
  penalties: number;
  /** Their sum, as a share and as an amount. */
  share: number;
  amount: Piastres;
}

export interface HrDashboardAnalytics {
  range: AnalyticsRange;
  /** The months on the time axis, oldest first, ending with this month. */
  months: Month[];
  /** Approved payroll months, whole school, ever. Under 2: the trend charts aren't drawn. */
  approvedMonths: number;
  /** The newest approved month in the range (drawn in full teal), or `null`. */
  latestApproved: Month | null;
  /** Net per month — `null` without `hr.payroll.view` or when the totals' money is hidden (R7). */
  payroll: AnalyticsPayrollMonth[] | null;
  /** Active employees today by stage — `null` without `hr.employees.view`. */
  headcountByStage: { stage: NamedRef; count: number; share: number; noStage: boolean }[] | null;
  /** Joiners and leavers per month — `null` without `hr.employees.view`. */
  flow: AnalyticsFlowMonth[] | null;
  /** `null` without `hr.penalties.view`. */
  penalties: AnalyticsPenaltyMonth[] | null;
  /** `null` without `hr.lateness.view`. */
  lateness: AnalyticsLatenessMonth[] | null;
  /**
   * The newest approved month that accounting has worked out, split into its parts — `null`
   * without every salary (`hr.employees.view_salary` and `hr.payroll.view` for the whole school,
   * §10), or when no month is worked out yet.
   */
  deductions: AnalyticsDeductions | null;
  /** Deductions as a share of gross for the six newest worked-out months in the range, newest first. */
  deductionTrend: AnalyticsDeductionTrendMonth[] | null;
}
