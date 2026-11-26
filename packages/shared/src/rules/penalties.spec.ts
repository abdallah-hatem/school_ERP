import { describe, expect, it } from 'vitest';
import {
  isValidPenaltyPercent,
  levelValueProblem,
  percentHundredths,
  storedLevelDays,
  violationLevelsProblem,
  type LevelCheck,
} from './penalties';

const notice = (level: number): LevelCheck => ({ level, effect: 'RECORD_ONLY' });

describe('levelValueProblem (spec 2026-11-25-penalty-actions)', () => {
  it('edge case 1: a Record-only level with a number → VALUE_NOT_ALLOWED', () => {
    expect(levelValueProblem('RECORD_ONLY', { days: 1 })).toBe('VALUE_NOT_ALLOWED');
    expect(levelValueProblem('RECORD_ONLY', { percent: 5 })).toBe('VALUE_NOT_ALLOWED');
    expect(levelValueProblem('RECORD_ONLY', { amount: 100 })).toBe('VALUE_NOT_ALLOWED');
    expect(levelValueProblem('RECORD_ONLY', { days: null, percent: null, amount: null })).toBeNull();
  });

  it('edge case 2: Deduct days with 0, a negative, 0.3 or 31 → DAYS_INVALID; missing → DAYS_REQUIRED', () => {
    for (const days of [0, -1, 0.3, 31]) expect(levelValueProblem('DEDUCT_DAYS', { days })).toBe('DAYS_INVALID');
    expect(levelValueProblem('DEDUCT_DAYS', {})).toBe('DAYS_REQUIRED');
    expect(levelValueProblem('DEDUCT_DAYS', { days: null })).toBe('DAYS_REQUIRED');
    expect(levelValueProblem('DEDUCT_DAYS', { days: 0.25 })).toBeNull();
    expect(levelValueProblem('DEDUCT_DAYS', { days: 30 })).toBeNull();
    expect(levelValueProblem('DEDUCT_DAYS', { days: 1, percent: 5 })).toBe('VALUE_NOT_ALLOWED');
  });

  it('edge case 3: Deduct % with 0, -5, 100.01 or 12.345 → PERCENT_INVALID; 100 allowed; missing → PERCENT_REQUIRED', () => {
    for (const percent of [0, -5, 100.01, 12.345]) {
      expect(levelValueProblem('DEDUCT_PERCENT', { percent })).toBe('PERCENT_INVALID');
    }
    expect(levelValueProblem('DEDUCT_PERCENT', { percent: 100 })).toBeNull();
    expect(levelValueProblem('DEDUCT_PERCENT', { percent: 0.01 })).toBeNull();
    expect(levelValueProblem('DEDUCT_PERCENT', { percent: 12.75 })).toBeNull();
    expect(levelValueProblem('DEDUCT_PERCENT', {})).toBe('PERCENT_REQUIRED');
    expect(levelValueProblem('DEDUCT_PERCENT', { percent: 5, days: 1 })).toBe('VALUE_NOT_ALLOWED');
  });

  it('edge case 4: Deduct amount with 0, a negative, a fraction of a piastre or above EGP 1,000,000 → AMOUNT_INVALID; missing → AMOUNT_REQUIRED', () => {
    for (const amount of [0, -100, 10.5, 100_000_001]) {
      expect(levelValueProblem('DEDUCT_AMOUNT', { amount })).toBe('AMOUNT_INVALID');
    }
    expect(levelValueProblem('DEDUCT_AMOUNT', { amount: 100_000_000 })).toBeNull();
    expect(levelValueProblem('DEDUCT_AMOUNT', { amount: 1 })).toBeNull();
    expect(levelValueProblem('DEDUCT_AMOUNT', {})).toBe('AMOUNT_REQUIRED');
  });

  it('edge case 5: Investigation with no days is valid; with days they are checked as days', () => {
    expect(levelValueProblem('INVESTIGATION', {})).toBeNull();
    expect(levelValueProblem('INVESTIGATION', { days: 2 })).toBeNull();
    expect(levelValueProblem('INVESTIGATION', { days: 0.3 })).toBe('DAYS_INVALID');
    // Owner Q11 (2026-11-26): 0 days on an investigation means none — valid, stored as null.
    expect(levelValueProblem('INVESTIGATION', { days: 0 })).toBeNull();
    expect(storedLevelDays('INVESTIGATION', 0)).toBeNull();
    expect(storedLevelDays('DEDUCT_DAYS', 0)).toBe(0);
    expect(levelValueProblem('INVESTIGATION', { amount: 100 })).toBe('VALUE_NOT_ALLOWED');
  });

  it('percents are priced in whole hundredths, with no float drift', () => {
    expect(percentHundredths(2.5)).toBe(250);
    expect(percentHundredths(12.75)).toBe(1275);
    expect(percentHundredths(0.29)).toBe(29);
    expect(isValidPenaltyPercent(0.29)).toBe(true);
  });
});

describe('violationLevelsProblem', () => {
  it('accepts 1..n in any order', () => {
    expect(violationLevelsProblem([notice(2), notice(1)])).toBeNull();
    expect(violationLevelsProblem([1, 2, 3, 4, 5].map(notice))).toBeNull();
  });
  it('a gap (1, 3) or a repeat → NUMBERING', () => {
    expect(violationLevelsProblem([notice(1), notice(3)])).toBe('NUMBERING');
    expect(violationLevelsProblem([notice(1), notice(1)])).toBe('NUMBERING');
    expect(violationLevelsProblem([notice(2)])).toBe('NUMBERING');
  });
  it('none or more than 5 → COUNT', () => {
    expect(violationLevelsProblem([])).toBe('COUNT');
    expect(violationLevelsProblem([1, 2, 3, 4, 5, 6].map(notice))).toBe('COUNT');
  });
  it("reports a level whose number doesn't fit its action's effect", () => {
    expect(violationLevelsProblem([notice(1), { level: 2, effect: 'DEDUCT_DAYS' }])).toBe('DAYS_REQUIRED');
    expect(violationLevelsProblem([notice(1), { level: 2, effect: 'DEDUCT_PERCENT', percent: 101 }])).toBe('PERCENT_INVALID');
  });
  it('a level with no action picked yet skips the number check (the form, mid-edit)', () => {
    expect(violationLevelsProblem([{ level: 1, effect: null, days: 3 }])).toBeNull();
  });
});
