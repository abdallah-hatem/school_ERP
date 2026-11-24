import { describe, expect, it } from 'vitest';
import { ErrorCode } from '../errors';
import type { SchoolCalendarDates } from '../types/contracts';
import {
  calendarYearsOfContract,
  contractPhase,
  currentContractPeriod,
  type ContractPeriod,
  defaultNewContractStart,
  newContractRefusal,
  nonRenewalUndoRefusal,
  pickCalendar,
  contractDecision,
  contractYearOf,
  contractYearRange,
  decisionRefusal,
  earlyTerminationTiming,
  endRefusal,
  formatContractYear,
  isToDeactivate,
  lockedMonthCutBy,
  noticeTiming,
  noticeWithdrawalRefusal,
  renewalRefusal,
  renewedContractDates,
  schoolCalendarIssues,
} from './contracts';

/* Contracts (spec docs/specs/2026-11-24-contracts.md): the pure rules, named after the spec's edge cases. */

const CAL: SchoolCalendarDates = {
  term1Start: '2026-09-15',
  term1End: '2027-01-28',
  term2Start: '2027-02-07',
  nonRenewalDeadline: '2027-04-30',
};

const T = '2026-11-24';
const active = { status: 'ACTIVE', startsOn: '2026-06-01', earlyTerminationStatus: null } as const;

describe('contract years', () => {
  it('a year is named by its start: 1 Jun 2026 – 31 May 2027 is 2026 ("2026/27")', () => {
    expect(contractYearOf('2026-06-01')).toBe(2026);
    expect(contractYearOf('2027-05-31')).toBe(2026);
    expect(contractYearOf('2027-06-01')).toBe(2027);
    expect(contractYearRange(2026)).toEqual({ start: '2026-06-01', end: '2027-05-31' });
    expect(formatContractYear(2026)).toBe('2026/27');
    expect(formatContractYear(2099)).toBe('2099/00');
  });

  it('renewal creates next year: 1 Jun 2026 – 31 May 2027 → 1 Jun 2027 – 31 May 2028', () => {
    expect(renewedContractDates('2027-05-31')).toEqual({ startsOn: '2027-06-01', endsOn: '2028-05-31' });
  });

  it('edge 5 — a contract started mid-year (1 Sep) keeps its own cycle and shows on the year it ends', () => {
    expect(renewedContractDates('2026-08-31')).toEqual({ startsOn: '2026-09-01', endsOn: '2027-08-31' });
    // 1 Sep 2025 – 31 Aug 2026 ends in 2026/27 → that year's renewal screen …
    expect(contractYearOf('2026-08-31')).toBe(2026);
    // … and reads the calendar of the year its terms fall in (2025/26: the terms it runs through).
    expect(calendarYearsOfContract({ startsOn: '2025-09-01', endsOn: '2026-08-31' })).toEqual([2025, 2026]);
    const cals = new Map([
      [2025, { term1Start: '2025-09-15', term1End: '2026-01-28', term2Start: '2026-02-07', nonRenewalDeadline: '2026-04-30' }],
      [2026, CAL],
    ]);
    expect(pickCalendar({ startsOn: '2025-09-01', endsOn: '2026-08-31' }, cals, 'notice')?.term2Start).toBe('2026-02-07');
    expect(pickCalendar({ startsOn: '2025-09-01', endsOn: '2026-08-31' }, cals, 'earlyTermination')?.term1Start).toBe('2025-09-15');
  });

  it('review 4 — a 1 Feb – 31 Jan contract: the notice window of the year whose term 2 falls inside it, early termination of the year whose term 1 does', () => {
    const c = { startsOn: '2026-02-01', endsOn: '2027-01-31' };
    const prev = { term1Start: '2025-09-15', term1End: '2026-01-28', term2Start: '2026-02-07', nonRenewalDeadline: '2026-04-30' };
    const cals = new Map([
      [2025, prev],
      [2026, CAL],
    ]);
    expect(pickCalendar(c, cals, 'notice')).toBe(prev);
    expect(pickCalendar(c, cals, 'earlyTermination')).toBe(CAL);
    // The year it needs isn't set → "calendar not set", never another year's dates.
    expect(pickCalendar(c, new Map([[2025, null], [2026, CAL]]), 'notice')).toBeNull();
    // A 1 Jun – 31 May contract reads its own year for both.
    const std = { startsOn: '2026-06-01', endsOn: '2027-05-31' };
    expect(pickCalendar(std, new Map([[2026, CAL]]), 'notice')).toBe(CAL);
    expect(pickCalendar(std, new Map([[2026, CAL]]), 'earlyTermination')).toBe(CAL);
  });

  it('a leap day: renewing a contract ending 28 Feb 2028 starts 29 Feb', () => {
    expect(renewedContractDates('2028-02-28')).toEqual({ startsOn: '2028-02-29', endsOn: '2029-02-28' });
  });
});

