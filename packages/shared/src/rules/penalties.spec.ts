import { describe, expect, it } from 'vitest';
import type { ViolationLevelInput } from '../types/hr';
import { levelDaysProblem, violationLevelsProblem } from './penalties';

const notice = (level: number): ViolationLevelInput => ({ level, action: 'NOTICE' });

describe('levelDaysProblem', () => {
  it('DEDUCT_DAYS without days, or days ≤ 0 → problem', () => {
    expect(levelDaysProblem('DEDUCT_DAYS', undefined)).toBe('DAYS_REQUIRED');
    expect(levelDaysProblem('DEDUCT_DAYS', null)).toBe('DAYS_REQUIRED');
    expect(levelDaysProblem('DEDUCT_DAYS', 0)).toBe('DAYS_INVALID');
    expect(levelDaysProblem('DEDUCT_DAYS', -1)).toBe('DAYS_INVALID');
  });
  it('NOTICE with days → problem', () => {
    expect(levelDaysProblem('NOTICE', 1)).toBe('DAYS_NOT_ALLOWED');
    expect(levelDaysProblem('NOTICE', null)).toBeNull();
  });
  it('INVESTIGATION may carry days', () => {
    expect(levelDaysProblem('INVESTIGATION', null)).toBeNull();
    expect(levelDaysProblem('INVESTIGATION', 2)).toBeNull();
  });
  it('days 0.3 and 30.25 → problem; 0.25 and 5 → fine', () => {
    expect(levelDaysProblem('DEDUCT_DAYS', 0.3)).toBe('DAYS_INVALID');
    expect(levelDaysProblem('DEDUCT_DAYS', 30.25)).toBe('DAYS_INVALID');
    expect(levelDaysProblem('DEDUCT_DAYS', 0.25)).toBeNull();
    expect(levelDaysProblem('DEDUCT_DAYS', 5)).toBeNull();
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
  it('reports a level whose days do not fit its action', () => {
    expect(violationLevelsProblem([notice(1), { level: 2, action: 'DEDUCT_DAYS' }])).toBe(
      'DAYS_REQUIRED',
    );
  });
});
