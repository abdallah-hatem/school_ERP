import {
  PENALTY_KINDS,
  monthOf,
  penaltyKindOf,
  shiftMonth,
  type AnalyticsDeductionTrendMonth,
  type AnalyticsDeductions,
  type AnalyticsRange,
  type HrDashboardAnalytics,
  type IsoDate,
  type Month,
  type NamedRef,
  type PenaltyKindInput,
  type PenaltyKind,
  type Piastres,
} from '@school-erp/shared';

/*
 * The dashboard charts' figures (§2, owner 2026-11-21), worked out from what the repository read.
 * Pure: no database, no request — every edge case is a unit test (`analytics.pure.spec.ts`).
 */

/** How many months the deductions card lists (the newest worked-out ones). */
export const TREND_MONTHS = 6;

/** The `range` months ending with `current`, oldest first. */
export function analyticsMonths(current: Month, range: AnalyticsRange): Month[] {
  return Array.from({ length: range }, (_, i) => shiftMonth(current, i - range + 1));
}

/** An approved run's totals over the viewer's lines. */
export interface ApprovedRunTotals {
  month: Month;
  net: Piastres;
  employees: number;
}

/** One employee's dates, for joiners, leavers and the headcount at each month's end. */
export interface EmployeeDates {
  hireDate: IsoDate;
  /** Null while active (and for an inactive employee whose day isn't known: counted as gone). */
  deactivatedOn: IsoDate | null;
  active: boolean;
}

/** A month worked out by accounting (§10), with HR's deductions of the same lines. */
export interface WorkedOutMonth {
  month: Month;
  net: Piastres;
  penaltyAmount: Piastres;
  latenessAmount: Piastres;
  insurance: Piastres;
  incomeTax: Piastres;
  martyrTax: Piastres;
}

export interface AnalyticsInputs {
  /** This month (the school's), the last on the axis. */
  current: Month;
  range: AnalyticsRange;
  /** Approved months, whole school, ever. */
  approvedMonths: number;
  /** The approved runs' months in the range and the month before it (whole school). */
  approvedInRange: Month[];
  /** `null`: the viewer gets no payroll chart. Runs of the range and the month before it. */
  payroll: ApprovedRunTotals[] | null;
  /** `null`: no headcount (no `hr.employees.view`). */
  /** `noStage`: the "no stage" entry (drawn grey). */
  stages: { stage: NamedRef; count: number; noStage: boolean }[] | null;
  employees: EmployeeDates[] | null;
  /** Approved penalties in the range, counted per violation day and action. */
  penalties: ({ date: IsoDate; count: number } & PenaltyKindInput)[] | null;
  lateness: { month: Month; minutes: number }[] | null;
  /** `null`: amounts hidden (not every salary, §10). */
  workedOut: WorkedOutMonth[] | null;
}

/** 0–1 to 4 decimals; 0 of 0 is 0. */
export function shareOf(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.round((part / whole) * 10_000) / 10_000;
}

/** First day of the month after `month`, `YYYY-MM-DD`. */
const nextMonthStart = (month: Month): IsoDate => `${shiftMonth(month, 1)}-01`;

/** Whether the employee was on the books at the end of `month` (before the next month began). */
function activeAtEnd(e: EmployeeDates, month: Month): boolean {
  const end = nextMonthStart(month);
  if (e.hireDate >= end) return false;
  if (e.active) return true;
  return e.deactivatedOn !== null && e.deactivatedOn >= end;
}

