import { EMPLOYEE_CODE_DIGITS, EMPLOYEE_CODE_PREFIX } from '../settings';
import type { IsoDate } from '../types/common';

/** The contract year runs 1 June – 31 May (§3, one-year fixed contract). */
export const CONTRACT_YEAR_START_MONTH = 6;

/** `EMP-0001` from a counter value (§3). Wider numbers keep all their digits (`EMP-10000`). */
export function formatEmployeeCode(n: number): string {
  if (!Number.isInteger(n) || n < 1)
    throw new RangeError(`invalid employee code number: ${n}`);
  return `${EMPLOYEE_CODE_PREFIX}${String(n).padStart(EMPLOYEE_CODE_DIGITS, '0')}`;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** The contract year containing `date` (`YYYY-MM-DD`): 1 June of its start year – 31 May after. */
export function contractYearFor(date: IsoDate): {
  start: IsoDate;
  end: IsoDate;
} {
  const [y, m] = date.split('-').map(Number) as [number, number];
  const startYear = m >= CONTRACT_YEAR_START_MONTH ? y : y - 1;
  return {
    start: `${startYear}-${pad(CONTRACT_YEAR_START_MONTH)}-01`,
    end: `${startYear + 1}-${pad(CONTRACT_YEAR_START_MONTH - 1)}-31`,
  };
}

/** The last day of a one-year contract starting on `start`: the day before its anniversary. */
export function oneYearContractEnd(start: IsoDate): IsoDate {
  const [y, m, d] = start.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y + 1, m - 1, d - 1)).toISOString().slice(0, 10);
}

/**
 * The probation end a new employee gets when none is given (§3, owner 2026-11-18): the day before
 * the date `months` months after the hire date (hired 1 Sep, 3 months → 30 Nov). A day the target
 * month doesn't have counts as its last day (hired 30 Nov → 28 Feb, so 27 Feb; GUESS). `0` months
 * means no probation: `null`.
 */
export function defaultProbationEnd(hireDate: IsoDate, months: number): IsoDate | null {
  if (months <= 0) return null;
  const [y, m, d] = hireDate.split('-').map(Number) as [number, number, number];
  const lastDay = new Date(Date.UTC(y, m - 1 + months + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m - 1 + months, Math.min(d, lastDay) - 1)).toISOString().slice(0, 10);
}

/** §3: a probation end is on or after the hire date. */
export const isProbationEndValid = (hireDate: IsoDate, probationEnd: IsoDate | null): boolean =>
  probationEnd === null || probationEnd >= hireDate;
