import { describe, expect, it } from 'vitest';
import {
  contractYearFor,
  formatEmployeeCode,
  oneYearContractEnd,
  defaultProbationEnd,
  isProbationEndValid,
} from './employees';

describe('formatEmployeeCode', () => {
  it('pads to four digits', () => {
    expect(formatEmployeeCode(1)).toBe('EMP-0001');
    expect(formatEmployeeCode(42)).toBe('EMP-0042');
    expect(formatEmployeeCode(9999)).toBe('EMP-9999');
  });
  it('keeps every digit past 9999', () => {
    expect(formatEmployeeCode(10000)).toBe('EMP-10000');
  });
  it('rejects 0, negatives and fractions', () => {
    expect(() => formatEmployeeCode(0)).toThrow();
    expect(() => formatEmployeeCode(-1)).toThrow();
    expect(() => formatEmployeeCode(1.5)).toThrow();
  });
});

describe('contractYearFor', () => {
  it('June onwards belongs to the year starting that June', () => {
    expect(contractYearFor('2026-06-01')).toEqual({
      start: '2026-06-01',
      end: '2027-05-31',
    });
    expect(contractYearFor('2026-11-17')).toEqual({
      start: '2026-06-01',
      end: '2027-05-31',
    });
  });
  it('January – May belongs to the year that started the previous June', () => {
    expect(contractYearFor('2027-05-31')).toEqual({
      start: '2026-06-01',
      end: '2027-05-31',
    });
    expect(contractYearFor('2027-01-01')).toEqual({
      start: '2026-06-01',
      end: '2027-05-31',
    });
  });
});

describe('oneYearContractEnd', () => {
  it('ends the day before the anniversary', () => {
    expect(oneYearContractEnd('2026-06-01')).toBe('2027-05-31');
    expect(oneYearContractEnd('2026-09-15')).toBe('2027-09-14');
    expect(oneYearContractEnd('2027-03-01')).toBe('2028-02-29');
  });
});

describe('defaultProbationEnd (§3, N0)', () => {
  it('ends the day before the date the default months later (hired 1 Sep → 30 Nov)', () => {
    expect(defaultProbationEnd('2026-09-01', 3)).toBe('2026-11-30');
    expect(defaultProbationEnd('2026-09-15', 3)).toBe('2026-12-14');
    expect(defaultProbationEnd('2026-11-01', 3)).toBe('2027-01-31');
    expect(defaultProbationEnd('2026-09-01', 6)).toBe('2027-02-28');
  });
  it('a day the target month lacks counts as its last day', () => {
    expect(defaultProbationEnd('2026-11-30', 3)).toBe('2027-02-27');
    expect(defaultProbationEnd('2026-08-31', 3)).toBe('2026-11-29');
    expect(defaultProbationEnd('2027-11-30', 3)).toBe('2028-02-28');
  });
  it('0 months is no probation', () => {
    expect(defaultProbationEnd('2026-09-01', 0)).toBeNull();
  });
  it('is never before the hire date', () => {
    for (const hire of ['2026-01-31', '2026-02-28', '2026-12-31']) {
      for (let months = 1; months <= 6; months++) {
        expect(isProbationEndValid(hire, defaultProbationEnd(hire, months))).toBe(true);
      }
    }
  });
});

describe('isProbationEndValid', () => {
  it('on or after the hire date, or empty', () => {
    expect(isProbationEndValid('2026-09-01', '2026-09-01')).toBe(true);
    expect(isProbationEndValid('2026-09-01', '2026-08-31')).toBe(false);
    expect(isProbationEndValid('2026-09-01', null)).toBe(true);
  });
});
