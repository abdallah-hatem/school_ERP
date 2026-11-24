import { ErrorCode } from '../errors';
import type { IsoDate } from '../types/common';
import {
  CalendarTiming,
  ContractDecision,
  ContractPhase,
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
 * The contract years whose school calendar a contract may read: the one it starts in and the one it
 * ends in (one year for a 1 Jun – 31 May contract, two for any other cycle). `pickCalendar` then
 * takes the one whose term falls inside the contract.
 */
export function calendarYearsOfContract(c: { startsOn: IsoDate; endsOn: IsoDate }): number[] {
  return [...new Set([contractYearOf(c.startsOn), contractYearOf(c.endsOn)])];
}

/**
 * The school calendar a contract reads, among the calendars of `calendarYearsOfContract` (null =
 * not set): for the **notice** window, the one whose term 2 starts inside the contract (its window
 * runs before the contract ends); for **early termination**, the one whose term 1 starts inside it.
 * When several qualify, the latest. When none of the set ones qualifies and one of the years isn't
 * set, the calendar isn't set (null) — edge case 7. Examples:
 * - 1 Jun 2026 – 31 May 2027 → 2026/27 for both;
 * - 1 Sep 2025 – 31 Aug 2026 → 2025/26 for both (its terms);
 * - 1 Feb 2026 – 31 Jan 2027 → notice: 2025/26 (term 2 in Feb 2026); early termination: 2026/27
 *   (term 1 from Sep 2026).
 */
export function pickCalendar(
  c: { startsOn: IsoDate; endsOn: IsoDate },
  calendars: ReadonlyMap<number, SchoolCalendarDates | null>,
  kind: 'notice' | 'earlyTermination',
): SchoolCalendarDates | null {
  const inside = (d: IsoDate) => d >= c.startsOn && d <= c.endsOn;
  const years = calendarYearsOfContract(c).sort((a, b) => b - a);
  for (const year of years) {
    const cal = calendars.get(year);
    if (cal && inside(kind === 'notice' ? cal.term2Start : cal.term1Start)) return cal;
  }
  return null;
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
  startsOn: IsoDate;
  endsOn: IsoDate;
  nonRenewalBy: NonRenewalBy | null;
  earlyTerminationStatus: EarlyTerminationStatus | null;
}

/** The decision a contract shows on `today` (`ContractDecision`). */
export function contractDecision(c: Omit<ContractState, 'startsOn'>, today: IsoDate): ContractDecision {
  switch (c.status) {
    case ContractStatus.RENEWED:
      return ContractDecision.RENEWED;
    case ContractStatus.NOT_RENEWED:
      return c.nonRenewalBy === NonRenewalBy.EMPLOYEE ? ContractDecision.NOTICE : ContractDecision.NOT_RENEWED_SCHOOL;
    case ContractStatus.ENDED_EARLY:
      return ContractDecision.ENDED_EARLY;
    case ContractStatus.CANCELLED:
      return ContractDecision.CANCELLED;
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
 * Where a contract stands on `today` (bug 2026-11-24): `CURRENT` from its start to its last day
 * (`lastDayOf`: the early end when it ended early), `UPCOMING` before its start, `PAST` after its
 * last day. A cancelled contract never runs: always `PAST`.
 */
export function contractPhase(
  c: { status: ContractStatus; startsOn: IsoDate; endsOn: IsoDate; endedOn: IsoDate | null },
  today: IsoDate,
): ContractPhase {
  if (c.status === ContractStatus.CANCELLED) return ContractPhase.PAST;
  if (c.startsOn > today) return ContractPhase.UPCOMING;
  if (lastDayOf(c) < today) return ContractPhase.PAST;
  return ContractPhase.CURRENT;
}

/**
 * Why a contract can't be cancelled, or null (review 2026-11-24, the way out for an upcoming
 * contract): only one that hasn't started, still active, and not a renewal's next contract — a
 * future hire who never starts, or a new contract with a future start. A renewal's next contract is
 * cancelled by ending the contract in force instead.
 */
export function cancelRefusal(
  c: { status: ContractStatus; startsOn: IsoDate },
  isRenewal: boolean,
  today: IsoDate,
): ErrorCode | null {
  if (c.status !== ContractStatus.ACTIVE) return ErrorCode.CONTRACT_DECIDED;
  if (c.startsOn <= today || isRenewal) return ErrorCode.CONTRACT_NOT_CANCELLABLE;
  return null;
}

/** A contract as `currentContractPeriod` reads it. */
export interface ContractPeriod {
  status: ContractStatus;
  startsOn: IsoDate;
  endsOn: IsoDate;
  endedOn: IsoDate | null;
}

/**
 * The contract the employee's record names (its contract start / end — the Details tab, the
 * reminders): the latest one that has **started** by `today`, cancelled ones aside — the one in
 * force, or, between contracts, the last one; when none has started yet (a new hire with a future
 * start), the first upcoming one. Its end is its last day (an early end included). Null: no
 * contract. A renewal's next contract takes over on its first day, never before.
 */
export function currentContractPeriod(
  contracts: readonly ContractPeriod[],
  today: IsoDate,
): { startsOn: IsoDate; endsOn: IsoDate } | null {
  const counted = contracts.filter((c) => c.status !== ContractStatus.CANCELLED);
  const started = counted.filter((c) => c.startsOn <= today);
  const pick = started.length
    ? started.reduce((a, b) => (b.startsOn > a.startsOn ? b : a))
    : counted.length
      ? counted.reduce((a, b) => (b.startsOn < a.startsOn ? b : a))
      : null;
  return pick ? { startsOn: pick.startsOn, endsOn: lastDayOf(pick) } : null;
}

/**
 * "To deactivate" (spec → Rules, GUESS): not renewed or ended, the last day passed, the employee
 * still active, and no later contract (a cancelled one aside) — a reactivated employee with a new
 * contract is not "to deactivate" because of their old one (review 2026-11-24). Never automatic —
 * HR deactivates them.
 */
export function isToDeactivate(
  c: { status: ContractStatus; endsOn: IsoDate; endedOn: IsoDate | null },
  employeeActive: boolean,
  today: IsoDate,
  hasLaterContract: boolean,
): boolean {
  if (!employeeActive || hasLaterContract) return false;
  if (c.status !== ContractStatus.NOT_RENEWED && c.status !== ContractStatus.ENDED_EARLY) return false;
  return lastDayOf(c) < today;
}

/**
 * Why a contract can't be renewed, or null (edge cases 1, 2): renewed already; another decision
 * (not renewed, ended early); it hasn't started yet (`CONTRACT_NOT_STARTED` — a renewal's next
 * contract is renewed in its own season, bug 2026-11-24); an early termination request waiting; the
 * employee inactive.
 */
export function renewalRefusal(
  c: Pick<ContractState, 'status' | 'startsOn' | 'earlyTerminationStatus'>,
  employeeActive: boolean,
  today: IsoDate,
): ErrorCode | null {
  const code = decisionRefusal(c, today);
  if (code) return code;
  if (!employeeActive) return ErrorCode.EMPLOYEE_INACTIVE;
  return null;
}

/**
 * Why a decision (not renewing, a notice, an early termination request) can't be recorded, or
 * null: only on an active contract that has **started** (an upcoming one → `CONTRACT_NOT_STARTED`)
 * with no early termination request waiting.
 */
export function decisionRefusal(
  c: Pick<ContractState, 'status' | 'startsOn' | 'earlyTerminationStatus'>,
  today: IsoDate,
): ErrorCode | null {
  if (c.status === ContractStatus.RENEWED) return ErrorCode.CONTRACT_ALREADY_RENEWED;
  if (c.status !== ContractStatus.ACTIVE) return ErrorCode.CONTRACT_DECIDED;
  if (c.startsOn > today) return ErrorCode.CONTRACT_NOT_STARTED;
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
 * The school's not-renewing can be undone (it changed its mind) while the contract hasn't ended:
 * only the school's own decision — an employee's notice is withdrawn instead.
 */
export function nonRenewalUndoRefusal(
  c: Pick<ContractState, 'status' | 'nonRenewalBy' | 'endsOn'>,
  today: IsoDate,
): ErrorCode | null {
  if (c.status !== ContractStatus.NOT_RENEWED || c.nonRenewalBy !== NonRenewalBy.SCHOOL) {
    return ErrorCode.CONTRACT_NOT_SCHOOL_DECISION;
  }
  if (c.endsOn < today) return ErrorCode.CONTRACT_ENDED;
  return null;
}

/** The default start of a new contract: 1 June of the contract year holding `today`. */
export function defaultNewContractStart(today: IsoDate): IsoDate {
  return contractYearRange(contractYearOf(today)).start;
}

/**
 * Why a new contract can't be made for an employee (review 2026-11-24: a reactivated employee, or
 * the school changed its mind after its not-renewing ended), or null: the employee is active, has no
 * active contract, and the new one starts after every contract they have (contracts never overlap;
 * a cancelled one doesn't count). `existing` are their contracts' periods (start, last day).
 */
export function newContractRefusal(
  employeeActive: boolean,
  existing: readonly { status: ContractStatus; startsOn: IsoDate; lastDay: IsoDate }[],
  startsOn: IsoDate,
): ErrorCode | null {
  if (!employeeActive) return ErrorCode.EMPLOYEE_INACTIVE;
  if (existing.some((c) => c.status === ContractStatus.ACTIVE)) return ErrorCode.CONTRACT_ACTIVE_EXISTS;
  const counted = existing.filter((c) => c.status !== ContractStatus.CANCELLED);
  if (counted.some((c) => startsOn <= c.lastDay)) return ErrorCode.CONTRACT_OVERLAP;
  return null;
}

/**
 * An end for another reason (spec → Rules, GUESS): today or later, not before the contract's start,
 * not after its end. An active, not-renewed or **renewed** contract (review 2026-11-24: dismissal or
 * death in April after the renewal can't wait for 1 June — the next contract is cancelled with it).
 */
export function endRefusal(
  c: Pick<ContractState, 'status' | 'endsOn' | 'earlyTerminationStatus'> & { startsOn: IsoDate },
  endsOn: IsoDate,
  today: IsoDate,
): ErrorCode | null {
  if (c.status === ContractStatus.ENDED_EARLY || c.status === ContractStatus.CANCELLED) return ErrorCode.CONTRACT_DECIDED;
  // Not one that hasn't started: it is cancelled (`cancelRefusal`), or with the contract in force.
  if (c.startsOn > today) return ErrorCode.CONTRACT_NOT_STARTED;
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