export function buildAnalytics(input: AnalyticsInputs): HrDashboardAnalytics {
  const months = analyticsMonths(input.current, input.range);
  const inRange = new Set(months);
  const approved = input.approvedInRange.filter((m) => inRange.has(m)).sort();

  const payroll = input.payroll
    ? (() => {
        const byMonth = new Map(input.payroll.map((r) => [r.month, r]));
        return months.map((month) => {
          const run = byMonth.get(month);
          const before = byMonth.get(shiftMonth(month, -1));
          return {
            month,
            net: run ? run.net : null,
            employees: run ? run.employees : null,
            change: run && before ? run.net - before.net : null,
          };
        });
      })()
    : null;

  const stageTotal = input.stages?.reduce((n, s) => n + s.count, 0) ?? 0;
  const headcountByStage = input.stages
    ? input.stages.map((s) => ({ stage: s.stage, count: s.count, share: shareOf(s.count, stageTotal), noStage: s.noStage }))
    : null;

  const flow = input.employees
    ? (() => {
        const people = input.employees;
        const activeNow = people.filter((e) => e.active).length;
        return months.map((month) => ({
          month,
          joiners: people.filter((e) => monthOf(e.hireDate) === month).length,
          leavers: people.filter((e) => !e.active && e.deactivatedOn !== null && monthOf(e.deactivatedOn) === month)
            .length,
          // This month's end hasn't come: today's active count, as the headcount tile shows it.
          headcountEnd:
            month === input.current ? activeNow : people.filter((e) => activeAtEnd(e, month)).length,
        }));
      })()
    : null;

  const penalties = input.penalties
    ? (() => {
        const counts = new Map<Month, Record<PenaltyKind, number>>(
          months.map((m) => [m, { notice: 0, deduct: 0, other: 0 }]),
        );
        for (const p of input.penalties) {
          const bucket = counts.get(monthOf(p.date));
          if (bucket) bucket[penaltyKindOf(p)] += p.count;
        }
        return months.map((month) => {
          const c = counts.get(month)!;
          return { month, ...c, total: PENALTY_KINDS.reduce((n, k) => n + c[k], 0) };
        });
      })()
    : null;

  const lateness = input.lateness
    ? (() => {
        const byMonth = new Map<Month, number>();
        for (const l of input.lateness) byMonth.set(l.month, (byMonth.get(l.month) ?? 0) + l.minutes);
        return months.map((month) => ({ month, minutes: byMonth.get(month) ?? 0 }));
      })()
    : null;

  const worked = input.workedOut
    ? input.workedOut.filter((w) => inRange.has(w.month)).sort((a, b) => a.month.localeCompare(b.month))
    : null;
  const deductions = worked && worked.length ? deductionsOf(worked[worked.length - 1]) : null;
  // The card lists the six newest worked-out months, newest first (as the screen reads them).
  const deductionTrend = worked ? worked.slice(-TREND_MONTHS).map(trendOf).reverse() : null;

  return {
    range: input.range,
    months,
    approvedMonths: input.approvedMonths,
    latestApproved: approved.length ? approved[approved.length - 1] : null,
    payroll,
    headcountByStage,
    flow,
    penalties,
    lateness,
    deductions,
    deductionTrend,
  };
}

/** The four parts of a month's gross: net, insurance, income tax (with the fund), penalties. */
function partsOf(w: WorkedOutMonth) {
  return {
    net: w.net,
    insurance: w.insurance,
    incomeTax: w.incomeTax + w.martyrTax,
    penalties: w.penaltyAmount + w.latenessAmount,
  };
}

export function deductionsOf(w: WorkedOutMonth): AnalyticsDeductions {
  const p = partsOf(w);
  const gross = p.net + p.insurance + p.incomeTax + p.penalties;
  return {
    month: w.month,
    gross,
    parts: (['net', 'insurance', 'incomeTax', 'penalties'] as const).map((part) => ({
      part,
      amount: p[part],
      share: shareOf(p[part], gross),
    })),
  };
}

function trendOf(w: WorkedOutMonth): AnalyticsDeductionTrendMonth {
  const p = partsOf(w);
  const gross = p.net + p.insurance + p.incomeTax + p.penalties;
  const amount = p.insurance + p.incomeTax + p.penalties;
  return {
    month: w.month,
    insurance: shareOf(p.insurance, gross),
    incomeTax: shareOf(p.incomeTax, gross),
    penalties: shareOf(p.penalties, gross),
    share: shareOf(amount, gross),
    amount,
  };
}
