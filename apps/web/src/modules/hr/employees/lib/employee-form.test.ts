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
  listOptions,
  managerOptions,
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
    expect(fieldForError('PAYROLL_APPROVED')).toBeUndefined();
  });

  it('pickers list visible items only, plus the employee’s own hidden one', () => {
    const items = [item('a', 'A', 'أ'), item('b', 'B', 'ب', false)];
    expect(listOptions(items, 'en').options.map((o) => o.value)).toEqual(['a']);
    const kept = listOptions(items, 'en', { id: 'b', nameEn: 'B', nameAr: 'ب' });
    expect(kept.options.map((o) => o.value)).toEqual(['a', 'b']);
    expect(kept.currentHidden).toBe(true);
  });

  it('manager options: never self, never inactive, keep the current manager', () => {
    const candidates = [
      summary({ id: 'self', code: 'EMP-0001', nameEn: 'Self', nameAr: 'س' }),
      summary({ id: 'x', code: 'EMP-0002', nameEn: 'Inactive', nameAr: 'غ', status: 'INACTIVE' }),
      summary({ id: 'ok', code: 'EMP-0003', nameEn: 'Active', nameAr: 'ن' }),
    ];
    const plain = managerOptions(candidates, 'en', 'None', 'self');
    expect(plain.options.map((o) => o.value)).toEqual([NO_MANAGER, 'ok']);
    expect(plain).toMatchObject({ currentNotManaging: false, hasCandidates: true });
    const current = { id: 'boss', code: 'EMP-0009', nameEn: 'Boss', nameAr: 'م', managesPeople: true };
    const kept = managerOptions(candidates, 'en', 'None', 'self', current);
    expect(kept.options.map((o) => o.value)).toEqual([NO_MANAGER, 'ok', 'boss']);
    expect(kept.currentNotManaging).toBe(false);
  });

  it('manager options: a current manager who no longer manages people is kept and flagged', () => {
    const current = { id: 'boss', code: 'EMP-0009', nameEn: 'Boss', nameAr: 'م', managesPeople: false };
    const result = managerOptions([], 'en', 'None', 'self', current);
    expect(result.options.map((o) => o.value)).toEqual([NO_MANAGER, 'boss']);
    expect(result).toMatchObject({ currentNotManaging: true, hasCandidates: false });
    // Searchable by name and code.
    expect(result.options[1]).toMatchObject({ label: 'Boss · EMP-0009', keywords: ['Boss', 'م', 'EMP-0009'] });
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