describe('the non-renewal notice window', () => {
  it('edge 6 — a notice before term 2 is Early, after 30 April Late, inside On time (recorded either way)', () => {
    expect(noticeTiming('2027-02-06', CAL)).toBe('EARLY');
    expect(noticeTiming('2027-02-07', CAL)).toBe('ON_TIME');
    expect(noticeTiming('2027-04-30', CAL)).toBe('ON_TIME');
    expect(noticeTiming('2027-05-01', CAL)).toBe('LATE');
  });

  it('edge 7 — the calendar for the year is not set: recorded, marked "calendar not set"', () => {
    expect(noticeTiming('2027-03-01', null)).toBe('CALENDAR_NOT_SET');
    expect(earlyTerminationTiming('2026-10-01', null)).toBe('CALENDAR_NOT_SET');
  });

  it('OPEN default — an early termination request is taken from the first day of term 1 to its last', () => {
    expect(earlyTerminationTiming('2026-09-14', CAL)).toBe('EARLY');
    expect(earlyTerminationTiming('2026-09-15', CAL)).toBe('ON_TIME');
    expect(earlyTerminationTiming('2027-01-28', CAL)).toBe('ON_TIME');
    expect(earlyTerminationTiming('2027-01-29', CAL)).toBe('LATE');
  });
});

