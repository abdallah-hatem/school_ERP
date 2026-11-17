import { describe, expect, it } from 'vitest';
import ar from '@school-erp/shared/locales/ar/employees.json';
import en from '@school-erp/shared/locales/en/employees.json';
import { normalizeEgyptianMobile } from '@/shared/lib/phone';
import { employee, item, summary } from '../test/fixtures';
import {
  emptyEmployeeForm,
  employeeFormSchema,
  employeeToForm,
  fieldForError,
  formToUpdate,
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
    expect(managerOptions(candidates, 'en', 'None', 'self').map((o) => o.value)).toEqual([NO_MANAGER, 'ok']);
    const current = { id: 'boss', code: 'EMP-0009', nameEn: 'Boss', nameAr: 'م' };
    expect(managerOptions(candidates, 'en', 'None', 'self', current).map((o) => o.value)).toEqual([NO_MANAGER, 'ok', 'boss']);
  });

  it('Egyptian mobile: +20 normalised, 12th digit and bad prefix rejected', () => {
    expect(normalizeEgyptianMobile('+20 10 1234 5678')).toBe('01012345678');
    expect(normalizeEgyptianMobile('00201112345678')).toBe('01112345678');
    expect(normalizeEgyptianMobile('010123456789')).toBeNull();
    expect(normalizeEgyptianMobile('013')).toBeNull();
    expect(normalizeEgyptianMobile('01a')).toBeNull();
    expect(normalizeEgyptianMobile('')).toBe('');
  });
});

describe('list query in the URL', () => {
  it('drops unknown values and caps the page size at the API maximum', () => {
    expect(parseEmployeesQuery({ page: '-2', limit: '500', status: 'GONE', workSystem: 'PART_TIME_3', search: ' mona ' })).toEqual({
      page: 1,
      limit: 100,
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

describe('employees locale namespace', () => {
  it('English and Arabic have identical keys', () => {
    expect(keys(ar).sort()).toEqual(keys(en).sort());
  });
});
