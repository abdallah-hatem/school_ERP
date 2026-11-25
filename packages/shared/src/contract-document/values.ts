import type { WorkSystem } from '../enums';
import type { IsoDate, Piastres } from '../types/common';
import { CONTRACT_SALARY_FIELDS, type ContractFieldKey, type ContractFieldValues, type ContractLanguage } from './fields';
import { amountInWordsAr, amountInWordsEn } from './words';

/*
 * The values printed into a contract (spec → Fields), worked out from the records on the day it is
 * printed, in the copy's language. Western digits and thousands separators in both languages;
 * Gregorian dates as day, month name, year ("1 يونيو 2026", "1 June 2026").
 */

const MONTHS: Record<ContractLanguage, readonly string[]> = {
  AR: ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'],
  EN: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
};

/** `2026-06-01` → "1 يونيو 2026" / "1 June 2026". */
export function formatContractDate(date: IsoDate, language: ContractLanguage): string {
  const [year = 0, month = 1, day = 1] = date.split('-').map(Number);
  return `${day} ${MONTHS[language][month - 1] ?? ''} ${year}`;
}

const group = (digits: string) => digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/** Piastres → "9,500" or "9,500.50" (piastres only when not zero). */
export function formatContractAmount(piastres: Piastres): string {
  const whole = Math.round(piastres);
  const pounds = group(String(Math.floor(whole / 100)));
  const rest = whole % 100;
  return rest === 0 ? pounds : `${pounds}.${String(rest).padStart(2, '0')}`;
}

/** "9,500 جنيه" / "EGP 9,500". */
export function formatContractSalary(piastres: Piastres, language: ContractLanguage): string {
  const amount = formatContractAmount(piastres);
  return language === 'AR' ? `${amount} جنيه` : `EGP ${amount}`;
}

/** The work system as a contract states it. */
export const CONTRACT_WORK_SYSTEM_TEXT: Record<WorkSystem, Record<ContractLanguage, string>> = {
  FULL_TIME: { AR: 'دوام كامل', EN: 'Full-time' },
  PART_TIME_4: { AR: 'دوام جزئي (4 أيام في الأسبوع)', EN: 'Part-time (4 days a week)' },
  PART_TIME_3: { AR: 'دوام جزئي (3 أيام في الأسبوع)', EN: 'Part-time (3 days a week)' },
  PART_TIME_2: { AR: 'دوام جزئي (يومان في الأسبوع)', EN: 'Part-time (2 days a week)' },
};

interface Names {
  nameEn: string;
  nameAr: string;
}

/** What a copy's values are filled from (the API reads it from the records). */
export interface ContractValueSource {
  employee: {
    code: string;
    nameEn: string;
    nameAr: string;
    nationalId: string | null;
    address: string | null;
    jobTitle: Names;
    department: Names;
    /** The main stage; null when it is the "no stage" entry (§3). */
    stage: Names | null;
    hireDate: IsoDate;
    workSystem: WorkSystem;
    /** Piastres; null when the reader may not see it (the salary fields are then left out). */
    basicSalary: Piastres | null;
  };
  /** This contract's own dates as signed (not an early end). */
  contract: { startsOn: IsoDate; endsOn: IsoDate };
  school: {
    nameEn: string;
    nameAr: string;
    addressEn: string;
    addressAr: string;
    signatoryNameEn: string;
    signatoryNameAr: string;
    signatoryTitleEn: string;
    signatoryTitleAr: string;
  };
  /** The school's today (Cairo). */
  today: IsoDate;
}

const text = (value: string | null | undefined): string | null => {
  const trimmed = value?.trim() ?? '';
  return trimmed === '' ? null : trimmed;
};

const named = (names: Names, language: ContractLanguage) => text(language === 'AR' ? names.nameAr : names.nameEn);

/** "<name>، <title>" / "<name>, <title>"; just the name without a title; null without a name. */
export function schoolRepresentative(name: string, title: string, language: ContractLanguage): string | null {
  const who = text(name);
  if (!who) return null;
  const role = text(title);
  return role ? `${who}${language === 'AR' ? '، ' : ', '}${role}` : who;
}

/** Every field's value for a copy in `language`. */
export function contractFieldValues(source: ContractValueSource, language: ContractLanguage): ContractFieldValues {
  const { employee, contract, school } = source;
  const salary = employee.basicSalary;
  const ar = language === 'AR';
  return {
    'employee.nameAr': text(employee.nameAr),
    'employee.nameEn': text(employee.nameEn),
    'employee.code': text(employee.code),
    'employee.nationalId': text(employee.nationalId),
    'employee.address': text(employee.address),
    'employee.jobTitle': named(employee.jobTitle, language),
    'employee.department': named(employee.department, language),
    'employee.stage': employee.stage ? named(employee.stage, language) : null,
    'employee.hireDate': formatContractDate(employee.hireDate, language),
    'contract.start': formatContractDate(contract.startsOn, language),
    'contract.end': formatContractDate(contract.endsOn, language),
    'contract.salary': salary === null ? null : formatContractSalary(salary, language),
    'contract.salaryWords': salary === null ? null : ar ? amountInWordsAr(salary) : amountInWordsEn(salary),
    'contract.salaryWordsAr': salary === null ? null : amountInWordsAr(salary),
    'contract.workSystem': CONTRACT_WORK_SYSTEM_TEXT[employee.workSystem][language],
    'school.name': text(ar ? school.nameAr : school.nameEn),
    'school.address': text(ar ? school.addressAr : school.addressEn),
    'school.representative': ar
      ? schoolRepresentative(school.signatoryNameAr, school.signatoryTitleAr, language)
      : schoolRepresentative(school.signatoryNameEn, school.signatoryTitleEn, language),
    today: formatContractDate(source.today, language),
  };
}

/** The values with the salary fields taken out (null), for a reader who may not see the salary. */
export function withoutSalaryValues(values: ContractFieldValues): ContractFieldValues {
  const out = { ...values };
  for (const key of CONTRACT_SALARY_FIELDS) out[key] = null;
  return out;
}

/** The sample values of the Fields panel, per document language. */
export function sampleFieldValues(language: ContractLanguage, samples: Record<ContractFieldKey, { ar: string | null; en: string | null }>): ContractFieldValues {
  const out = {} as ContractFieldValues;
  for (const key of Object.keys(samples) as ContractFieldKey[]) out[key] = language === 'AR' ? samples[key].ar : samples[key].en;
  return out;
}
