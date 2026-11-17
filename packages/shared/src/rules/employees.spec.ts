import { describe, expect, it } from 'vitest';
import {
  contractYearFor,
  formatEmployeeCode,
  oneYearContractEnd,
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
