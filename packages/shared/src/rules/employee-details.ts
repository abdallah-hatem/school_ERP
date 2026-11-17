import { InsuranceStatus } from '../enums';
import type { IsoDate, Piastres } from '../types/common';

/*
 * §3 rules for the employee's insurance, bank and qualification fields (owner, 2026-11-18). The API
 * validates with them and the employee form shows their messages — one implementation each.
 */

/** Postgres `integer` upper bound — larger piastre amounts can't be stored. */
export const MAX_PIASTRES = 2_147_483_647;

/** An insurance number is digits only, up to this many. */
export const INSURANCE_NUMBER_MAX_DIGITS = 20;

/** The earliest graduation year accepted; the latest is the current year. */
export const FIRST_GRADUATION_YEAR = 1950;

/** Egyptian IBAN: `EG` then 27 digits (29 characters). */
export const EGYPTIAN_IBAN_DIGITS = 27;

const IBAN_PATTERN = new RegExp(`^EG\\d{${EGYPTIAN_IBAN_DIGITS}}$`);
const INSURANCE_NUMBER_PATTERN = new RegExp(`^\\d{1,${INSURANCE_NUMBER_MAX_DIGITS}}$`);

/** An IBAN as stored: spaces removed, letters upper-cased (`eg38 0019…` → `EG380019…`). */
export function normalizeIban(text: string): string {
  return text.replace(/\s+/g, '').toUpperCase();
}

/** An Egyptian IBAN (after `normalizeIban`): `EG` followed by exactly 27 digits. */
export function isValidEgyptianIban(text: string): boolean {
  return IBAN_PATTERN.test(normalizeIban(text));
}

/** Digits only, 1–20 of them. */
export function isValidInsuranceNumber(text: string): boolean {
  return INSURANCE_NUMBER_PATTERN.test(text);
}

/** Graduation years a picker offers and the API accepts: 1950 … the year of `today`. */
export function graduationYearRange(today: IsoDate): { min: number; max: number } {
  return { min: FIRST_GRADUATION_YEAR, max: Number(today.slice(0, 4)) };
}

export function isValidGraduationYear(year: number, today: IsoDate): boolean {
  const { min, max } = graduationYearRange(today);
  return Number.isInteger(year) && year >= min && year <= max;
}

/** The three fields that exist only while an employee is insured. */
export const INSURANCE_DETAIL_FIELDS = [
  'insuranceNumber',
  'insuranceRegistrationDate',
  'insuredSalary',
] as const;
export type InsuranceDetailField = (typeof INSURANCE_DETAIL_FIELDS)[number];

export interface SocialInsurance {
  insuranceStatus: InsuranceStatus;
  insuranceNumber: string | null;
  insuranceRegistrationDate: IsoDate | null;
  insuredSalary: Piastres | null;
}

export type InsuranceIssue =
  | 'required'
  | 'insuranceNumberFormat'
  | 'registrationDateFuture'
  | 'insuredSalaryPositive'
  | 'insuredSalaryTooLarge';

/**
 * The conditional insurance rule (§3): while insured, the number (digits only), the registration
 * date (not after `today`) and the insured salary (> 0) are all required. Not insured: nothing is
 * checked — `applyInsuranceStatus` clears them. Returns one issue per failing field, in field order.
 */
export function socialInsuranceIssues(
  v: SocialInsurance,
  today: IsoDate,
): { field: InsuranceDetailField; issue: InsuranceIssue }[] {
  if (v.insuranceStatus !== InsuranceStatus.INSURED) return [];
  const issues: { field: InsuranceDetailField; issue: InsuranceIssue }[] = [];
  if (!v.insuranceNumber) issues.push({ field: 'insuranceNumber', issue: 'required' });
  else if (!isValidInsuranceNumber(v.insuranceNumber)) {
    issues.push({ field: 'insuranceNumber', issue: 'insuranceNumberFormat' });
  }
  if (!v.insuranceRegistrationDate) issues.push({ field: 'insuranceRegistrationDate', issue: 'required' });
  else if (v.insuranceRegistrationDate > today) {
    issues.push({ field: 'insuranceRegistrationDate', issue: 'registrationDateFuture' });
  }
  if (v.insuredSalary == null) issues.push({ field: 'insuredSalary', issue: 'required' });
  else if (!Number.isInteger(v.insuredSalary) || v.insuredSalary <= 0) {
    issues.push({ field: 'insuredSalary', issue: 'insuredSalaryPositive' });
  } else if (v.insuredSalary > MAX_PIASTRES) {
    issues.push({ field: 'insuredSalary', issue: 'insuredSalaryTooLarge' });
  }
  return issues;
}

/** Not insured → the three insurance fields are cleared (§3); insured → kept as given. */
export function applyInsuranceStatus<T extends SocialInsurance>(v: T): T {
  if (v.insuranceStatus === InsuranceStatus.INSURED) return v;
  return { ...v, insuranceNumber: null, insuranceRegistrationDate: null, insuredSalary: null };
}