describe('decisions', () => {
  const state = (over: Partial<Parameters<typeof contractDecision>[0]> = {}) => ({
    status: 'ACTIVE' as const,
    endsOn: '2027-05-31',
    nonRenewalBy: null,
    earlyTerminationStatus: null,
    ...over,
  });

  it('shows each decision; an active contract past its end is "Ended, no decision"', () => {
    expect(contractDecision(state(), '2027-05-31')).toBe('UNDECIDED');
    expect(contractDecision(state(), '2027-06-01')).toBe('ENDED_NO_DECISION');
    expect(contractDecision(state({ earlyTerminationStatus: 'REQUESTED' }), '2026-10-01')).toBe('EARLY_REQUESTED');
    expect(contractDecision(state({ earlyTerminationStatus: 'REJECTED' }), '2026-10-01')).toBe('UNDECIDED');
    expect(contractDecision(state({ status: 'RENEWED' }), '2026-10-01')).toBe('RENEWED');
    expect(contractDecision(state({ status: 'NOT_RENEWED', nonRenewalBy: 'SCHOOL' }), '2026-10-01')).toBe('NOT_RENEWED_SCHOOL');
    expect(contractDecision(state({ status: 'NOT_RENEWED', nonRenewalBy: 'EMPLOYEE' }), '2026-10-01')).toBe('NOTICE');
    expect(contractDecision(state({ status: 'ENDED_EARLY' }), '2026-10-01')).toBe('ENDED_EARLY');
    expect(contractDecision(state({ status: 'CANCELLED' }), '2026-10-01')).toBe('CANCELLED');
  });

  it('edge 1 — renewing an employee who is already renewed → refused, "already renewed"', () => {
    expect(renewalRefusal({ ...active, status: 'RENEWED' }, true, T)).toBe(
      ErrorCode.CONTRACT_ALREADY_RENEWED,
    );
  });

  it('edge 2 — renewing an inactive employee → refused', () => {
    expect(renewalRefusal(active, false, T)).toBe(ErrorCode.EMPLOYEE_INACTIVE);
    expect(renewalRefusal(active, true, T)).toBeNull();
  });

  it('a decided contract, or one with an early termination waiting, is not renewed', () => {
    expect(renewalRefusal({ ...active, status: 'NOT_RENEWED' }, true, T)).toBe(ErrorCode.CONTRACT_DECIDED);
    expect(renewalRefusal({ ...active, earlyTerminationStatus: 'REQUESTED' }, true, T)).toBe(
      ErrorCode.EARLY_TERMINATION_PENDING,
    );
    expect(decisionRefusal({ ...active, status: 'ENDED_EARLY', earlyTerminationStatus: 'APPROVED' }, T)).toBe(ErrorCode.CONTRACT_DECIDED);
    expect(decisionRefusal(active, T)).toBeNull();
  });

  it('edge 8 — a rejected request is not waiting: a new request may be recorded (never re-approved)', () => {
    expect(decisionRefusal({ ...active, earlyTerminationStatus: 'REJECTED' }, T)).toBeNull();
  });

  it('a notice is withdrawn while the contract still runs, and only an employee notice', () => {
    const notice = { status: 'NOT_RENEWED', nonRenewalBy: 'EMPLOYEE', endsOn: '2027-05-31' } as const;
    expect(noticeWithdrawalRefusal(notice, '2027-05-31')).toBeNull();
    expect(noticeWithdrawalRefusal(notice, '2027-06-01')).toBe(ErrorCode.CONTRACT_ENDED);
    expect(noticeWithdrawalRefusal({ ...notice, nonRenewalBy: 'SCHOOL' }, '2027-01-01')).toBe(ErrorCode.CONTRACT_NO_NOTICE);
    expect(noticeWithdrawalRefusal({ ...notice, status: 'ACTIVE' }, '2027-01-01')).toBe(ErrorCode.CONTRACT_NO_NOTICE);
  });

  it('review 3 — a new contract: an active employee with no active contract, after every contract they have', () => {
    const ended = { status: 'NOT_RENEWED', startsOn: '2025-06-01', lastDay: '2026-05-31' } as const;
    expect(newContractRefusal(true, [ended], '2026-06-01')).toBeNull();
    expect(newContractRefusal(true, [ended], '2026-05-31')).toBe(ErrorCode.CONTRACT_OVERLAP);
    expect(newContractRefusal(false, [ended], '2026-06-01')).toBe(ErrorCode.EMPLOYEE_INACTIVE);
    expect(newContractRefusal(true, [{ ...ended, status: 'ACTIVE' }], '2027-06-01')).toBe(ErrorCode.CONTRACT_ACTIVE_EXISTS);
    // A cancelled next contract (it never started) doesn't block the dates.
    expect(newContractRefusal(true, [ended, { status: 'CANCELLED', startsOn: '2026-06-01', lastDay: '2027-05-31' }], '2026-06-01')).toBeNull();
    expect(defaultNewContractStart('2026-11-24')).toBe('2026-06-01');
    expect(defaultNewContractStart('2027-03-01')).toBe('2026-06-01');
  });

  it("review 3 — the school's not-renewing is undone only before the end, and only the school's", () => {
    const school = { status: 'NOT_RENEWED', nonRenewalBy: 'SCHOOL', endsOn: '2027-05-31' } as const;
    expect(nonRenewalUndoRefusal(school, '2027-05-31')).toBeNull();
    expect(nonRenewalUndoRefusal(school, '2027-06-01')).toBe(ErrorCode.CONTRACT_ENDED);
    expect(nonRenewalUndoRefusal({ ...school, nonRenewalBy: 'EMPLOYEE' }, '2027-01-01')).toBe(ErrorCode.CONTRACT_NOT_SCHOOL_DECISION);
  });

  it('an end for another reason: from today, within the contract; a renewed one too (review 2), not an ended one', () => {
    const c = { status: 'ACTIVE', startsOn: '2026-06-01', endsOn: '2027-05-31', earlyTerminationStatus: null } as const;
    expect(endRefusal(c, '2026-11-24', '2026-11-24')).toBeNull();
    expect(endRefusal(c, '2026-11-23', '2026-11-24')).toBe(ErrorCode.CONTRACT_END_DATE_INVALID);
    expect(endRefusal(c, '2027-06-01', '2026-11-24')).toBe(ErrorCode.CONTRACT_END_DATE_INVALID);
    expect(endRefusal({ ...c, status: 'NOT_RENEWED' }, '2027-01-01', '2026-11-24')).toBeNull();
    expect(endRefusal({ ...c, status: 'RENEWED' }, '2027-01-01', '2026-11-24')).toBeNull();
    expect(endRefusal({ ...c, status: 'CANCELLED' }, '2027-01-01', '2026-11-24')).toBe(ErrorCode.CONTRACT_DECIDED);
    expect(endRefusal({ ...c, status: 'ENDED_EARLY' }, '2027-01-01', '2026-11-24')).toBe(ErrorCode.CONTRACT_DECIDED);
  });

  it('"To deactivate": not renewed or ended, the last day passed, still active', () => {
    const notRenewed = { status: 'NOT_RENEWED', endsOn: '2027-05-31', endedOn: null } as const;
    expect(isToDeactivate(notRenewed, true, '2027-05-31')).toBe(false);
    expect(isToDeactivate(notRenewed, true, '2027-06-01')).toBe(true);
    expect(isToDeactivate(notRenewed, false, '2027-06-01')).toBe(false);
    expect(isToDeactivate({ status: 'ENDED_EARLY', endsOn: '2027-05-31', endedOn: '2027-01-28' }, true, '2027-01-29')).toBe(true);
    expect(isToDeactivate({ status: 'ACTIVE', endsOn: '2027-05-31', endedOn: null }, true, '2027-06-02')).toBe(false);
  });
});

