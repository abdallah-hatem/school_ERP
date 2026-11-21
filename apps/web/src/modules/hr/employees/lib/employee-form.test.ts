import { describe, expect, it } from 'vitest';
import ar from '@school-erp/shared/locales/ar/employees.json';
import en from '@school-erp/shared/locales/en/employees.json';
import { acceptPhoneInput, isValidPhone } from '@/shared/lib/phone';
import { employee, item, summary } from '../test/fixtures';
import {
  emptyEmployeeForm,
  employeeFormSchema,
  employeeToForm,
  fieldForError,
  formToRequest,
  formToUpdate,
  graduationYears,
  managerChoice,
  NO_MANAGER,
} from './employee-form';
import { employeesQueryString, hasActiveFilters, parseEmployeesQuery } from './list-query';

function keys(tree: object, prefix = ''): string[] {
  return Object.entries(tree).flatMap(([k, v]) =>
    typeof v === 'object' && v !== null ? keys(v as object, `${prefix}${k}.`) : [`${prefix}${k}`],
  );
}

describe('employee form rules (§3)', () => {
  it('contract defaults to 1 June – 31 May of the current contract year', () => {
    expect(emptyEmployeeForm('2026-11-17')).toMatchObject({ contractStart: '2026-06-01', contractEnd: '2027-05-31' });
    expect(emptyEmployeeForm('2026-03-10')).toMatchObject({ contractStart: '2025-06-01', contractEnd: '2026-05-31' });
  });

  it('rejects a contract that ends on or before it starts, a 13-digit national ID and a future hire date', () => {
    const base = employeeToForm(employee);
    const issues = (values: object) =>
      employeeFormSchema.safeParse({ ...base, ...values }).error?.issues.map((i) => [i.path.join('.'), i.message]) ?? [];
    expect(issues({})).toEqual([]);
    expect(issues({ contractEnd: '2026-06-01' })).toEqual([['contractEnd', 'employees.errors.contractOrder']]);
    expect(issues({ nationalId: '2900101123456' })).toEqual([['nationalId', 'employees.errors.nationalId']]);
    expect(issues({ hireDate: '2999-01-01' })).toEqual([['hireDate', 'employees.errors.hireDateFuture']]);
    expect(issues({ basicSalary: 0 })).toEqual([['basicSalary', 'employees.errors.salaryPositive']]);
    // The monthly cap (owner 2026-11-19): EGP 1,000,000.00 is allowed, one piastre more is not.
    expect(issues({ basicSalary: 100_000_000 })).toEqual([]);
    expect(issues({ basicSalary: 100_000_001 })).toEqual([['basicSalary', 'employees.errors.salaryTooLarge']]);
  });

  it('N0 — the probation end is optional, on or after the hire date', () => {
    const base = employeeToForm(employee);
    const issues = (values: object) =>
      employeeFormSchema.safeParse({ ...base, ...values }).error?.issues.map((i) => [i.path.join('.'), i.message]) ?? [];
    expect(issues({ probationEnd: null })).toEqual([]);
    expect(issues({ probationEnd: base.hireDate })).toEqual([]);
    expect(issues({ probationEnd: '2020-08-31' })).toEqual([['probationEnd', 'employees.errors.probationBeforeHire']]);
    // A hire date moved past it (edge 6: the date doesn't follow) is caught before saving.
    expect(issues({ hireDate: '2021-01-01' })).toEqual([['probationEnd', 'employees.errors.probationBeforeHire']]);
  });

  it('N0 — a new employee starts with it empty (the API fills it); an edit sends a change or a clear', () => {
    expect(emptyEmployeeForm('2026-11-17').probationEnd).toBeNull();
    const initial = employeeToForm(employee);
    expect(initial.probationEnd).toBe('2020-11-30');
    expect(formToRequest(initial).probationEnd).toBe('2020-11-30');
    expect(formToUpdate({ ...initial, probationEnd: '2020-12-31' }, initial)).toEqual({ probationEnd: '2020-12-31' });
    expect(formToUpdate({ ...initial, probationEnd: null }, initial)).toEqual({ probationEnd: null });
    // A changed hire date doesn't send the probation end (edge 6).
    expect(formToUpdate({ ...initial, hireDate: '2020-10-01' }, initial)).toEqual({ hireDate: '2020-10-01' });
  });

  it('an edit sends only what changed; clearing an optional field sends null', () => {
    const initial = employeeToForm(employee);
    expect(formToUpdate(initial, initial)).toEqual({});
    expect(formToUpdate({ ...initial, fingerprintId: '  ', basicSalary: 1500000 }, initial)).toEqual({
      fingerprintId: null,
      basicSalary: 1500000,
    });
    expect(formToUpdate({ ...initial, managerId: 'e-omar' }, initial)).toEqual({ managerId: 'e-omar' });
    expect(formToUpdate(initial, { ...initial, managerId: 'e-omar' })).toEqual({ managerId: null });
  });

  it('server error codes that belong to a field', () => {
    expect(fieldForError('DUPLICATE_NATIONAL_ID')).toBe('nationalId');
    expect(fieldForError('MANAGER_LOOP')).toBe('managerId');
    expect(fieldForError('PROBATION_BEFORE_HIRE')).toBe('probationEnd');
    expect(fieldForError('PAYROLL_APPROVED')).toBeUndefined();
  });

  it('a manager choice reads "Name · code" in the page language (the API lists the candidates)', () => {
    const boss = { id: 'boss', code: 'EMP-0009', nameEn: 'Boss', nameAr: 'مدير' };
    expect(managerChoice(boss, 'en')).toEqual({ value: 'boss', label: 'Boss · EMP-0009' });
    expect(managerChoice(boss, 'ar')).toEqual({ value: 'boss', label: 'مدير · EMP-0009' });
  });

  it('phone: mobiles, landlines and international numbers pass; 7–20 characters', () => {
    for (const ok of ['01012345678', '0223456789', '+20 2 2345 6789', '(02) 2345-6789', '+44 20 7946 0958', '1234567']) {
      expect(isValidPhone(ok)).toBe(true);
    }
    for (const bad of ['123456', '123456789012345678901', '01012x45678', '+-() -----', '']) {
      expect(isValidPhone(bad)).toBe(false);
    }
    expect(acceptPhoneInput('+20 (2) 2345-6789')).toBe('+20 (2) 2345-6789');
    expect(acceptPhoneInput('0101a')).toBeNull();
    expect(acceptPhoneInput('1'.repeat(21))).toBeNull();
  });
});

