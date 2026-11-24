import { describe, expect, it } from 'vitest';
import { ErrorCode } from '../errors';
import type { SchoolCalendarDates } from '../types/contracts';
import {
  calendarYearOfContract,
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

const active = { status: 'ACTIVE', earlyTerminationStatus: null } as const;

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
    // … and reads the calendar of the year it started in (the terms it runs through).
    expect(calendarYearOfContract('2025-09-01')).toBe(2025);
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
  });

  it('edge 1 — renewing an employee who is already renewed → refused, "already renewed"', () => {
    expect(renewalRefusal({ status: 'RENEWED', earlyTerminationStatus: null }, true)).toBe(
      ErrorCode.CONTRACT_ALREADY_RENEWED,
    );
  });

  it('edge 2 — renewing an inactive employee → refused', () => {
    expect(renewalRefusal(active, false)).toBe(ErrorCode.EMPLOYEE_INACTIVE);
    expect(renewalRefusal(active, true)).toBeNull();
  });

  it('a decided contract, or one with an early termination waiting, is not renewed', () => {
    expect(renewalRefusal({ status: 'NOT_RENEWED', earlyTerminationStatus: null }, true)).toBe(ErrorCode.CONTRACT_DECIDED);
    expect(renewalRefusal({ status: 'ACTIVE', earlyTerminationStatus: 'REQUESTED' }, true)).toBe(
      ErrorCode.EARLY_TERMINATION_PENDING,
    );
    expect(decisionRefusal({ status: 'ENDED_EARLY', earlyTerminationStatus: 'APPROVED' })).toBe(ErrorCode.CONTRACT_DECIDED);
    expect(decisionRefusal(active)).toBeNull();
  });

  it('edge 8 — a rejected request is not waiting: a new request may be recorded (never re-approved)', () => {
    expect(decisionRefusal({ status: 'ACTIVE', earlyTerminationStatus: 'REJECTED' })).toBeNull();
  });

  it('a notice is withdrawn while the contract still runs, and only an employee notice', () => {
    const notice = { status: 'NOT_RENEWED', nonRenewalBy: 'EMPLOYEE', endsOn: '2027-05-31' } as const;
    expect(noticeWithdrawalRefusal(notice, '2027-05-31')).toBeNull();
    expect(noticeWithdrawalRefusal(notice, '2027-06-01')).toBe(ErrorCode.CONTRACT_ENDED);
    expect(noticeWithdrawalRefusal({ ...notice, nonRenewalBy: 'SCHOOL' }, '2027-01-01')).toBe(ErrorCode.CONTRACT_NO_NOTICE);
    expect(noticeWithdrawalRefusal({ ...notice, status: 'ACTIVE' }, '2027-01-01')).toBe(ErrorCode.CONTRACT_NO_NOTICE);
  });

  it('an end for another reason: from today, within the contract; not a renewed or ended one', () => {
    const c = { status: 'ACTIVE', startsOn: '2026-06-01', endsOn: '2027-05-31', earlyTerminationStatus: null } as const;
    expect(endRefusal(c, '2026-11-24', '2026-11-24')).toBeNull();
    expect(endRefusal(c, '2026-11-23', '2026-11-24')).toBe(ErrorCode.CONTRACT_END_DATE_INVALID);
    expect(endRefusal(c, '2027-06-01', '2026-11-24')).toBe(ErrorCode.CONTRACT_END_DATE_INVALID);
    expect(endRefusal({ ...c, status: 'NOT_RENEWED' }, '2027-01-01', '2026-11-24')).toBeNull();
    expect(endRefusal({ ...c, status: 'RENEWED' }, '2027-01-01', '2026-11-24')).toBe(ErrorCode.CONTRACT_ALREADY_RENEWED);
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