/*
 * Bug 2026-11-24 (owner, testing): renewing 2026/27 in November made 2027/28 "Current", with Renew and
 * Decide on it, and moved the employee's dates to it. The single-edge tests above missed it, so one
 * employee is walked through time here: the same contracts, the day moving forward.
 */
describe('one employee over time — Current vs Upcoming, decisions only once started', () => {
  type C = ContractPeriod & { earlyTerminationStatus: null };
  const c = (startsOn: string, endsOn: string, status: C['status'] = 'ACTIVE', endedOn: string | null = null): C => ({
    status,
    startsOn,
    endsOn,
    endedOn,
    earlyTerminationStatus: null,
  });
  const phase = (x: C, today: string) => contractPhase(x, today);

  it('step 1 — hired 1 Jun 2026: the first contract is current, decidable, and names the record’s dates', () => {
    const first = c('2026-06-01', '2027-05-31');
    expect(phase(first, '2026-06-01')).toBe('CURRENT');
    expect(decisionRefusal(first, '2026-06-01')).toBeNull();
    expect(currentContractPeriod([first], '2026-06-01')).toEqual({ startsOn: '2026-06-01', endsOn: '2027-05-31' });
  });

  it('step 2 — renewed in November: 2026/27 stays current (renewed); 2027/28 is UPCOMING and not actionable', () => {
    const first = c('2026-06-01', '2027-05-31', 'RENEWED');
    const next = c(...(Object.values(renewedContractDates('2027-05-31')) as [string, string]));
    expect(next).toMatchObject({ startsOn: '2027-06-01', endsOn: '2028-05-31' });
    expect(phase(first, T)).toBe('CURRENT');
    expect(phase(next, T)).toBe('UPCOMING');
    expect(renewalRefusal(next, true, T)).toBe(ErrorCode.CONTRACT_NOT_STARTED);
    expect(decisionRefusal(next, T)).toBe(ErrorCode.CONTRACT_NOT_STARTED);
    // The record's dates still name the contract in force, not the upcoming one.
    expect(currentContractPeriod([first, next], T)).toEqual({ startsOn: '2026-06-01', endsOn: '2027-05-31' });
    // Its year is the year it ends: the 2027/28 season, not this one.
    expect(contractYearOf(next.endsOn)).toBe(2027);
  });

  it('step 3 — 31 May 2027, the last day: still the old one; 1 Jun 2027: 2027/28 becomes CURRENT, actionable, the dates move', () => {
    const first = c('2026-06-01', '2027-05-31', 'RENEWED');
    const next = c('2027-06-01', '2028-05-31');
    expect(phase(next, '2027-05-31')).toBe('UPCOMING');
    expect(currentContractPeriod([first, next], '2027-05-31')).toEqual({ startsOn: '2026-06-01', endsOn: '2027-05-31' });
    expect(phase(first, '2027-06-01')).toBe('PAST');
    expect(phase(next, '2027-06-01')).toBe('CURRENT');
    expect(renewalRefusal(next, true, '2027-06-01')).toBeNull();
    expect(decisionRefusal(next, '2027-06-01')).toBeNull();
    expect(currentContractPeriod([first, next], '2027-06-01')).toEqual({ startsOn: '2027-06-01', endsOn: '2028-05-31' });
  });

  it('step 4 — the renewed contract ended in April before 1 June: the upcoming one CANCELLED, the dates stay on the ended one', () => {
    const ended = c('2026-06-01', '2027-05-31', 'ENDED_EARLY', '2027-04-15');
    const cancelled = c('2027-06-01', '2028-05-31', 'CANCELLED');
    expect(phase(ended, '2027-04-15')).toBe('CURRENT');
    expect(phase(ended, '2027-04-16')).toBe('PAST');
    expect(phase(cancelled, '2027-04-15')).toBe('UPCOMING');
    expect(phase(cancelled, '2027-06-01')).toBe('PAST');
    expect(currentContractPeriod([ended, cancelled], '2027-04-15')).toEqual({ startsOn: '2026-06-01', endsOn: '2027-04-15' });
    // On and after 1 June too: a cancelled contract never takes the record's dates.
    expect(currentContractPeriod([ended, cancelled], '2027-06-01')).toEqual({ startsOn: '2026-06-01', endsOn: '2027-04-15' });
  });

  it('a mid-year contract (1 Sep 2026 – 31 Aug 2027) renewed in November: 1 Sep 2027 – 31 Aug 2028, upcoming until 1 Sep', () => {
    const first = c('2026-09-01', '2027-08-31', 'RENEWED');
    const next = c(...(Object.values(renewedContractDates('2027-08-31')) as [string, string]));
    expect(next).toMatchObject({ startsOn: '2027-09-01', endsOn: '2028-08-31' });
    expect(phase(next, T)).toBe('UPCOMING');
    expect(decisionRefusal(next, '2027-08-31')).toBe(ErrorCode.CONTRACT_NOT_STARTED);
    expect(currentContractPeriod([first, next], '2027-08-31')).toEqual({ startsOn: '2026-09-01', endsOn: '2027-08-31' });
    expect(phase(next, '2027-09-01')).toBe('CURRENT');
    expect(currentContractPeriod([first, next], '2027-09-01')).toEqual({ startsOn: '2027-09-01', endsOn: '2028-08-31' });
    expect(contractYearOf(next.endsOn)).toBe(2028);
  });

  it('a new contract with a future start (a reactivated employee): UPCOMING, not actionable; the record keeps the last one until it starts', () => {
    const old = c('2025-06-01', '2026-05-31', 'NOT_RENEWED');
    const fresh = c('2027-06-01', '2028-05-31');
    expect(newContractRefusal(true, [{ status: old.status, startsOn: old.startsOn, lastDay: old.endsOn }], fresh.startsOn)).toBeNull();
    expect(phase(fresh, T)).toBe('UPCOMING');
    expect(renewalRefusal(fresh, true, T)).toBe(ErrorCode.CONTRACT_NOT_STARTED);
    expect(currentContractPeriod([old, fresh], T)).toEqual({ startsOn: '2025-06-01', endsOn: '2026-05-31' });
    expect(currentContractPeriod([old, fresh], '2027-06-01')).toEqual({ startsOn: '2027-06-01', endsOn: '2028-05-31' });
  });

  it('a new hire whose first contract starts later: it is UPCOMING, and still the record’s dates (there is no other)', () => {
    const only = c('2027-01-01', '2027-12-31');
    expect(phase(only, T)).toBe('UPCOMING');
    expect(currentContractPeriod([only], T)).toEqual({ startsOn: '2027-01-01', endsOn: '2027-12-31' });
    expect(currentContractPeriod([], T)).toBeNull();
  });

  it('undo not-renewing: back to ACTIVE on a started contract, decidable and renewable again', () => {
    const school = { status: 'NOT_RENEWED', nonRenewalBy: 'SCHOOL', endsOn: '2027-05-31' } as const;
    expect(nonRenewalUndoRefusal(school, T)).toBeNull();
    const undone = c('2026-06-01', '2027-05-31');
    expect(phase(undone, T)).toBe('CURRENT');
    expect(renewalRefusal(undone, true, T)).toBeNull();
  });

  it('an ACTIVE contract past its end ("Ended, no decision") is PAST but still renewable — only an unstarted one is refused', () => {
    const lapsed = c('2025-06-01', '2026-05-31');
    expect(phase(lapsed, T)).toBe('PAST');
    expect(renewalRefusal(lapsed, true, T)).toBeNull();
  });
});