describe('list query in the URL', () => {
  it('drops unknown values; the page size is always 12 (the card grid)', () => {
    expect(parseEmployeesQuery({ page: '-2', limit: '500', status: 'GONE', workSystem: 'PART_TIME_3', search: ' mona ' })).toEqual({
      page: 1,
      limit: 12,
      search: 'mona',
      departmentId: undefined,
      stageId: undefined,
      status: undefined,
      workSystem: 'PART_TIME_3',
    });
  });

  it('round-trips without defaults and knows when it is filtered', () => {
    const q = parseEmployeesQuery({ stageId: 's-kg', page: '2' });
    expect(employeesQueryString(q)).toBe('?stageId=s-kg&page=2');
    expect(employeesQueryString(parseEmployeesQuery({}))).toBe('');
    expect(hasActiveFilters(q)).toBe(true);
    expect(hasActiveFilters(parseEmployeesQuery({ page: '4' }))).toBe(false);
  });
});

describe('insurance, bank and qualification on the form (§3)', () => {
  const base = employeeToForm(employee);
  const issues = (values: object) =>
    employeeFormSchema.safeParse({ ...base, ...values }).error?.issues.map((i) => [i.path.join('.'), i.message]) ?? [];

  it('a new employee starts not insured with every detail empty', () => {
    expect(emptyEmployeeForm('2026-11-17')).toMatchObject({
      insuranceStatus: 'NOT_INSURED',
      insuranceNumber: '',
      insuranceRegistrationDate: null,
      insuredSalary: null,
      iban: '',
      highestDegree: '',
      graduationYear: '',
    });
  });

  it('insured needs the three details; a future registration date and a salary of 0 are refused', () => {
    expect(issues({ insuranceStatus: 'INSURED' })).toEqual([
      ['insuranceNumber', 'ui.form.required'],
      ['insuranceRegistrationDate', 'ui.form.required'],
      ['insuredSalary', 'ui.form.required'],
    ]);
    expect(
      issues({ insuranceStatus: 'INSURED', insuranceNumber: '1', insuranceRegistrationDate: '2999-01-01', insuredSalary: 0 }),
    ).toEqual([
      ['insuranceRegistrationDate', 'employees.errors.registrationDateFuture'],
      ['insuredSalary', 'employees.errors.insuredSalaryPositive'],
    ]);
  });

  it('IBAN, graduation year and the emergency phone use the shared rules', () => {
    expect(issues({ iban: 'EG1' })).toEqual([['iban', 'employees.errors.iban']]);
    expect(issues({ iban: 'EG38 0019 0005 0000 0000 2631 8000 2' })).toEqual([]);
    expect(issues({ graduationYear: '1949' })).toEqual([['graduationYear', 'employees.errors.graduationYear']]);
    expect(issues({ emergencyContactPhone: 'abc' })).toEqual([['emergencyContactPhone', 'employees.errors.phone']]);
  });

  it('not insured sends the details as null whatever the form held; text is trimmed, IBAN normalised', () => {
    const request = formToRequest({
      ...base,
      insuranceStatus: 'NOT_INSURED',
      insuranceNumber: '123',
      insuredSalary: 5,
      iban: ' eg38 0019 0005 0000 0000 2631 8000 2 ',
      bankName: '  CIB ',
      graduationYear: '2010',
      highestDegree: 'DIPLOMA',
    });
    expect(request).toMatchObject({
      insuranceNumber: null,
      insuranceRegistrationDate: null,
      insuredSalary: null,
      iban: 'EG380019000500000000263180002',
      bankName: 'CIB',
      graduationYear: 2010,
      highestDegree: 'DIPLOMA',
      major: null,
    });
  });

  it('graduation years run from this year down to 1950; a duplicate insurance number maps to its field', () => {
    const years = graduationYears('2026-11-18');
    expect(years[0]).toBe(2026);
    expect(years.at(-1)).toBe(1950);
    expect(years).toHaveLength(77);
    expect(fieldForError('DUPLICATE_INSURANCE_NUMBER')).toBe('insuranceNumber');
  });
});

describe('employees locale namespace', () => {
  it('English and Arabic have identical keys', () => {
    expect(keys(ar).sort()).toEqual(keys(en).sort());
  });
});
