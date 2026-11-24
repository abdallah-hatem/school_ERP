import { ErrorCode } from '../errors';
import type { IsoDate } from '../types/common';
import {
  CalendarTiming,
  ContractDecision,
  ContractStatus,
  EarlyTerminationStatus,
  NonRenewalBy,
  type SchoolCalendarDates,
} from '../types/contracts';
import { contractYearFor, oneYearContractEnd } from './employees';

/*
 * Contract rules (§3 → Contracts, spec docs/specs/2026-11-24-contracts.md). Pure: dates in, an
 * answer out — the API's contracts service and the screens use the same ones.
 */

/** The contract year holding `date`, named by its start year (`2027-03-10` → `2026`, i.e. 2026/27). */
export function contractYearOf(date: IsoDate): number {
  return Number(contractYearFor(date).start.slice(0, 4));
}

/** 1 June `year` – 31 May `year + 1`. */
export function contractYearRange(year: number): { start: IsoDate; end: IsoDate } {
  return { start: `${year}-06-01`, end: `${year + 1}-05-31` };
}

/** `2026` → `2026/27`. */
export function formatContractYear(year: number): string {
  return `${year}/${String((year + 1) % 100).padStart(2, '0')}`;
}

/** The day after `date`. */
export function dayAfter(date: IsoDate): IsoDate {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

/**
 * The contract a renewal creates (spec → What it adds, 2; edge case 5): from the day after the end,
 * for one year — 1 Jun – 31 May stays 1 Jun – 31 May, a mid-year 1 Sep – 31 Aug keeps its own cycle.
 */
export function renewedContractDates(endsOn: IsoDate): { startsOn: IsoDate; endsOn: IsoDate } {
  const startsOn = dayAfter(endsOn);
  return { startsOn, endsOn: oneYearContractEnd(startsOn) };
}

/**
 * Whose school calendar a contract reads (notice window, end of term 1): the contract year it
 * started in. For a 1 Jun – 31 May contract that is also the year it ends in; a mid-year contract
 * (1 Sep 2025 – 31 Aug 2026) reads 2025/26's terms, the ones it runs through.
 */
export function calendarYearOfContract(startsOn: IsoDate): number {
  return contractYearOf(startsOn);
}

/**
 * Where an employee's non-renewal notice falls (spec → Rules; edge cases 6, 7): the window is the
 * first day of term 2 to the non-renewal deadline (30 April). Before → `EARLY`, after → `LATE`
 * (recorded all the same — the school decides case by case); no calendar → `CALENDAR_NOT_SET`.
 */
export function noticeTiming(receivedOn: IsoDate, calendar: SchoolCalendarDates | null): CalendarTiming {
  if (!calendar) return CalendarTiming.CALENDAR_NOT_SET;
  if (receivedOn < calendar.term2Start) return CalendarTiming.EARLY;
  if (receivedOn > calendar.nonRenewalDeadline) return CalendarTiming.LATE;
  return CalendarTiming.ON_TIME;
}

/**
 * Where an early termination request falls (spec → OPEN, default): from the first day of term 1
 * to its last day. Outside → `EARLY` / `LATE` (refused); no calendar → `CALENDAR_NOT_SET` (recorded,
 * marked; edge case 7).
 */
export function earlyTerminationTiming(
  requestedOn: IsoDate,
  calendar: SchoolCalendarDates | null,
): CalendarTiming {
  if (!calendar) return CalendarTiming.CALENDAR_NOT_SET;
  if (requestedOn < calendar.term1Start) return CalendarTiming.EARLY;
  if (requestedOn > calendar.term1End) return CalendarTiming.LATE;
  return CalendarTiming.ON_TIME;
}

/** What a contract's decision is worked out from. */
export interface ContractState {
  status: ContractStatus;
  endsOn: IsoDate;
  nonRenewalBy: NonRenewalBy | null;
  earlyTerminationStatus: EarlyTerminationStatus | null;
}

/** The decision a contract shows on `today` (`ContractDecision`). */
export function contractDecision(c: ContractState, today: IsoDate): ContractDecision {
  switch (c.status) {
    case ContractStatus.RENEWED:
      return ContractDecision.RENEWED;
    case ContractStatus.NOT_RENEWED:
      return c.nonRenewalBy === NonRenewalBy.EMPLOYEE ? ContractDecision.NOTICE : ContractDecision.NOT_RENEWED_SCHOOL;
    case ContractStatus.ENDED_EARLY:
      return ContractDecision.ENDED_EARLY;
    case ContractStatus.ACTIVE:
      if (c.earlyTerminationStatus === EarlyTerminationStatus.REQUESTED) return ContractDecision.EARLY_REQUESTED;
      return c.endsOn < today ? ContractDecision.ENDED_NO_DECISION : ContractDecision.UNDECIDED;
  }
}

/**
 * The day a contract really ends: `endedOn` when it ended early, else its signed end. "To
 * deactivate" starts the day after (spec → Rules).
 */
export function lastDayOf(c: { endsOn: IsoDate; endedOn: IsoDate | null }): IsoDate {
  return c.endedOn ?? c.endsOn;
}

/**
 * "To deactivate" (spec → Rules, GUESS): not renewed or ended early, the last day passed, and the
 * employee is still active. Never automatic — HR deactivates them.
 */
export function isToDeactivate(
  c: { status: ContractStatus; endsOn: IsoDate; endedOn: IsoDate | null },
  employeeActive: boolean,
  today: IsoDate,
): boolean {
  if (!employeeActive) return false;
  if (c.status !== ContractStatus.NOT_RENEWED && c.status !== ContractStatus.ENDED_EARLY) return false;
  return lastDayOf(c) < today;
}

/**
 * Why a contract can't be renewed, or null (edge cases 1, 2): renewed already; another decision
 * (not renewed, ended early); an early termination request waiting; the employee inactive.
 */
export function renewalRefusal(
  c: Pick<ContractState, 'status' | 'earlyTerminationStatus'>,
  employeeActive: boolean,
): ErrorCode | null {
  if (c.status === ContractStatus.RENEWED) return ErrorCode.CONTRACT_ALREADY_RENEWED;
  if (c.status !== ContractStatus.ACTIVE) return ErrorCode.CONTRACT_DECIDED;
  if (c.earlyTerminationStatus === EarlyTerminationStatus.REQUESTED) return ErrorCode.EARLY_TERMINATION_PENDING;
  if (!employeeActive) return ErrorCode.EMPLOYEE_INACTIVE;
  return null;
}

/**
 * Why a decision (not renewing, a notice, an early termination request) can't be recorded, or
 * null: only on an active contract with no early termination request waiting.
 */
export function decisionRefusal(c: Pick<ContractState, 'status' | 'earlyTerminationStatus'>): ErrorCode | null {
  if (c.status === ContractStatus.RENEWED) return ErrorCode.CONTRACT_ALREADY_RENEWED;
  if (c.status !== ContractStatus.ACTIVE) return ErrorCode.CONTRACT_DECIDED;
  if (c.earlyTerminationStatus === EarlyTerminationStatus.REQUESTED) return ErrorCode.EARLY_TERMINATION_PENDING;
  return null;
}

/**
 * A notice can be withdrawn while the contract is still running (spec → Rules): it must be the
 * employee's notice, and its end not passed.
 */
export function noticeWithdrawalRefusal(
  c: Pick<ContractState, 'status' | 'nonRenewalBy' | 'endsOn'>,
  today: IsoDate,
): ErrorCode | null {
  if (c.status !== ContractStatus.NOT_RENEWED || c.nonRenewalBy !== NonRenewalBy.EMPLOYEE) {
    return ErrorCode.CONTRACT_NO_NOTICE;
  }
  if (c.endsOn < today) return ErrorCode.CONTRACT_ENDED;
  return null;
}

/**
 * An end for another reason (spec → Rules, GUESS): today or later, not before the contract's start,
 * not after its end. Only an active or not-renewed contract (a renewed one ends through its next).
 */
export function endRefusal(
  c: Pick<ContractState, 'status' | 'endsOn' | 'earlyTerminationStatus'> & { startsOn: IsoDate },
  endsOn: IsoDate,
  today: IsoDate,
): ErrorCode | null {
  if (c.status === ContractStatus.RENEWED) return ErrorCode.CONTRACT_ALREADY_RENEWED;
  if (c.status === ContractStatus.ENDED_EARLY) return ErrorCode.CONTRACT_DECIDED;
  if (c.earlyTerminationStatus === EarlyTerminationStatus.REQUESTED) return ErrorCode.EARLY_TERMINATION_PENDING;
  if (endsOn < today || endsOn < c.startsOn || endsOn > c.endsOn) return ErrorCode.CONTRACT_END_DATE_INVALID;
  return null;
}

/**
 * The school calendar's checks (Settings → HR rules): every date inside the contract year, and in
 * order — term 1 starts before it ends, term 2 starts after term 1 ends, the deadline on or after
 * term 2's start. Empty = valid.
 */
export function schoolCalendarIssues(year: number, c: SchoolCalendarDates): (keyof SchoolCalendarDates)[] {
  const { start, end } = contractYearRange(year);
  const issues: (keyof SchoolCalendarDates)[] = [];
  for (const key of ['term1Start', 'term1End', 'term2Start', 'nonRenewalDeadline'] as const) {
    if (c[key] < start || c[key] > end) issues.push(key);
  }
  if (c.term1End <= c.term1Start) issues.push('term1End');
  if (c.term2Start <= c.term1End) issues.push('term2Start');
  if (c.nonRenewalDeadline < c.term2Start) issues.push('nonRenewalDeadline');
  return [...new Set(issues)];
}

/**
 * The last day of the month a date's payroll month is fully paid through — an end before an
 * approved payroll month's last day is refused (edge case 9): "the paid month stands". Given the
 * approved months (`YYYY-MM`), the first one an end on `endsOn` would cut into, or null.
 */
export function lockedMonthCutBy(endsOn: IsoDate, approvedMonths: readonly string[]): string | null {
  const month = endsOn.slice(0, 7);
  const [y, m] = month.split('-').map(Number) as [number, number];
  const lastDay = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  const cut = [...approvedMonths]
    .filter((a) => a > month || (a === month && endsOn < lastDay))
    .sort();
  return cut[0] ?? null;
}