describe('the paid months stand', () => {
  it('edge 9 — an end before the last day of an approved payroll month is refused; on its last day it is fine', () => {
    expect(lockedMonthCutBy('2026-10-15', ['2026-10'])).toBe('2026-10');
    expect(lockedMonthCutBy('2026-10-31', ['2026-10'])).toBeNull();
    expect(lockedMonthCutBy('2026-10-31', ['2026-10', '2026-11'])).toBe('2026-11');
    expect(lockedMonthCutBy('2026-10-15', [])).toBeNull();
    expect(lockedMonthCutBy('2026-12-01', ['2026-10'])).toBeNull();
  });
});

describe('the school calendar', () => {
  it('four dates inside the contract year, in order', () => {
    expect(schoolCalendarIssues(2026, CAL)).toEqual([]);
    expect(schoolCalendarIssues(2027, CAL)).toContain('term1Start');
    expect(schoolCalendarIssues(2026, { ...CAL, term1End: '2026-09-15' })).toContain('term1End');
    expect(schoolCalendarIssues(2026, { ...CAL, term2Start: '2027-01-28' })).toContain('term2Start');
    expect(schoolCalendarIssues(2026, { ...CAL, nonRenewalDeadline: '2027-02-06' })).toContain('nonRenewalDeadline');
  });
});
