import { describe, expect, it } from 'vitest';
import { InsuranceStatus } from '../enums';
import {
  applyInsuranceStatus,
  graduationYearRange,
  isValidEgyptianIban,
  isValidGraduationYear,
  isValidInsuranceNumber,
  normalizeIban,
  socialInsuranceIssues,
  type SocialInsurance,
} from './employee-details';

const IBAN = 'EG380019000500000000263180002';

describe('Egyptian IBAN', () => {
  it('accepts EG followed by exactly 27 digits', () => {
    expect(IBAN).toHaveLength(29);
    expect(isValidEgyptianIban(IBAN)).toBe(true);
  });
  it('ignores spaces and letter case', () => {
    expect(isValidEgyptianIban('eg38 0019 0005 0000 0000 2631 8000 2')).toBe(true);
    expect(normalizeIban(' eg38 0019 0005 ')).toBe('EG3800190005');
  });
  it('rejects 26 or 28 digits, another country, letters among the digits, and empty', () => {
    expect(isValidEgyptianIban(IBAN.slice(0, -1))).toBe(false);
    expect(isValidEgyptianIban(`${IBAN}1`)).toBe(false);
    expect(isValidEgyptianIban(`SA${IBAN.slice(2)}`)).toBe(false);
    expect(isValidEgyptianIban(`${IBAN.slice(0, 10)}A${IBAN.slice(11)}`)).toBe(false);
    expect(isValidEgyptianIban('')).toBe(false);
  });
});

describe('insurance number', () => {
  it('is digits only, 1 to 20', () => {
    expect(isValidInsuranceNumber('1')).toBe(true);
    expect(isValidInsuranceNumber('1'.repeat(20))).toBe(true);
    expect(isValidInsuranceNumber('1'.repeat(21))).toBe(false);
    expect(isValidInsuranceNumber('12-34')).toBe(false);
    expect(isValidInsuranceNumber('١٢٣')).toBe(false);
    expect(isValidInsuranceNumber('')).toBe(false);
  });
});

describe('graduation year', () => {
  const today = '2026-11-18';
  it('runs from 1950 to the current year', () => {
    expect(graduationYearRange(today)).toEqual({ min: 1950, max: 2026 });
    expect(isValidGraduationYear(1950, today)).toBe(true);
    expect(isValidGraduationYear(2026, today)).toBe(true);
  });
  it('rejects 1949, next year and fractions', () => {
    expect(isValidGraduationYear(1949, today)).toBe(false);
    expect(isValidGraduationYear(2027, today)).toBe(false);
    expect(isValidGraduationYear(2000.5, today)).toBe(false);
  });
});

describe('conditional social insurance', () => {
  const today = '2026-11-18';
  const insured: SocialInsurance = {
    insuranceStatus: InsuranceStatus.INSURED,
    insuranceNumber: '123456789',
    insuranceRegistrationDate: '2020-09-01',
    insuredSalary: 900_000,
  };

  it('a complete insured record has no issues', () => {
    expect(socialInsuranceIssues(insured, today)).toEqual([]);
  });
  it('insured requires the number, the date and the salary', () => {
    const empty = { ...insured, insuranceNumber: null, insuranceRegistrationDate: null, insuredSalary: null };
    expect(socialInsuranceIssues(empty, today)).toEqual([
      { field: 'insuranceNumber', issue: 'required' },
      { field: 'insuranceRegistrationDate', issue: 'required' },
      { field: 'insuredSalary', issue: 'required' },
    ]);
  });
  it('checks the number format, a future date and a salary of 0', () => {
    expect(
      socialInsuranceIssues(
        { ...insured, insuranceNumber: '12a', insuranceRegistrationDate: '2026-11-19', insuredSalary: 0 },
        today,
      ),
    ).toEqual([
      { field: 'insuranceNumber', issue: 'insuranceNumberFormat' },
      { field: 'insuranceRegistrationDate', issue: 'registrationDateFuture' },
      { field: 'insuredSalary', issue: 'insuredSalaryPositive' },
    ]);
  });
  it('today is a valid registration date; too large a salary is not', () => {
    expect(socialInsuranceIssues({ ...insured, insuranceRegistrationDate: today }, today)).toEqual([]);
    expect(socialInsuranceIssues({ ...insured, insuredSalary: 2 ** 31 }, today)).toEqual([
      { field: 'insuredSalary', issue: 'insuredSalaryTooLarge' },
    ]);
  });
  it('not insured checks nothing and clears the three fields', () => {
    const notInsured = { ...insured, insuranceStatus: InsuranceStatus.NOT_INSURED, insuranceNumber: 'x' };
    expect(socialInsuranceIssues(notInsured, today)).toEqual([]);
    expect(applyInsuranceStatus(notInsured)).toEqual({
      insuranceStatus: InsuranceStatus.NOT_INSURED,
      insuranceNumber: null,
      insuranceRegistrationDate: null,
      insuredSalary: null,
    });
    expect(applyInsuranceStatus(insured)).toBe(insured);
  });
});
